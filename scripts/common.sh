#!/usr/bin/env bash

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_ID="ZhenyaUsenko.claude-turn-diff"

cd "$REPO" || exit 1

version() { node -p "require('./package.json').version"; }
vsix_path() { echo "$REPO/claude-turn-diff-$(version).vsix"; }
