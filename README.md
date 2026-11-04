# iPhone Duo 11230 Restock Radar

Live dashboard: https://iphone-duo-restock.vercel.app

## Monitoring configuration

- **Center:** Brooklyn, NY 11230
- **Radius:** 50 miles, using approximate ZIP-code center-to-center distances (not driving miles or exact store coordinates)
- **Areas:** NYC, Long Island, nearby New Jersey and Connecticut stores whose ZIP-code centroid is within 50 miles
- **Variants:** all eight iPhone Duo color/storage combinations
- **Schedule:** GitHub Actions is configured every five minutes (GitHub may delay or skip a run). Every run checks five core locations plus four rotating perimeter locations. Some nearby stores may be discovered less frequently or missed.
- **Alerts:** When Apple pickup availability changes to available, the bot requests the same location a second time, then emails the configured Gmail address with store, address when supplied by Apple, ZIP, estimated straight-line distance, configurations, and Apple purchase link. No checkout automation.
- **State:** Upstash Redis stores results and suppresses repeated alerts until two explicit unavailable observations.
- **Dashboard:** /api/stock shows recent observations for verified local stores; stale after 15 minutes. The page refreshes approximately every minute. If a store's location cannot be verified, it is excluded rather than falsely claiming it's within radius.

## Private production setup

Vercel environment variables (Production):
`CRON_SECRET`, `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`, `GMAIL_ADDRESS`, `GMAIL_APP_PASSWORD`. Optional: `EMAIL_TO`, `MAX_EMAILS_PER_DAY`.

GitHub repository Actions secrets:
`VERCEL_URL` (e.g. `https://iphone-duo-restock.vercel.app`), `CRON_SECRET` (same exact secret as Vercel).

**Never commit any secret to GitHub.** Redeploy Vercel after editing production variables.

## Operations

1. Visit the [inventory-check workflow](https://github.com/jakepard/iphone-duo-restock/actions/workflows/poll.yml).
2. Select **Run workflow** with `test_email` unchecked for an immediate actual scan.
3. Inspect the run's **Call protected Vercel scanner** output for `checks`, `errors`, `nearbyStores`, and `alerts`. The workflow is successful only if the endpoint returned an HTTP 2xx response; a result with `status:partial` can still have some inventory errors.
4. Check the dashboard for local stores and last scanner run. To verify ongoing monitoring, look for runs with the `schedule` event in Actions.
5. Select `test_email` checked to verify Gmail delivery without waiting for a real restock.
6. Check Vercel runtime logs if scan responses show errors; Apple may throttle or change its undocumented inventory API.

## Running tests

`npm install && npm test`

## Important limitations

This bot is a best-effort monitor, not a real-time stock guarantee. The Apple pickup interface is undocumented and subject to change. ZIP centroid distances are approximate and can differ from actual physical store distance. Store pickup is never reserved. GitHub Actions schedule isn't guaranteed to fire on time, and the free Vercel Hobby plan is personal/non-commercial; verify rights to the data and move to a commercial-capable hosting plan and authorized inventory source before offering subscriptions.

