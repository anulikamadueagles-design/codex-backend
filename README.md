# Codex backend

Real Express server + shared file-based database. Every visitor now sees the
same books, orders, ad confirmations, and subscription history — nothing is
per-device anymore.

## Run it (Termux or anywhere with Node)
```
npm install
npm start
```
Then open http://localhost:3000 — the frontend in `public/` is served
automatically and talks to the API in `server.js`.

## Deploy to Render (same flow as your other projects)
1. Push this folder to a new GitHub repo (`anulikamadueagles-design`).
2. On Render: New -> Web Service -> connect the repo.
3. Build command: `npm install`
4. Start command: `npm start`
5. Render gives you a public URL — that's your live site, shared by everyone.

## Note on the database
Right now it's a single `data.json` file on the server (simple and fast to
ship). That's fine for one Render instance, but Render's free tier disk
resets on redeploy, so data won't survive a redeploy or a paid-tier restart.
When you're ready, swap `loadDB`/`saveDB` in `server.js` for a real database
(Postgres, e.g. Render's free Postgres) — the API routes above it don't need
to change.
