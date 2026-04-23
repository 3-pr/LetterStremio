# LetterStremio

> A Chrome extension that adds a **"Watch on Stremio"** button to every film and TV show page on [Letterboxd](https://letterboxd.com).

![Chrome Extension](https://img.shields.io/badge/Manifest-V3-blue) ![Letterboxd](https://img.shields.io/badge/Letterboxd-Compatible-green)

---

## ✨ Features

- 🎬 Injects a **"▶ Watch on Stremio"** button into the Letterboxd film sidebar
- 🔗 Opens content directly in the **Stremio desktop app** via deep link
- 🎯 Automatically finds the **IMDb ID** using Stremio's Cinemeta API
- 📺 Distinguishes between **Movies** and **TV Series** for correct linking
- 🔄 Handles **AJAX navigation** — button re-injects when browsing between films
- 🎨 Matches Letterboxd's **dark theme** aesthetic with Stremio purple (#8A6EAF)

---

## 📦 Installation

1. **Download** or clone this repository
2. Open Chrome and go to `chrome://extensions/`
3. Enable **Developer mode** (toggle in the top-right corner)
4. Click **"Load unpacked"**
5. Select the `LetterStremio` folder
6. Visit any film page on [letterboxd.com](https://letterboxd.com) — e.g., [The Dark Knight](https://letterboxd.com/film/the-dark-knight/)

> **Note:** You must have [Stremio](https://www.stremio.com/) installed on your computer for the deep link to work.

---

## 🔧 How It Works

### IMDb ID Extraction

The extension uses a **multi-tier strategy** to find the IMDb ID:

| Priority | Method | Description |
|----------|--------|-------------|
| 1️⃣ | **Anchor tag** | Finds `<a href="...imdb.com/title/ttXXXXXXX...">` in the page |
| 2️⃣ | **JSON-LD** | Parses `<script type="application/ld+json">` for `sameAs` or `url` fields pointing to IMDb |
| 3️⃣ | **Details page** | Fetches the film's `/details/` AJAX tab to find the IMDb link |
| 4️⃣ | **Cinemeta API** | Uses Stremio's own API to search by film name + year (most reliable) |

### Stremio Deep Link

Once the IMDb ID is found, the button opens:

```
Movies:  stremio:///detail/movie/{imdb_id}/{imdb_id}
Series:  stremio:///detail/series/{imdb_id}/{imdb_id}
```

### Dynamic Navigation

Letterboxd uses AJAX/pushState for navigation between pages. The extension:
- Uses a **MutationObserver** to detect DOM changes
- Listens for **popstate** events (back/forward navigation)
- Removes and re-injects the button cleanly on each navigation
- Includes duplicate detection — never injects the button twice

---

## 📁 File Structure

```
LetterStremio/
├── manifest.json      # Extension manifest (Manifest V3)
├── content.js         # Main content script — extraction + injection
├── styles.css         # Button styling (dark theme)
├── background.js      # Minimal service worker
├── icons/
│   ├── icon16.png     # Toolbar icon (16×16)
│   ├── icon48.png     # Extension page icon (48×48)
│   └── icon128.png    # Chrome Web Store icon (128×128)
└── README.md          # This file
```

---

## 🎨 Button States

| State | Appearance |
|-------|-----------|
| **Loading** | Pulsing purple — finding film info |
| **Active** | Purple (#8A6EAF) button with white text — links to Stremio |
| **Hover** | Lighter purple with subtle glow effect |
| **Disabled** | Gray button with tooltip: "IMDb ID not found" |

---

## ⚙️ Requirements

- **Google Chrome** (or any Chromium-based browser)
- **Stremio Desktop App** installed ([download](https://www.stremio.com/downloads))

---

## 🔒 Privacy

This extension:
- Does **NOT** collect any user data
- Does **NOT** require sign-in
- Only runs on `letterboxd.com`
- Only contacts `v3-cinemeta.strem.io` (Stremio's public API) to match film names

---

## 📬 Contact

For more Stremio tips, tutorials, and tools — follow me on Twitter/X:

**[@i0zzw](https://twitter.com/i0zzw)**

---

## 📝 License

MIT — free to use, modify, and distribute.
