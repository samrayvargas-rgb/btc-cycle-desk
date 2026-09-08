# BTC Cycle Desk

Static site. Open `index.html` or host the folder.

## Local
Open `index.html` in a browser.
If price/RP stay blank, serve the folder instead of using file://

```
npx serve .
```

Then visit the URL it prints (usually http://localhost:3000).

## GitHub Pages
1. Create a new GitHub repo.
2. Upload `index.html`, `styles.css`, `app.js` to the repo root (or `/docs`).
3. Repo Settings → Pages → Deploy from branch → `main` / root (or `/docs`).
4. Site URL: `https://YOURUSER.github.io/REPO/`

## Netlify Drop (fastest, no git)
1. Go to https://app.netlify.com/drop
2. Drag this whole folder onto the page.
3. You get a live `https://random-name.netlify.app` URL.
4. Change the name under Site settings.

## Cloudflare Pages
1. https://pages.cloudflare.com
2. Upload the folder or connect the GitHub repo.
3. Build command: leave empty. Output directory: `/`

Price comes from CoinGecko. Realized price / MVRV from bitcoin-data.com. Clock and power law run in the browser with no key.
