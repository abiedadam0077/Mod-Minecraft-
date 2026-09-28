# Craftly 1.4 — Hybrid Content Hub: deployment and permissions

## What is shipped vs what is live

The two APKs contain the new voxel-C icon, latest-five carousel, paged hybrid catalog client, expanded manual editor and Content Sources UI. The repository contains a tested additive PostgreSQL migration, a Supabase Edge Function and a scheduled-sync installer.

**The external aggregator has NOT been deployed to the owner's live Supabase project in this session. No external API keys or source permissions were supplied. No live external catalog was imported.** Existing accounts and original manual file uploads continue working against the previous schema. Content Sources explicitly reports missing configuration rather than pretending to be connected. Extended manual fields require the new migration.

There is no Render server or new paid hosting dependency. Supabase's existing free quotas apply; Cron, Edge Function, storage and egress availability/quotas must be checked in your project. This is not unlimited hosting.

## Legal gate — especially CurseForge

Reviewed official sources:
- [CurseForge API application](https://support.curseforge.com/support/solutions/articles/9000208346-about-the-curseforge-api-and-how-to-apply-for-a-key): applications are reviewed and receive a non-transferable key.
- [CurseForge third-party API terms](https://support.curseforge.com/support/solutions/articles/9000207405-curse-forge-3rd-party-api-terms-and-conditions), section 2 restrictions: the ordinary terms expressly prohibit saving or caching API/SDK data.
- [Official REST documentation](https://docs.curseforge.com/rest-api/): game lookup, bounded mod search and metadata schemas.

**A CurseForge API key alone does not permit this database-backed aggregator.** The adapter stays disabled without a separately obtained written exception permitting metadata storage/cache and the intended use of artwork. Do not configure a fictional permission reference. Review current terms and obtain the actual rightsholder/platform permission before enabling it. If permission is refused, leave CurseForge disabled; do not scrape or use unofficial proxy APIs.

The second adapter is an **approved creator-owned JSON feed**, not a scraper for unspecified sites. Its operator must own or be authorized to grant the metadata/artwork permissions. Each item also declares Bedrock edition, metadata display/cache permission and license information. Public availability is not a license. Both adapters import metadata only and always send users to the original project page; no packages are fetched, copied, mirrored or proxied. Unknown source ratings/download counts are not invented. No Java/Forge project is deliberately imported.

## Deploy to your existing Supabase project

Back up the database first. Do not recreate accounts or repeat the old admin setup.

1. In SQL Editor, run **only** `supabase/migrations/202609280001_hybrid_catalog.sql` on top of the existing original schema. It is repeatable and retains manual rows, IDs, favorites, ratings, account roles and storage paths. `source_type` defaults to `manual` for all old rows. Do not rerun the old setup script after this migration (it restores older RLS policies).
2. Deploy the Edge Function from a machine authenticated with your own Supabase account:
   ```sh
   supabase link --project-ref vvypjqmskdtajkeogzmu
   supabase functions deploy content-hub --no-verify-jwt
   ```
   `--no-verify-jwt` is intentional: the handler itself calls Supabase `auth.getUser()` and checks the database admin role for owner actions. Scheduled calls require a separate private secret. Unauthenticated source changes are rejected. The service-role key is automatically available **inside** the hosted function only; never place it in the frontend.
3. Configure secrets in **Supabase Dashboard → Edge Functions → Secrets**, not chat, Git, APKs or frontend variables:

   | Secret | Purpose |
   |---|---|
   | `CRAFTLY_CRON_SECRET` | Long cryptographically random scheduler secret (e.g. generate locally with `openssl rand -hex 32`) |
   | `SOURCE_CACHE_HOURS` | Positive approved retention period, at most 168 hours; use only the duration your permission allows |
   | `APPROVED_FEED_URL` | Fixed public HTTPS creator-feed endpoint accepting `offset` and `limit` |
   | `APPROVED_FEED_PERMISSION_REFERENCE` | Your actual permission/agreement reference; retained server-side |
   | `APPROVED_FEED_ARTWORK_ALLOWED` | `true` only if remote artwork display is authorized; otherwise Craftly artwork is used |
   | `APPROVED_FEED_TOKEN` | Optional bearer token for that fixed feed, never sent to the phone |
   | `CURSEFORGE_API_KEY` | Optional approved developer key, backend only |
   | `CURSEFORGE_CACHE_PERMISSION_REFERENCE` | **Separate written exception allowing metadata caching**, not merely API approval |
   | `CURSEFORGE_BEDROCK_GAME_ID` | Verified numeric game ID; adapter also checks game name/slug for Bedrock and refuses Java |
   | `CURSEFORGE_ARTWORK_ALLOWED` | Explicit artwork permission flag; false by default |

   Configure only the adapter you actually have rights to use. No real secret belongs in an example file.
4. In **Supabase Vault**, create `craftly_project_url` with the public project URL and `craftly_cron_secret` matching the Edge Function's cron secret. Then run `supabase/schedule-content-sync.sql`. It registers one idempotent ten-minute Cron job using `pg_net`. Check `cron.job_run_details` and `net._http_response` plus Edge Function logs after the first execution. A successful Cron SQL invocation alone does not prove the HTTP sync succeeded.
5. Sign into **Studio → Content Sources**. Enable the approved source, press **Sync now**, then Refresh for results. “Pending” is not “Connected”: Connected appears only after a successful import pass. Sync errors and last-success timestamps are separate. A fifteen-minute per-source limit and a five-minute lease prevent repeated/concurrent jobs; Sync now does not bypass limits.

### Creator feed contract

Serve a bounded response, sorted consistently by updated time descending, max **25 items** and **2 MiB** per response. The endpoint receives `?offset=0&limit=25`. Return `has_more:false` when finished. Do not download scraped content to construct a feed without authorization.

```json
{
  "items": [{
    "external_id": "creator-owned-stable-id",
    "edition": "bedrock",
    "title": "Your original pack",
    "description": "Your permitted metadata summary.",
    "author": "Original creator",
    "source_url": "https://your-real-public-domain.example/your-pack",
    "thumbnail": "https://your-real-public-domain.example/cover.webp",
    "screenshots": ["https://your-real-public-domain.example/screen.webp"],
    "category": "Resource Packs",
    "minecraft_versions": ["1.21", "1.21.80"],
    "file_type": "mcpack",
    "file_size": 123456,
    "rating": null,
    "downloads": 100,
    "published_at": "2026-01-01T00:00:00Z",
    "updated_at": "2026-02-01T00:00:00Z",
    "tags": ["survival"],
    "license": "Actual creator/license statement covering metadata/artwork usage; files remain with creator.",
    "usage": {"metadata_display": true, "metadata_cache": true, "images": true}
  }],
  "has_more": false
}
```

The example is a contract, **not a configured content source**. Ratings must be 1–5 if provided; otherwise omit or use null. A feed declaring permissions does not replace checking the owner's real authority to grant them. Send compressed thumbnail URLs yourself; the aggregator does not rehost or transform third-party artwork. For deletion/takedown, disable the source immediately (which purges its cached rows) or remove the individual item in Studio (persistent tombstone prevents reimport). Items no longer refreshed expire and disappear; their expired rows are purged on the next scheduled tick.

## Architecture and bounds

- One `craftly_mods` catalog retains the existing manual upload/download path and adds explicit `source_type`, source, external ID, original URL, author, tags, versions, screenshots, usage text, source stats and publication/update/cache dates. Manual uploads remain private Storage packages with signed links. Manually supplied external URLs open the original website; if both a package and URL are supplied, the package remains the primary in-app download.
- The database is the backend metadata cache. Home never calls providers. `craftly_catalog_page` returns only published, enabled, unexpired content, with category/version/rating/source/search/sort and a stable ID tiebreaker. Search includes title, summary, author and tags. Limit defaults to 24, capped at 48; offset is bounded at 10,000. This is bounded offset pagination, not unlimited full-text ranking or a CDN response cache.
- Browser query cache is 60 seconds, coalesces reads, invalidates after writes/account changes. Navigation preserves main-page scroll position; horizontal home shelf offsets are preserved. Search is debounced. Individual sections load near the viewport, six entries at a time. The carousel requests five records ordered by latest publication/update; only those five unique covers are eager. Autoplay is deliberately omitted to avoid motion, accidental reading interruptions and work offscreen.
- Until the migration exists, the previous manual-only API is used as a compatibility fallback (up to its original 1,000 rows, cached); server paging/extra columns need the new RPC. Missing RPC is the only fallback condition; ordinary network/security failures are not silently hidden.
- Original manual form remains; optional author/tags/screenshots/URL and expanded Bedrock categories are additive. Max six screenshots, each under 8 MiB. Manual covers/screenshots are resized and WebP-optimized where supported, keeping originals if conversion is not smaller/unsupported. Packages retain 50 MiB and ZIP-header checks. No arbitrary external file is handed to the native private-file downloader.
- Each sync reads one provider page (25 records), alternating latest-page checks with a rotating bounded backfill of up to about 1,000 provider results. CurseForge uses overlapping pages to reduce movement gaps. This is not a promise to exhaust an entire provider catalog. Duplicate keys `(source, external_id)` and canonical source URLs prevent repeated records; matching titles alone never merge different creators' work. Hashes distinguish changed metadata from mere cache renewal.
- HTTPS-only fixed provider endpoints, no redirects, no local/IP-literal feed endpoints, twelve-second request timeout, max two retries/backoff. Long `Retry-After` responses are deferred to a later sync rather than bypassed. No API response body or credential is reflected in error logs/UI. Keep permission proofs and terms updates under your control.
- Source controls are owner-only. Service-role-only claims serialize jobs. Sources default Disabled, and losing required permission configuration disables/purges the source on its next sync. Removing a source doesn't touch manual uploads. Disabling/expiration removes cached external favorites through the existing foreign-key cascade; it does not delete manual files or accounts.

## Icon assets

`docs/icons/craftly-icon-master.png` is the original opaque voxel-C design, without illegible text or busy scenery. `scripts/build-icons.mjs` generates Android density variants and adaptive safe-zone resources, a small bundled WebP mark/favicon and a complete iPhone/iPad/App Store `docs/icons/ios/AppIcon.appiconset`. iOS assets are prepared; **there is no iOS app build/IPA in this Android repository**. Android launchers apply their own masks.

## Verification and remaining acceptance

- Automated tests cover provider category normalization, permission gates, unsafe URLs, bounded pages, Java-game rejection, retries, old upload validation, legacy API, transfer lifecycle/races, caches, original RLS and the real PostgreSQL hybrid migration (repeat application, old-row preservation, duplicates, expiry/source visibility, paging, owner-only access, leases and deletion tombstones).
- Browser tests use intercepted fixtures only: old and new schema modes; manual publish/failure/cleanup/retry, cached navigation, filters/RTL, hybrid carousel and attribution/screenshots/source handoff, source activation refusal, login and existing downloads.
- `npx deno check supabase/functions/content-hub/index.ts` checks the Edge Function. Hosted real API/provider keys, Cron dispatch, real Storage writes, image licensing and physical Minecraft import **still need owner-side acceptance after deployment**. Read-only Supabase probes are not evidence of successful sync.
- Keep Craftly open for uploads/downloads. APKs remain debug-signed Android 8+ test builds with an updated WebView. Production needs stable release signing and device/Google Play review. Back up local files before uninstalling an old build if signatures differ.
