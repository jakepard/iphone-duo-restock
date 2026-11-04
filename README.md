# iPhone Duo Restock Radar

Personal, free-tier Apple pickup availability tracker with **NY/NJ priority**, nationwide US checks, **every color / storage variant**, grouped Gmail email alerts, and a public read-only status dashboard. No purchasing or checkout automation.

**Status:** This repository contains the app code. It will not send alerts until Vercel, Upstash, Gmail and GitHub Actions have been configured and a test check succeeds.

## Setup on your iPhone

1. Import this GitHub repository to **Vercel Hobby** at https://vercel.com/new. Use the repository root, preset **Other** / no framework. The production URL is shown after deploying.
2. Create a free Redis database at https://console.upstash.com/redis. Copy the **REST URL** and **REST token** to a private place. Never put credentials in public GitHub files.
3. For Gmail, enable two-step verification and generate a **Google App Password** at https://myaccount.google.com/apppasswords. This is separate from your normal Google password.
4. In **Vercel → Project → Settings → Environment Variables**, configure the following for **Production** and redeploy:
   - `CRON_SECRET`: a random secret of at least 24 characters, generated with your password manager
   - `UPSTASH_REDIS_REST_URL`: the Redis REST URL
   - `UPSTASH_REDIS_REST_TOKEN`: the Redis REST token
   - `GMAIL_ADDRESS`: the Gmail address sending alerts
   - `GMAIL_APP_PASSWORD`: Gmail App Password
   - `EMAIL_TO` (optional): recipient; defaults to the Gmail sender
5. In **GitHub → Repository → Settings → Secrets and variables → Actions**, create two repository secrets:
   - `VERCEL_URL`: your production deployment URL (for example, `https://iphone-duo-restock.vercel.app`; do not add a path)
   - `CRON_SECRET`: **exactly the same secret** as in Vercel
6. Go to **GitHub → Actions → iPhone Duo inventory checks**, enable if asked, then choose **Run workflow**. First run with `test_email` enabled to verify delivery. Run again with it disabled to test an actual inventory scan.
7. Visit the production dashboard to check last scan, errors, and discovered stores. Configure email notifications on your iPhone if desired.

## Scheduling and limits

Vercel Hobby cron does not provide five-minute scans, so GitHub Actions invokes the secured Vercel endpoint on a five-minute schedule. GitHub may delay or skip jobs. Each job checks ten priority NY/NJ seeds and twelve nationwide seeds; those seeds cycle, so **an individual location will generally be checked much less often than every five minutes**. Overlapping regional inventory responses may cover extra stores. It does not guarantee every store is checked or that every restock is captured.

Inventory is rechecked before sending email. Repeated alerts remain suppressed until a store/SKU has been observed explicitly unavailable twice. Errors and unknown statuses are not treated as sold out. A daily email cap (default 20) limits spam. API providers may reject automated requests. This depends on an undocumented Apple endpoint and can stop working if Apple's service changes.

## API

- `/`: public read-only status UI
- `GET /api/status`: public scan statistics (no secrets)
- `POST /api/check`: requires `Authorization: Bearer <CRON_SECRET>`
- `POST /api/check?test=email`: sends one test message (also authenticated)

**Security:** Never commit a `.env` file, App Password, Redis token, or the cron secret. Configure them only in private environment or repository-secret settings.

## Tests

Run `npm install && npm test`. Tests use mocked Apple responses. Passing tests does not prove Apple stock checks or Gmail delivery are working on the deployed site.

## Notes

Vercel Hobby usage is for eligible personal/noncommercial projects. GitHub scheduled jobs on public repos may be disabled after a prolonged period of inactivity. Free Upstash and Gmail limits also apply.

Links: [Vercel](https://vercel.com), [Upstash](https://upstash.com), [Google App Passwords](https://support.google.com/accounts/answer/185833), [GitHub scheduling](https://docs.github.com/actions/using-workflows/events-that-trigger-workflows#schedule).
