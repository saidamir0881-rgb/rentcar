# Vercel

Import the GitHub repository with the repository root as Root Directory (leave it empty / `.`). Framework Preset is **Express**. Node.js is pinned to **22.x**. Leave Build Command and Output Directory at their defaults; do not set the root to `rentcar-site` or use the Cloudflare Worker output on Vercel.

In Project → Settings → Environment Variables, configure these names for Production and Preview:

- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_PUBLISHABLE_KEY`

Use the values from your local `.env`. The `.env` file itself is intentionally absent from GitHub. The secret key must remain a server environment variable. `PORT` is unnecessary on Vercel.

Redeploy after changing environment values. A connected GitHub repository normally triggers a fresh deployment after a push to `main`. If it does not, select Deployments → Redeploy for the latest commit.

`server.js` exports the Express application directly. The test factory is attached as `createApp`; importing the application does not open a listening socket. In Vercel, configuration comes from environment variables rather than reading `.env`.

`vercel.json` includes the site's HTML, CSS, JavaScript, images and Web API modules in the function bundle. Requests forwarded by Vercel preserve HTTPS, so browser Origin checks and Secure session cookies work.

Check `/` and `/admin` for HTML, `/api/rentals` for the catalog and `/api/me` for `401` when signed out. A `503` response mentioning Supabase settings means the three environment variables have not been configured; it is different from a `FUNCTION_INVOCATION_FAILED` startup failure.

Reference: https://vercel.com/docs/frameworks/backend/express
