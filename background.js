/**
 * LetterStremio — Background Service Worker (Manifest V3)
 *
 * Minimal service worker. Currently only logs installation.
 * Future enhancement: could handle context menus or badge updates.
 */

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    console.log("LetterStremio installed successfully.");
  } else if (details.reason === "update") {
    console.log(`LetterStremio updated to v${chrome.runtime.getManifest().version}`);
  }
});
