#!/usr/bin/env bash
# Shared by the other scripts in this directory. Source it; do not run it.
#
# These deliberately replace the installed extension rather than sitting beside
# it. Both builds write ~/.claude/hooks/turn-diff.sh, and whichever extension
# activates last owns that file for every window — so two copies would fight
# over the hook on each reload, and both would advertise a server for the same
# project. They also share an extension id, so VS Code cannot hold both.

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXT_ID="ZhenyaUsenko.claude-turn-diff"

cd "$REPO" || exit 1

version() { node -p "require('./package.json').version"; }
vsix_path() { echo "$REPO/claude-turn-diff-$(version).vsix"; }
