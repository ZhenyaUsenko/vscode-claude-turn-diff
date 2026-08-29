#!/usr/bin/env bash

set -uo pipefail

MODE="${1:-}"

case "$MODE" in begin | arm | end) ;; *) exit 0 ;; esac

IFS= read -r -d '' payload || true

[ -n "$payload" ] || exit 0

PROJECT=${payload#*\"transcript_path\":\"}
PROJECT=${PROJECT%%\"*}
PROJECT=${PROJECT%/*}
PROJECT=${PROJECT##*/}

ADVERT="$HOME/.claude/turn-diff/$PROJECT/server.json"

[ -f "$ADVERT" ] || exit 0

raw=$(<"$ADVERT")
port=${raw#*\"port\":}
port=${port%%[!0-9]*}
token=${raw#*\"token\":\"}
token=${token%%\"*}

[ -n "$port" ] && [ -n "$token" ] || exit 0

{ exec 3<>"/dev/tcp/127.0.0.1/$port"; } 2>/dev/null || exit 0

printf '%s\t%s\t%s\n%s\n' "$token" "$MODE" "$PROJECT" "$payload" >&3
IFS= read -r -t 30 reply <&3 2>/dev/null
exec 3<&- 2>/dev/null

exit 0
