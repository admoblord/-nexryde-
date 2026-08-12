# Cloudflare Workers Builds: `nexryde` — remove (dead weight)

## What it is

GitHub status check **`Workers Builds: nexryde`**, posted by the
**Cloudflare Workers and Pages** GitHub App. It is **not** part of
`.github/workflows/ci.yml`.

The unfinished autoconfig PR (#1 / branch `cloudflare/workers-autoconfig`)
would deploy static assets from legacy `admin/` HTML via Wrangler. That is
**not** the production admin (`admin-web` → Cloud Run `/admin/`) and **not**
on the rider/driver app path.

## Live user impact

**None.** Mobile apps and production API use Cloud Run
(`nexryde-backend` in `africa-south1`). A failing Workers Builds check does
not affect trips, maps, or payments.

## Remove (dashboard — agent cannot do this without CF credentials)

1. Cloudflare Dashboard → Workers & Pages → service **`nexryde`**
2. Disconnect GitHub / disable Workers Builds (or delete the Worker)
3. GitHub → Settings → Integrations → **Cloudflare Workers and Pages**
   → remove access for this repo (or uninstall)
4. Close PR #1 and delete branch `cloudflare/workers-autoconfig`
5. Confirm `Workers Builds: nexryde` no longer appears on new commits

Until removed, treat the check as noise: GitHub CI (hygiene / unit / lint)
is the merge gate for app/backend changes.
