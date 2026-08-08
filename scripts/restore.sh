#!/usr/bin/env bash

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

if code --install-extension "$EXT_ID" --force >/dev/null 2>&1; then
  echo "reinstalled $EXT_ID from the Marketplace"
  echo "reload the window; activation will rewrite ~/.claude/hooks/turn-diff.sh"
else
  echo "restore failed — is that version still published?" >&2
  exit 1
fi
