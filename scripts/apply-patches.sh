#!/usr/bin/env bash
#
# تنزيل ZalithLauncher2 الأصلي + تطبيق كل التعديلات الموجودة في مجلد patches/
#
# الاستعمال:
#   ./scripts/apply-patches.sh            # ينزّل المشروع الأصلي في مجلد ./upstream
#   ./scripts/apply-patches.sh path/dir   # أو في مجلد مخصص
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
UPSTREAM_DIR="${1:-$ROOT/upstream}"
UPSTREAM_URL="https://github.com/ZalithLauncher/ZalithLauncher2.git"
UPSTREAM_REF="$(grep -E '^ZALITHLAUNCHER2_COMMIT=' "$ROOT/UPSTREAM_COMMIT" | cut -d= -f2 | tr -d '[:space:]')"

echo "==> Zalith Launcher 2 : $UPSTREAM_REF"

if [ ! -d "$UPSTREAM_DIR/.git" ]; then
    echo "==> تنزيل المشروع الأصلي إلى: $UPSTREAM_DIR"
    mkdir -p "$UPSTREAM_DIR"
    git -C "$UPSTREAM_DIR" init -q
    git -C "$UPSTREAM_DIR" remote add origin "$UPSTREAM_URL" 2>/dev/null || true
    git -C "$UPSTREAM_DIR" fetch -q --depth 1 origin "$UPSTREAM_REF"
    git -C "$UPSTREAM_DIR" checkout -q FETCH_HEAD
else
    echo "==> المجلد موجود مسبقًا، نتحقق من المرجع فقط"
    git -C "$UPSTREAM_DIR" fetch -q --depth 1 origin "$UPSTREAM_REF"
    git -C "$UPSTREAM_DIR" checkout -q FETCH_HEAD
fi

echo "==> HEAD = $(git -C "$UPSTREAM_DIR" rev-parse HEAD)"

for p in "$ROOT"/patches/*.patch; do
    echo "==> تطبيق: $(basename "$p")"
    git -C "$UPSTREAM_DIR" apply -p1 --verbose "$p"
done

echo
echo "✅ تم تطبيق كل التعديلات بنجاح."
git -C "$UPSTREAM_DIR" --no-pager diff --stat
