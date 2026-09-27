#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
npm run build
mkdir -p android/app/src/main/assets/public
rm -rf android/app/src/main/assets/public/*
cp -R dist/. android/app/src/main/assets/public/
cd android
if [[ -x ./gradlew ]]; then ./gradlew assembleExplorerDebug assembleStudioDebug; else gradle assembleExplorerDebug assembleStudioDebug; fi
mkdir -p ../artifacts
cp app/build/outputs/apk/explorer/debug/*.apk ../artifacts/craftly-explorer.apk
cp app/build/outputs/apk/studio/debug/*.apk ../artifacts/craftly-studio.apk
