# Always-on stock monitoring worker

This optional worker keeps your existing Vercel dashboard, Upstash data, and Gmail email delivery. It runs continuously on a small server rather than relying on GitHub's five-minute scheduler.

**Important:** The current pickup adapter uses Apple's undocumented website endpoint. Apple's website terms restrict automated monitoring. Obtain authorization or use a licensed inventory feed before running high-frequency checks. Requests may be throttled or denied. The intervals below are scheduler capabilities, not guaranteed Apple inventory access.

## How it runs

- Starts one full 50-mile/11230 scan, then checks the nearest ZIP 11230 repeatedly.
- By default aims for a hotspot scan every 30 seconds and a full-area scan every 120 seconds. A full-area scan can take longer, temporarily delaying the hotspot checks.
- Confirms availability with a second check, then calls the **private Vercel alert relay over HTTPS** immediately. Vercel delivers Gmail so SMTP does not need to work on the VPS.
- Uses a memory cache for hot inventory checks, syncing results to Upstash every 60 seconds or immediately after an alert. Pauses are checked through Upstash with a 5-second cache.
- Backs off automatically on 403/429, scan errors, or a service pause.
- Uses the same pause/resume workflow as the existing bot.

## Deploy to a VPS

A basic 1GB Ubuntu VPS is recommended. DigitalOcean has a $6/month 1GB Basic Droplet and a $4/month 512MB option, before taxes or optional backups. No provider has been provisioned yet.

1. Create a small Ubuntu VPS in US East with Docker Engine and Docker Compose installed.
2. Clone this repository and copy `worker/.env.example` to `worker/.env` on the server:
   ```bash
   git clone https://github.com/jakepard/iphone-duo-restock.git
   cd iphone-duo-restock
   cp worker/.env.example worker/.env
   nano worker/.env
   ```
3. Add the **same Upstash REST URL/token** currently in Vercel, and set `ALERT_RELAY_SECRET` to the same `CRON_SECRET` already in Vercel. The relay URL is `https://iphone-duo-restock.vercel.app`. Do not paste the secrets into chat or commit them to GitHub.
4. Verify the Vercel deployment contains `api/notify.js` and can send email, then **disable the existing GitHub scheduled stock-check workflow** via GitHub → Actions → Check iPhone Duo stock near 11230 → ⋯ → Disable workflow. Leave the email test and pause/resume workflows enabled. Do this before starting the worker to prevent conflicting writes.
5. Start the worker from repository root:
   ```bash
   docker compose -f worker/compose.yml up -d --build
   docker compose -f worker/compose.yml logs -f --tail=40
   ```
6. Confirm a log record reports `event:"scan"` with `mode:"full"` and inventory errors zero; confirm the [dashboard](https://iphone-duo-restock.vercel.app) updates. Use GitHub's manual email test to verify notifications.

## Settings

```dotenv
HOTSPOT_INTERVAL_SECONDS=30
FULL_RADIUS_INTERVAL_SECONDS=120
DASHBOARD_SYNC_SECONDS=60
```

Values are in seconds. Lowering the interval increases requests, but it **does not guarantee faster stock detection**; rate limits, network time, provider policies, missed schedules and confirmation checks still affect delays. Do not use an interval that violates your source's permitted rate.

To stop: `docker compose -f worker/compose.yml down`.

To update: `git pull && docker compose -f worker/compose.yml up -d --build`.

The worker is not currently running. It will start only after you provision the VPS and configure it.
