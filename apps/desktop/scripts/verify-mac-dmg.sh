#!/bin/bash
set -euo pipefail
# Test the app copied out of the actual DMG, at a different path than the build.
mount_dir=$(mktemp -d)
install_dir=$(mktemp -d)
cleanup() {
  hdiutil detach "$mount_dir" -quiet || true
}
trap cleanup EXIT
images=(apps/desktop/release/*.dmg)
test "${#images[@]}" -eq 1
hdiutil attach "${images[0]}" -nobrowse -readonly -mountpoint "$mount_dir" -quiet
ditto "$mount_dir/MoneyDance.app" "$install_dir/MoneyDance.app"
codesign --verify --deep --strict --verbose=2 "$install_dir/MoneyDance.app"
node apps/desktop/scripts/verify-package.cjs "$install_dir/MoneyDance.app/Contents/MacOS/MoneyDance"
