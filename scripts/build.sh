#!/usr/bin/env bash

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

npm test || {
  echo "tests failed — not packaging" >&2
  exit 1
}

rm -f ./*.vsix
npx --yes @vscode/vsce@latest package || exit 1
