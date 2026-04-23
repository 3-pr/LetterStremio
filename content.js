/**
 * LetterStremio — Content Script v1.2
 * Injects a "Watch on Stremio" button on Letterboxd film pages.
 *
 * Deep Link Format (requires both id AND videoId):
 *   Movies:  stremio:///detail/movie/{imdb_id}/{imdb_id}
 *   Series:  stremio:///detail/series/{imdb_id}/{imdb_id}
 *
 * IMDb ID Extraction Strategy:
 *   1. Find anchor tag linking to imdb.com in the current page DOM
 *   2. Parse JSON-LD structured data
 *   3. Fetch the film's /details/ AJAX tab
 *   4. Use Stremio's Cinemeta API to search by film name + year (most reliable)
 */

(() => {
  "use strict";

  const BUTTON_ID = "letterstremio-watch-btn";
  const CONTAINER_ID = "letterstremio-container";
  const CINEMETA_BASE = "https://v3-cinemeta.strem.io";

  // ─── URL & Page Helpers ────────────────────────────────────────────

  /**
   * Extract the film slug from the current URL.
   * Handles /film/slug/ and /username/film/slug/ patterns.
   */
  function getFilmSlug() {
    const match = window.location.pathname.match(/\/film\/([^\/]+)/);
    return match ? match[1] : null;
  }

  function isFilmPage() {
    return /\/film\//.test(window.location.pathname);
  }

  // ─── Film Metadata Extraction ──────────────────────────────────────

  /**
   * Extract the film title from the Letterboxd page.
   */
  function getFilmTitle() {
    // Try the main heading first
    const h1 = document.querySelector(
      ".headline-1 .name, h1.headline-2 a, h1.headline-2, .film-title-wrapper h1, h2.headline-2 a"
    );
    if (h1) {
      const text = h1.textContent.trim();
      if (text) return text;
    }

    // Try JSON-LD
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.name) return data.name;
      } catch (_) {}
    }

    // Try OG title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      // Strip " directed by ..." or " (year)" suffixes
      let title = ogTitle.content;
      title = title.replace(/\s+directed by\s+.*/i, "");
      title = title.replace(/\s*\(\d{4}\)\s*$/, "");
      return title.trim();
    }

    // Last resort: page title
    const pageTitle = document.title;
    // Format: "‎Film Name (Year) directed by Director • Letterboxd"
    const titleMatch = pageTitle.match(/^[‎\s]*(.+?)\s*\(\d{4}\)/);
    if (titleMatch) return titleMatch[1].trim();

    return null;
  }

  /**
   * Extract the film year from the Letterboxd page.
   */
  function getFilmYear() {
    // Try the year link on the page
    const yearLink = document.querySelector(
      'a[href*="/films/year/"], .film-title-wrapper small a, small.number a'
    );
    if (yearLink) {
      const match = yearLink.textContent.match(/(\d{4})/);
      if (match) return match[1];
    }

    // Try JSON-LD
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data.datePublished) {
          const match = data.datePublished.match(/(\d{4})/);
          if (match) return match[1];
        }
        if (data.releasedEvent) {
          const match = JSON.stringify(data.releasedEvent).match(/(\d{4})/);
          if (match) return match[1];
        }
      } catch (_) {}
    }

    // Try page title: "Film Name (2008) directed by ..."
    const titleMatch = document.title.match(/\((\d{4})\)/);
    if (titleMatch) return titleMatch[1];

    // Try OG description or any text
    const ogDesc = document.querySelector('meta[property="og:title"]');
    if (ogDesc) {
      const match = ogDesc.content.match(/\((\d{4})\)/);
      if (match) return match[1];
    }

    return null;
  }

  // ─── IMDb ID Extraction ────────────────────────────────────────────

  /**
   * Find IMDb ID in DOM links.
   */
  function findImdbInDom(root) {
    const links = root.querySelectorAll('a[href*="imdb.com"]');
    for (const link of links) {
      const match = link.href.match(/(tt\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  /**
   * Find IMDb ID in JSON-LD structured data.
   */
  function findImdbInJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const id = searchObjForImdb(data);
        if (id) return id;
      } catch (_) {}
    }
    return null;
  }

  function searchObjForImdb(obj) {
    if (!obj || typeof obj !== "object") return null;
    if (obj.sameAs) {
      const urls = Array.isArray(obj.sameAs) ? obj.sameAs : [obj.sameAs];
      for (const url of urls) {
        if (typeof url === "string") {
          const m = url.match(/imdb\.com\/title\/(tt\d+)/);
          if (m) return m[1];
        }
      }
    }
    if (typeof obj.url === "string" && obj.url.includes("imdb.com")) {
      const m = obj.url.match(/(tt\d+)/);
      if (m) return m[1];
    }
    for (const key of Object.keys(obj)) {
      if (typeof obj[key] === "object") {
        const r = searchObjForImdb(obj[key]);
        if (r) return r;
      }
    }
    return null;
  }

  /**
   * Fetch the film's /details/ page (AJAX tab) and extract IMDb link.
   */
  async function fetchImdbFromDetails(slug) {
    try {
      const res = await fetch(`https://letterboxd.com/film/${slug}/details/`, {
        credentials: "same-origin",
        headers: { "X-Requested-With": "XMLHttpRequest" },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      return findImdbInDom(doc);
    } catch (_) {
      return null;
    }
  }

  /**
   * Use Stremio's Cinemeta API to find IMDb ID by film name.
   * This is the most reliable fallback.
   */
  async function fetchImdbFromCinemeta(title, year, type) {
    if (!title) return null;

    const searchTypes = type === "series" ? ["series", "movie"] : ["movie", "series"];

    for (const t of searchTypes) {
      try {
        const query = encodeURIComponent(title);
        const url = `${CINEMETA_BASE}/catalog/${t}/top/search=${query}.json`;
        const res = await fetch(url);
        if (!res.ok) continue;

        const data = await res.json();
        if (!data.metas || data.metas.length === 0) continue;

        // If we have a year, try to find exact match first
        if (year) {
          const exactMatch = data.metas.find(
            (m) =>
              m.name.toLowerCase() === title.toLowerCase() &&
              m.releaseInfo === year
          );
          if (exactMatch) return exactMatch.imdb_id || exactMatch.id;
        }

        // Try name-only match
        const nameMatch = data.metas.find(
          (m) => m.name.toLowerCase() === title.toLowerCase()
        );
        if (nameMatch) return nameMatch.imdb_id || nameMatch.id;

        // Fall back to the first result if it's a close match
        const first = data.metas[0];
        if (first && first.name.toLowerCase().includes(title.toLowerCase())) {
          return first.imdb_id || first.id;
        }
      } catch (_) {}
    }

    return null;
  }

  /**
   * Master extraction function — tries all strategies.
   */
  async function extractImdbId(contentType) {
    const slug = getFilmSlug();
    const title = getFilmTitle();
    const year = getFilmYear();

    // Strategy 1: Current page DOM
    let id = findImdbInDom(document);
    if (id) return id;

    // Strategy 2: JSON-LD
    id = findImdbInJsonLd();
    if (id) return id;

    // Strategy 3: Fetch /details/ page
    if (slug) {
      id = await fetchImdbFromDetails(slug);
      if (id) return id;
    }

    // Strategy 4: Cinemeta API (most reliable for any page)
    id = await fetchImdbFromCinemeta(title, year, contentType);
    if (id) return id;

    return null;
  }

  // ─── Content Type Detection ────────────────────────────────────────

  function detectContentType() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        const type = data["@type"];
        if (type === "TVSeries" || type === "TVMiniSeries" || type === "TVSeason") {
          return "series";
        }
      } catch (_) {}
    }

    // Check page text for series indicators
    const pageText = document.title + " " + (document.querySelector("body")?.textContent?.substring(0, 2000) || "");
    if (/\b(TV\s*Series|TV\s*Mini[- ]?Series|Mini[- ]?Series)\b/i.test(pageText)) {
      return "series";
    }

    return "movie";
  }

  // ─── Button Creation & Injection ───────────────────────────────────

  function createButtonElement() {
    const container = document.createElement("div");
    container.id = CONTAINER_ID;

    const button = document.createElement("a");
    button.id = BUTTON_ID;
    button.className = "letterstremio-btn letterstremio-loading";
    button.title = "Finding film on Stremio...";

    const playIcon = `<svg class="letterstremio-icon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11.04-6.86a1 1 0 0 0 0-1.72L9.5 4.28a1 1 0 0 0-1.5.86z" fill="currentColor"/>
    </svg>`;

    button.innerHTML = `${playIcon}<span class="letterstremio-label">Finding film...</span>`;

    // Prevent click during loading
    button.addEventListener("click", (e) => {
      if (button.classList.contains("letterstremio-loading") ||
          button.classList.contains("letterstremio-disabled")) {
        e.preventDefault();
      }
    });

    container.appendChild(button);
    return container;
  }

  function findInjectionPoint() {
    const selectors = [
      { sel: ".js-watch-panel, .watch-panel, .panel-watch", pos: "afterend" },
      { sel: "ul.js-actions-panel", pos: "beforebegin" },
      { sel: ".film-header-lockup, section.film-header-group", pos: "afterend" },
      { sel: ".sidebar, section.section-sidebar, #sidebar, aside", pos: "afterbegin" },
      { sel: ".review-tile, .film-detail-content, .body-text", pos: "beforebegin" },
      { sel: "h1, .headline-1, .headline-2", pos: "afterend" },
    ];

    for (const { sel, pos } of selectors) {
      const el = document.querySelector(sel);
      if (el) return { element: el, position: pos };
    }
    return null;
  }

  async function injectButton() {
    if (document.getElementById(CONTAINER_ID)) return;
    if (!isFilmPage()) return;

    const injection = findInjectionPoint();
    if (!injection) {
      setTimeout(injectButton, 500);
      return;
    }

    const contentType = detectContentType();
    const container = createButtonElement();
    injection.element.insertAdjacentElement(injection.position, container);

    const button = document.getElementById(BUTTON_ID);
    const label = button?.querySelector(".letterstremio-label");

    try {
      const imdbId = await extractImdbId(contentType);

      if (!button) return; // Button was removed during fetch

      button.classList.remove("letterstremio-loading");

      if (imdbId) {
        // Open directly in Stremio desktop app
        button.href = `stremio:///detail/${contentType}/${imdbId}/${imdbId}`;
        button.title = `Open in Stremio (${imdbId})`;
        if (label) label.textContent = "Watch on Stremio";
      } else {
        button.classList.add("letterstremio-disabled");
        button.title = "IMDb ID not found";
        if (label) label.textContent = "Watch on Stremio";
      }
    } catch (err) {
      if (button) {
        button.classList.remove("letterstremio-loading");
        button.classList.add("letterstremio-disabled");
        button.title = "Error finding film";
        if (label) label.textContent = "Watch on Stremio";
      }
    }
  }

  // ─── Navigation Handling ───────────────────────────────────────────

  let lastUrl = window.location.href;

  function handleNavigation() {
    const currentUrl = window.location.href;
    if (currentUrl !== lastUrl) {
      lastUrl = currentUrl;
      const existing = document.getElementById(CONTAINER_ID);
      if (existing) existing.remove();
      if (isFilmPage()) setTimeout(injectButton, 300);
    }
  }

  const observer = new MutationObserver(() => {
    handleNavigation();
    if (isFilmPage() && !document.getElementById(CONTAINER_ID)) {
      injectButton();
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("popstate", () => setTimeout(handleNavigation, 200));

  // ─── Initial Run ──────────────────────────────────────────────────

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", injectButton);
  } else {
    injectButton();
  }
})();
