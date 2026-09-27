# Craftly — Minecraft Bedrock companion

**[تحميل APK من GitHub](https://github.com/abiedadam0077/Mod-Minecraft-/releases/tag/v1.0.0-preview)** · **[دليل التشغيل بالدارجة، خطوة بخطوة](docs/START-HERE-AR.md)**

جوج تطبيقات مربوطين بنفس السيرفر: **Craftly** للمستخدم و **Craftly Studio** للأدمن. واجهة متجاوبة، تصميم نقي بلون بنفسجي هادئ، دعم العربية RTL والإنجليزية، أيقونات Lucide وأنيميشن يحترم إعداد تقليل الحركة.

## What's implemented
- Search, categories, sorting, details, editor/community ratings.
- Local guest favorites, synced account favorites, download history.
- Registration/login, hashed passwords, expiring sessions, logout, server-side admin authorization.
- Admin uploads: cover, description, Bedrock version, category, editor rating, and real Minecraft package. Publishing is immediately visible in both apps. Delete with confirmation.
- Two separate Android application IDs: `com.craftly.explorer` / `com.craftly.studio`.
- Native Android download with size limit, HTTPS, package signature check, Downloads copy (Android 10+), and an explicit **Open in Minecraft** consent dialog. A permission-granting content provider shares the pack with the game. Android 8–9 stores privately and offers Share/save.
- Admin document picker for cover/package uploads in the Android WebView.

**The six initial cards are clearly marked design previews.** Their AI-generated art and editorial ratings illustrate the UI; they are not real downloadable mods or fabricated community activity. Upload licensed, game-tested packages in Studio to populate the real catalog. Java `.jar` mods and Java Edition are not supported.

## Run locally
Requires Node.js 22.

```sh
npm ci
cp .env.example .env
# Edit .env: choose your admin email and a strong unique password.
node --env-file=.env server/index.js  # API :3001
npm run dev                        # frontend :5173, proxies API/uploads
```

Open `/` for the user interface or `/?admin=1` for Studio. Click the profile icon to sign in. Normal registration can never create an admin. The admin environment variables bootstrap one administrator only when no admin exists. Changing them afterward does not reset an existing password.

A local `.env` was generated for this workspace's preview with an administrator account. It is **not committed**. The owner can view it in the private workspace. Do not publish it. If creating a fresh installation, use your own credentials.

```sh
npm test          # metadata, persistence and isolated end-to-end API tests
npm run build     # web production build
node scripts/browser-check.mjs # optional browser checks; requires Chromium OS libraries
```

## Android / APK build
Java 17, Android SDK 35 and Gradle 8.9 are required.

```sh
npm ci
npm run build:apk
```

Outputs:
- `artifacts/craftly-explorer.apk`
- `artifacts/craftly-studio.apk`

The workflow also publishes downloadable copies under `releases/` on this same session branch, with SHA-256 checksums and the source commit.

Both are **debug-signed installable test builds**, not Play Store release builds. The GitHub Actions workflow **Build Craftly apps** builds both variants on the session branch. Download `craftly-android-apps` from its successful run. Production distribution needs your own protected release signing key, privacy policy, and device testing.

### Connect the apps
In either APK, open **Settings & help → Server address**, enter your deployed HTTPS origin (e.g. `https://craftly.example.com`), and save. Use the **same address in both apps**. Sign in with the administrator in Studio and register a normal account in Craftly. The APK bundles the UI and images but requires an online server for accounts, publishing and downloads. No expiring sandbox URL is hardcoded.

The browser preview's HTTPS origin can be entered for temporary testing while the session server is running, but it is **not permanent hosting**. On mobile the settings are also accessible through the reconnect panel or Account → Settings.

### Minecraft import
After downloading, the Android app asks whether to open the file in Minecraft. It hands a content URI to Minecraft Bedrock; **the game controls import and activation**. The app cannot silently write to protected game storage. The user confirms import and enables the pack in their world. Minecraft must be installed and compatible with the package. Back up worlds first. Web browsers require manually opening the downloaded file. This integration needs verification on a real device with Minecraft; it is not claimed as device-tested.

## Production server
```sh
npm run build
NODE_ENV=production node --env-file=.env server/index.js
# Serves API, uploads and production frontend on PORT (default 3001).
```
Or build the included Dockerfile and mount `/data/craftly` as a persistent volume. Put it behind an HTTPS reverse proxy with a request body limit above 108 MB. Set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, and optionally `ALLOWED_ORIGINS` (include `https://appassets.androidplatform.net` for both Android apps).

Persistence is a single-process, atomically-written JSON store plus uploaded files in `server/data/` or `DATA_DIR`. Keep this directory backed up. **Do not run multiple server replicas against this file store.** For larger deployments, migrate to a transactional database/object storage and add quotas, email verification/reset, monitoring, malware scanning, and content moderation. Current validation checks file extension, image magic bytes, ZIP header and size; it does not prove that a package is safe or compatible. No paid storage/hosting has been provisioned.

## Architecture
- `src/` — Vite responsive UI; Arabic/English, dialogs, keyboard navigation.
- `server/` — Express API, bcrypt, sessions, admin permissions, rate limits, scoped expiring downloads.
- `android/` — dependency-light native Java WebView shell, local trusted assets, HTTPS-only network, file picker/downloader/content provider.
- `tests/` — isolated server integration tests and persistence/validation tests.
- `.github/workflows/android.yml` — reproducible dual-APK build.

Not affiliated with Mojang or Microsoft. Minecraft is their respective trademark. Only distribute content you own or have permission to share.

## Verification in this workspace
- `npm test`: passed (validation, atomic persistence, and API integration).
- Desktop/mobile browser checks: passed for search, favorites, detail/sign-in dialogs, Arabic RTL, and no horizontal overflow or JavaScript exceptions.
- Admin browser flow: sign in → upload → publish → browser download → delete: passed using a disposable ZIP fixture. This verifies delivery, not Minecraft compatibility.
- Native APK compilation: verified by GitHub Actions. No emulator or physical-device Minecraft import test was performed.
