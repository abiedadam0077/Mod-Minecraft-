#!/usr/bin/env bash
#
# بناء APK معدّل من Zalith Launcher 2 محليًا (Linux / macOS / WSL)
#
# المتطلبات:
#   - JDK 21           (مثال: sudo apt install openjdk-21-jdk)
#   - Android SDK      مع export ANDROID_HOME=... و ANDROID_SDK_ROOT=...
#                      (Android Studio يوفّرها، أو commandline-tools)
#   - الإنترنت         (لتنزيل NDK 25.2.9519653 والمكتبات تلقائيًا)
#
# الاستعمال:
#   ./scripts/build-apk.sh              # arm64 (أغلبية الهواتف)
#   ./scripts/build-apk.sh arm          # هواتف 32-bit القديمة
#   ./scripts/build-apk.sh all          # كل البنيات (بطيء جدًا)
#
set -euo pipefail

ARCH="${1:-arm64}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v java >/dev/null 2>&1; then
    echo "❌ ما لقيناش java. ثبّت JDK 21 أولاً." >&2
    exit 1
fi

JAVA_MAJOR="$(java -version 2>&1 | head -1 | sed -E 's/.*version "([0-9]+).*/\1/')"
echo "==> Java: $JAVA_MAJOR"
if [ "${JAVA_MAJOR:-0}" -lt 21 ] 2>/dev/null; then
    echo "⚠️  المشروع يحتاج JDK 21 على الأقل (الكود الحالي: $JAVA_MAJOR)."
fi

if [ -z "${ANDROID_HOME:-}${ANDROID_SDK_ROOT:-}" ]; then
    echo "⚠️  ANDROID_HOME غير محدد. إذا فشل البناء، حدّد مسار Android SDK."
fi

"$ROOT/scripts/apply-patches.sh"

cd "$ROOT/upstream"
chmod +x gradlew

echo "==> بناء APK (arch=$ARCH) ... هذا قد يستغرق 20-60 دقيقة"
./gradlew "ZalithLauncher:assembleDebug" "-Darch=$ARCH"

echo
echo "✅ الملفات الناتجة:"
find ZalithLauncher/build/outputs/apk/debug -name "*.apk" -exec ls -lh {} +
