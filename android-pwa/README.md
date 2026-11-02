# Android PWA entry point

This directory adds an installable Android-friendly PWA entry point without changing the existing web app. The wrapper loads `../index.html` in a full-screen same-origin frame, so it reuses the current app's HTML, JavaScript, CSS, and browser dictionary storage.

## Serve it

Serve the project root over HTTPS. For local development, `http://localhost` is a secure context for PWA testing. Open `/android-pwa/` in Chrome on Android and choose **Install app** or **Add to Home screen** from the browser menu.

The service worker caches the PWA shell and shared web app files for offline starts. Bump `CACHE_NAME` in `sw.js` when changing the cached shell version.

## Data

The web app and PWA use the same origin and the same browser dictionary key. This keeps the experience aligned within that browser profile. Local storage does not synchronize between different devices; use the web app's JSON export/import to transfer a dictionary.

To list this PWA in Google Play later, package its hosted URL as a Trusted Web Activity and set up Digital Asset Links for the domain.
