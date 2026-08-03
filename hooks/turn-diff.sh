#!/usr/bin/env bash
# Thin client. All the work happens in the VS Code extension, which listens on
# a loopback port advertised in this project's server.json.
#
#   turn-diff.sh begin|arm|end   < hook-payload-json
#
# Deliberately pure bash with no subprocesses: `arm` runs before every
# write-capable tool call, so this is the hot path. A /dev/tcp round-trip costs
# about 3ms — less than spawning any interpreter would.
#
# If no window is serving this project the connection fails and we exit 0.
# Nothing would be rendered anyway, so there is no reason to do the work.

set -uo pipefail

MODE="${1:-}"
case "$MODE" in begin | arm | end) ;; *) exit 0 ;; esac

IFS= read -r -d '' payload || true
[ -n "$payload" ] || exit 0

# project key, matching ~/.claude/projects and the extension, without spawning
PROJECT=${PWD//[^a-zA-Z0-9]/-}

for advert in "$HOME/.claude/turn-diff/$PROJECT/servers/"*.json; do
  [ -f "$advert" ] || continue

  # written by us and always a flat object, so pull the two fields with
  # builtins rather than paying for jq before every tool call
  raw=$(<"$advert")
  port=${raw#*\"port\":}
  port=${port%%[!0-9]*}
  token=${raw#*\"token\":\"}
  token=${token%%\"*}
  [ -n "$port" ] && [ -n "$token" ] || continue

  { exec 3<>"/dev/tcp/127.0.0.1/$port"; } 2>/dev/null || continue
  # header line is tab-separated; paths containing tabs are unsupported anyway
  printf '%s\t%s\t%s\n%s\n' "$token" "$MODE" "$PWD" "$payload" >&3
  IFS= read -r -t 30 reply <&3 2>/dev/null
  exec 3<&- 2>/dev/null
  [ "$reply" = "ok" ] && exit 0
done
exit 0
