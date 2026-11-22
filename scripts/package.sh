#!/bin/sh
# Builds the Chrome Web Store upload: dist/selfless-<version>.zip with manifest.json at
# the zip root. Runs the tests and the dash check first.
set -eu
cd "$(dirname "$0")/.."

npm test >/dev/null
if grep -rn '[—–]' extension README.md PRIVACY.md store/listing.md; then
  echo "Em or en dash found; fix before packaging." >&2
  exit 1
fi

version=$(python3 -c "import json; print(json.load(open('extension/manifest.json'))['version'])")
mkdir -p dist
out="dist/selfless-$version.zip"
rm -f "$out"
(cd extension && zip -qr "../$out" . -x '.*' -x '*/.*')
echo "Built $out"
unzip -l "$out" | tail -n +1
