#!/usr/bin/env bash

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

"$REPO/scripts/build.sh" || exit 1

if code --install-extension "$(vsix_path)" --force >/dev/null 2>&1; then
  echo "installed $(basename "$(vsix_path)")"
else
  echo "install failed" >&2
  exit 1
fi

echo
echo "reload the window to activate it"
