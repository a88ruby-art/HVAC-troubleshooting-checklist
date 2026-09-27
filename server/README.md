# Pre-Call AI server

A small Cloudflare Worker that lets your whole team use the AI check without sharing your Claude API key.

- Your Claude API key lives only on the server. Techs never see it.
- Each tech gets their own **team code**. Remove one person's code and only they lose access.
- Each tech is capped at 10 AI checks a minute, so a lost phone or a leaked code can't run up a big bill quickly.
- Only the Pre-Call app's website can call it from a browser.
- Logs record who ran a check, how long it took and the token counts. They never record the readings.

The instructions and answer format Claude gets live in [`../ai-prompt.js`](../ai-prompt.js), shared with the app.

## What you need

- A free [Cloudflare account](https://dash.cloudflare.com/sign-up). The free Workers plan covers 100,000 requests a day, far more than a team needs.
- A Claude API key from [console.anthropic.com](https://console.anthropic.com), with billing set up. Set a **monthly spend limit** there (Settings → Limits) so costs can't surprise you. A check usually costs a few cents.

## Set it up (in the browser, no command line)

1. **Create the Worker from GitHub.** In the Cloudflare dashboard go to **Workers & Pages → Create → Import a repository**, connect GitHub and pick `HVAC-troubleshooting-checklist`. Set **Path** (root directory) to `server` and leave the build and deploy commands as they are. Click **Deploy**.
2. **Add the two secrets.** Open the new `precall-ai` Worker → **Settings → Variables and Secrets → Add**, type **Secret**:
   - `ANTHROPIC_API_KEY`: your Claude API key.
   - `TEAM_CODES`: one `name:code` pair per tech, separated by commas, for example
     `sam:river-cable-42-otter,jo:amber-flute-17-maple`
     Make each code long and hard to guess (three or four random words plus a number works well). The name is only used in the logs.
3. **Copy the Worker's address.** It's shown on the Worker's page, like `https://precall-ai.yourname.workers.dev`. Open it in a browser and you should see `{"ok":true}`.
4. **Point the app at it.** In this repository, edit [`../config.js`](../config.js) and put that address in `aiServer`, then commit to `main`.
5. **Give each tech their code.** They open the app → **Profile → Team code** and paste it in.

From then on, every push to `main` redeploys the server automatically.

## Everyday changes

- **Add a tech:** add a `name:code` pair to `TEAM_CODES` and save. It takes effect in seconds.
- **Remove a tech:** delete their pair from `TEAM_CODES` and save.
- **See who's using it:** Worker → **Observability / Logs**.
- **Host the app somewhere else:** add that site's address to `ALLOWED_ORIGINS` in [`wrangler.toml`](wrangler.toml), comma-separated.
- **Change the per-tech limit:** edit `limit` under `[[ratelimits]]` in `wrangler.toml` (`period` can be 10 or 60 seconds).

## Using the command line instead

```sh
cd server
npm install
npx wrangler login
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put TEAM_CODES
```

To run it on your computer, create `server/.dev.vars` with `ANTHROPIC_API_KEY=…`, `TEAM_CODES=…` and `ALLOWED_ORIGINS=http://localhost:8000`, then `npm run dev`. `npm run typecheck` checks the code.

## The API

`POST /analyze` with `Authorization: Bearer <team code>` and `{"readings": "<text>"}` (up to 20,000 characters).
Success is `200 {"result": {...}, "model": "..."}`. Errors are `{"error": "<code>", "message": "<text to show the tech>"}`:

| Status | `error` | Meaning |
| --- | --- | --- |
| 400 | `bad_request` | Missing, empty or too-long readings |
| 401 | `bad_code` | Team code missing or not in `TEAM_CODES` |
| 403 | `origin_not_allowed` | Called from a site not in `ALLOWED_ORIGINS` |
| 422 | `refusal` | Claude declined to answer |
| 429 | `rate_limited` / `busy` | This tech's per-minute cap, or Claude is busy |
| 500 | `not_configured` | A secret hasn't been set |
| 502 | `server_key`, `upstream`, `truncated`, `bad_output` | Problem reaching Claude or reading its answer |
