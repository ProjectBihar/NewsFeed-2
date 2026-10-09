# Newsfeed PWA

The public interface serves the supplied `P22Mackinac-Book.woff2` from `/fonts/`. The Book face is used for public text; Mukta remains the Devanagari fallback. Admin retains its existing stylesheet.

`/manifest.webmanifest` identifies the app as PrōjectBihar Newsfeed, opens `/` in standalone mode and supplies regular and maskable PNG icons. The footer provides installation controls and instructions for Safari and browsers that do not expose a programmatic install prompt. Installation is offered only on request; no push subscription or notification permission is requested.

`/sw.js` registers on public pages in production. Its cache contains only the static offline screen, local font and four icons. It fetches public document navigations from the network and falls back to the offline screen if the connection fails. News HTML, React navigation payloads, APIs, admin pages and authenticated responses are never added to this cache. The seven-day timeline always comes from the server. Offline reading of saved news is not provided.

The worker is served with `no-store` and checks for updates normally. Increment `CACHE_NAME` when changing any precached asset. Activation removes only older caches with the `pb-newsfeed-offline-` prefix. It does not clear unrelated browser data.

Run `npm run pwa:icons` to regenerate the icons from the local Book font. After `npm run build`, start the production server on port 3102 and run `npm run check:pwa`. Set `BASE_URL` to check another deployment. This verifies the font bytes, icon dimensions, Chromium installability, worker control, cache exclusions, offline public navigation, denied admin access and online recovery. CI runs the same checks against a production build without database credentials.
