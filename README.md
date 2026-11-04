# iPhone Duo Restock Radar

Personal US Apple Store pickup-monitoring bot with NY/NJ priority, Gmail alerts, and a live dashboard.

[Dashboard](https://iphone-duo-restock.vercel.app) · [GitHub Actions](https://github.com/jakepard/iphone-duo-restock/actions/workflows/poll.yml)

## Deployment and credentials

This repository is linked to a Vercel project. Set the following environment variables on Vercel, production scope: `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`, `CRON_SECRET`. In GitHub Actions repository secrets, set `VERCEL_URL` to your production domain and `CRON_SECRET` to the same value used in Vercel. Never commit credentials.

The GitHub Actions workflow calls the protected inventory API on a 5-minute schedule (execution may be delayed). Each scanner batch rotates through US search seeds, with priority given to NY and NJ. The endpoint uses `Authorization: Bearer <CRON_SECRET>`. Test email dispatch using the GitHub Actions workflow with `test_email` enabled, or run an inventory scan without it. The inventory feed is read-only.

## Tests

Run `npm install && npm test` locally. Tests do not guarantee Apple availability access or real-time checkout availability.

## Live inventory dashboard

The public dashboard at the production domain now shows observed US stores, individual model/color/storage combinations, last-check timestamps, regional filters, and links to Apple's shop. `GET /api/stock` returns the same sanitized public data; no credentials or subscriber addresses are included.

**Freshness:** Availability information older than 30 minutes is always marked stale. Existing observations from older bot versions have no SKU observation timestamps, so they initially show as `Not checked` until the new scanner runs. A newer unavailable observation never becomes “available.” Apple pickup values are only observed signals: they do not promise that a product can still be ordered when a customer clicks.

**Potential commercial service:** Vercel Hobby is not for commercial operation, and independently gathering or reselling Apple's website inventory may require permission or a licensed stock-data feed. Verify authorized use and choose paid commercial-capable infrastructure before selling subscriptions. This project does not include customer accounts, billing, or production subscription security.
