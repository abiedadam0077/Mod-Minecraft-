# Craftly 1.3 — Studio & first-launch experience

**[تحميل التطبيقين من GitHub](https://github.com/abiedadam0077/Mod-Minecraft-/releases/tag/v1.3.0-studio)** · **[طريقة التثبيت والتجربة بالدارجة](docs/STUDIO-RELEASE.md)**

Craftly (explorer) and Craftly Studio (administrator) now connect **directly to Supabase**. No Render, extra Express server, URL entry or secret key in the APK is needed. The bundled project is configured in `src/cloud-config.js` using only the public URL/publishable key provided by the project owner. The original Express server remains under `server/` for reference/testing; it is not used by the 1.3 frontend or APKs.

## What changed in 1.3

Studio and publishing now use compact rounded cards, real filters/sorting, cover previews and staged upload status with recoverable errors. The publisher declaration is visible and enabled by default, without a checkbox. A bundled cinematic splash lasts about two seconds; first-run welcome respects real saved Supabase sessions. Returning users warm their catalog during the splash. Scoped short-lived request caches, lazy artwork and local post-mutation updates avoid repeated navigation fetches. See [release notes](docs/STUDIO-RELEASE.md) for exact behavior, testing and limits. The other five-tab pages and core download/import features are preserved.

## Implemented
- Responsive iOS-inspired UI, English and Arabic RTL, search/categories/sorting, keyboard-accessible dialogs.
- Supabase Auth sign-in/sign-up, session persistence/refresh, sign-out, email confirmation/resend flow.
- Database profiles determine admin status; clients cannot assign themselves roles. No embedded administrator credentials.
- Admin cover/package upload, catalog publishing, deletion and Storage API cleanup. Upload failures attempt compensating cleanup and report orphan UUIDs if cleanup fails.
- Account favorites, ratings, private per-user download-request history.
- Private Bedrock files with 10-minute signed URLs; public cover artwork. Cover cap 8 MiB; package cap 50 MiB.
- Android download only from this Supabase project's signed package endpoint; HTTPS, no redirects, bounded file sizes, ZIP header check, scoped sharing permissions and explicit Open in Minecraft confirmation.
- The native shell bundles the UI/images. Internet is required for cloud operations.

The catalog starts empty: no fake downloadable packages. An administrator must publish tested, legally distributable content. Java `.jar` mods are not supported. Downloads shown in the UI are **unique account download requests**, not verified transfers or game installations.

## Owner setup (already guided in this session)

1. Apply [`supabase/migrations/202609270001_craftly.sql`](supabase/migrations/202609270001_craftly.sql) in Supabase SQL Editor.
2. Create your own account in Supabase Authentication and assign its profile `role='admin'` through SQL Editor as described in [`supabase/README.md`](supabase/README.md). Do not share passwords or service-role keys.
3. Install the **1.3** APKs and sign in. The old 1.0 Express APKs are not compatible.
4. Publish a small real pack in Studio; refresh the explorer catalog in Settings, then download and test import on a device with Minecraft Bedrock.

Auth email confirmation follows the project's dashboard configuration. For public email registration, configure a working Supabase-supported SMTP provider, allowed redirects and suitable email templates. The built-in mail service can restrict recipients/rate. The app explicitly handles accounts awaiting confirmation; it does not disable security settings remotely. When a confirmation link reports a redirect error, verify the account's confirmation status and return to the app to sign in. No dashboard configuration was changed by the agent.

## Local development and tests

```sh
npm ci
npm run dev                # UI :5173; uses Supabase, no local API required
npm run build              # production static site, also bundled in APK
npm test                   # 11 API, PostgreSQL/PGlite RLS, upload, transfer and cache tests
node scripts/cloud-browser-check.mjs # mocked Supabase browser end-to-end tests; no live account writes
node scripts/check-cloud.mjs         # read-only real Supabase public checks; network required
```

The browser test supplies minimal Chromium libraries and starts/stops its own isolated Vite process. It uses mock accounts/storage responses only and never signs into the owner's account. SQL tests exercise PostgreSQL RLS with mocked Supabase `auth`/`storage` schemas; they do not replace testing hosted Storage behavior.

## Android & GitHub releases

Java 17, Gradle 8.9, Android SDK 35:

```sh
npm run build:apk
```

Outputs `artifacts/craftly-explorer.apk` and `artifacts/craftly-studio.apk`. Separate application IDs: `com.craftly.explorer` / `com.craftly.studio`. Android 8+.

GitHub Actions builds/tests the apps, performs read-only remote checks, publishes copies under `releases/` with SHA-256 checksums, and attaches APKs to the **v1.3.0-studio** prerelease. `CONNECTIVITY.json` records live probe results (catalog, aggregate stats, denied anonymous profile access, Auth configuration), not a successful admin login or a physical-device import test.

These remain **debug-signed test APKs**. A different CI debug signing key may require uninstalling an old build before installation; local settings are lost. Production needs a stable, protected release signing key and device testing. No key/password is committed.

## Deployment and limitations

Supabase hosts the data/auth/storage. A separate web frontend, if wanted, can be hosted as the static contents of `dist/` on a static HTTPS host. GitHub Releases is for APK downloads, not a running web app. No additional database migration is required if the original setup script succeeded.

- Free-plan storage/transfer/idle quotas still apply; this is not unlimited hosting.
- This client loads up to 1,000 catalog/history records. Larger catalogs require paging and server-side searching.
- Mod file inspection is a client convenience, not a malware scan or a server-side content validator. Only trusted admins upload. RLS and bucket size/type policies enforce server-side authorization and storage limits.
- Draft cover artwork is public. Never put confidential material in the public cover bucket.
- Deleting a mod hides/revokes new catalog-based access; already-issued signed URLs can remain usable until they expire. The app also requests deletion of both objects.
- Upload/catalog transactions span Storage and Postgres; check reported orphan IDs in the dashboard after outages.
- Auth expiry during an operation may require sign-in again; network errors are shown, not silently treated as success.
- No real owner account login, real package publication, or Minecraft device import has been performed by the agent. Validate those on a phone before distribution.

## Files

- `src/cloud.js` — Supabase API adapter, auth/upload/download integration.
- `src/main.js` / `src/style.css` — shared explorer/studio UI.
- `supabase/` — schema, grants, RLS, storage policies and owner instructions.
- `android/` — trusted bundled WebView UI, file picker, native downloader and content provider.
- `tests/` / `scripts/cloud-browser-check.mjs` — unit, RLS and mocked browser checks.
- `server/`, Dockerfile, older setup docs — **legacy Express implementation**, not necessary for current Supabase apps.

Not affiliated with Mojang or Microsoft. Back up worlds before importing packs.


## 1.2 redesign and real transfer tracking

See [`docs/STUDIO-RELEASE.md`](docs/STUDIO-RELEASE.md) for the mobile design, controls, tests and exact limitations. The UI follows the supplied reference with a shared floating five-tab navigation, compact browsing/search, filter/version sheets, a dedicated account page and tabbed details. Five supported categories and existing Supabase content are preserved without a migration. No fake additional screenshots, update history, Java compatibility or push notifications are generated.

`src/views.js` contains page views, `src/forms.js` preserves auth/admin flows, `src/transfers.js` tracks actual device-local transfers, and `src/main.js` coordinates navigation/actions. Android now exposes pause/resume/cancel/open and scoped storage cleanup. Progress is based on received bytes; cloud download-request history is clearly distinct from local completed files.

Keep the app in the foreground during downloads. Interrupted transfers after process restart are marked interrupted and restart; this is not a background download service. HTTP Range support is handled with a safe restart fallback. Clearing local storage does not delete cloud data or public Downloads copies. Browser files cannot be reopened from disk after reload without the user's own file manager.
