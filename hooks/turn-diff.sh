#!/usr/bin/env bash
# Turn-scoped diffs for Claude Code.
#
#   begin (UserPromptSubmit) -> record the prompt, clear stale state. No git.
#   arm   (PreToolUse)       -> on the first write-capable tool of the turn,
#                               snapshot every git repo in the workspace. Also
#                               copies the before-image of any touched file
#                               that lives outside all of them.
#   end   (Stop)             -> diff, open one multi-file editor, point
#                               refs/claude/turns at this turn.
#
# Two mechanisms, because neither covers everything on its own:
#   * tree snapshots catch anything a Bash command does (rm, sed, formatters,
#     package-lock churn) but only inside a git worktree
#   * per-file capture catches edits outside every repo (~/.claude/hooks, say)
#     but only for paths an Edit/Write tool names
#
# UNTRACKED files larger than MAX_BYTES are excluded from BOTH snapshots, so
# they cancel out and never appear in a diff.

set -uo pipefail

MODE="${1:-}"
MAX_BYTES=1048576   # 1MB

# Only the turn being written is kept; everything earlier is purged on Stop.
MANIFEST="$HOME/.claude/turn-diff/_open.json"

IFS= read -r -d '' payload || true

# --- fast path: pull fields with bash builtins only, no subprocess ----------
rest=${payload#*\"session_id\":\"}
[ "$rest" = "$payload" ] && exit 0
SESSION=${rest%%\"*}
[ -n "$SESSION" ] || exit 0

STATE="$HOME/.claude/turn-diff/$SESSION"

if [ "$MODE" = "end" ] && [ ! -f "$STATE/repos.tsv" ] && [ ! -s "$STATE/touched.tsv" ]; then
  exit 0   # nothing was written this turn
fi

# --- begin: no git needed at all, bail out before any git spawn ------------
if [ "$MODE" = "begin" ]; then
  [ -d "$STATE" ] || mkdir -p "$STATE" || exit 0
  rm -rf "$STATE/repos.tsv" "$STATE/touched.tsv" "$STATE/blobs" 2>/dev/null
  # the raw prompt carries injected IDE/system context — strip it
  printf '%s' "$payload" \
    | jq -r '
        (.prompt // "turn")
        | gsub("<ide_opened_file>[\\s\\S]*?</ide_opened_file>"; "")
        | gsub("<ide_selection>[\\s\\S]*?</ide_selection>"; "")
        | gsub("<system-reminder>[\\s\\S]*?</system-reminder>"; "")
        | gsub("<local-command-[a-z]+>[\\s\\S]*?</local-command-[a-z]+>"; "")
        | gsub("\\s+"; " ") | sub("^ +"; "") | sub(" +$"; "")
        | if length == 0 then "turn" else .[0:120] end' \
    > "$STATE/prompt" 2>/dev/null || printf 'turn' > "$STATE/prompt"
  exit 0    # NOTE: UserPromptSubmit stdout is injected into context — stay silent
fi

[ -d "$STATE" ] || mkdir -p "$STATE" || exit 0

is_under() { # child parent  -> true when child is at or below parent
  [ "$1" = "$2" ] && return 0
  case "$1/" in "$2"/*) return 0 ;; esac
  return 1
}

# BSD stat wants -f, GNU coreutils wants -c. Probe once per invocation.
if stat -f '%z' . >/dev/null 2>&1; then STAT_MODE=bsd; else STAT_MODE=gnu; fi
sizes_of() { # NUL-delimited paths on stdin -> "<size> <path>" lines
  if [ "$STAT_MODE" = bsd ]; then
    xargs -0 stat -f '%z %N' 2>/dev/null
  else
    xargs -0 stat -c '%s %n' 2>/dev/null
  fi
}

# Every folder of the workspace this session belongs to. The IDE lock file
# lists them, which is the only way the hook can see past its own cwd.
workspace_folders() {
  local lock all f matched
  for lock in "$HOME"/.claude/ide/*.lock; do
    [ -f "$lock" ] || continue
    all=$(jq -r '.workspaceFolders[]?' "$lock" 2>/dev/null) || continue
    [ -n "$all" ] || continue
    matched=0
    while IFS= read -r f; do
      [ -n "$f" ] || continue
      is_under "$PWD" "$f" && matched=1
    done <<< "$all"
    if [ "$matched" = 1 ]; then printf '%s\n' "$all"; return 0; fi
  done
  printf '%s\n' "$PWD"
}

git_roots() { # stdin: folders -> stdout: deduped git toplevels
  local f r seen="|"
  while IFS= read -r f; do
    [ -d "$f" ] || continue
    r=$(git -C "$f" rev-parse --show-toplevel 2>/dev/null) || continue
    case "$seen" in *"|$r|"*) continue ;; esac
    seen="$seen$r|"
    printf '%s\n' "$r"
  done
}

# Snapshot one worktree as a tree object, without touching its real index.
snapshot_tree() { # repo-root
  local repo="$1" gitdir idx tree line sz path
  gitdir=$(git -C "$repo" rev-parse --absolute-git-dir 2>/dev/null) || return 1
  idx="$STATE/index.tmp"
  cp "$gitdir/index" "$idx" 2>/dev/null || return 1
  export GIT_INDEX_FILE="$idx"
  git -C "$repo" add -u >/dev/null 2>&1
  local keep=()
  while IFS= read -r line; do
    sz=${line%% *}; path=${line#* }
    [ -n "$sz" ] && [ "$sz" -le "$MAX_BYTES" ] 2>/dev/null && keep+=("$path")
  done < <(cd "$repo" 2>/dev/null && git ls-files -o --exclude-standard -z | sizes_of)
  if [ "${#keep[@]}" -gt 0 ]; then
    ( cd "$repo" 2>/dev/null && git add -f -- "${keep[@]}" >/dev/null 2>&1 )
  fi
  tree=$(git -C "$repo" write-tree 2>/dev/null)
  unset GIT_INDEX_FILE
  rm -f "$idx"
  [ -n "$tree" ] && printf '%s' "$tree"
}

case "$MODE" in
  arm)
    # 1. once per turn: snapshot every repo in the workspace
    if [ ! -f "$STATE/repos.tsv" ]; then
      : > "$STATE/repos.tsv"
      while IFS= read -r r; do
        t=$(snapshot_tree "$r") || continue
        [ -n "$t" ] && printf '%s\t%s\n' "$r" "$t" >> "$STATE/repos.tsv"
      done < <(workspace_folders | git_roots)
    fi

    # 2. every call: if this tool names a file outside every repo, keep a copy
    fp=${payload#*\"file_path\":\"}
    if [ "$fp" = "$payload" ]; then
      fp=${payload#*\"notebook_path\":\"}
      [ "$fp" = "$payload" ] && exit 0
    fi
    fp=${fp%%\"*}
    case "$fp" in /*) ;; *) exit 0 ;; esac

    while IFS=$'\t' read -r repo _; do
      [ -n "$repo" ] && is_under "$fp" "$repo" && exit 0
    done < "$STATE/repos.tsv"

    # already captured earlier in this turn? keep the oldest before-image
    if [ -f "$STATE/touched.tsv" ]; then
      grep -qxF "$fp"$'\t'"1" "$STATE/touched.tsv" && exit 0
      grep -qxF "$fp"$'\t'"0" "$STATE/touched.tsv" && exit 0
    fi

    if [ -f "$fp" ]; then
      blob="$STATE/blobs${fp}"
      mkdir -p "$(dirname "$blob")" 2>/dev/null && cp "$fp" "$blob" 2>/dev/null \
        && printf '%s\t1\n' "$fp" >> "$STATE/touched.tsv"
    else
      printf '%s\t0\n' "$fp" >> "$STATE/touched.tsv"   # did not exist yet
    fi
    exit 0
    ;;

  end)
    prompt=$(cat "$STATE/prompt" 2>/dev/null || echo turn)
    short=$(date +%s)
    dir="$STATE/before-$short"
    pairs=()   # "<before path>\t<current path>\t<A|M|D>"

    add_pair() { # abs-path  before-image-or-empty  had-before(0|1)
      local abs="$1" src="$2" had="$3" dst now st
      dst="$dir$abs"
      mkdir -p "$(dirname "$dst")" 2>/dev/null || return
      if [ "$had" = 1 ] && [ -n "$src" ]; then cp "$src" "$dst" 2>/dev/null; else : > "$dst"; fi
      [ -e "$abs" ] && now=1 || now=0
      [ "$now" = 1 ] && cmp -s "$dst" "$abs" && return   # not a real change
      if   [ "$had" = 0 ]; then st=A
      elif [ "$now" = 0 ]; then st=D
      else                      st=M
      fi
      pairs+=("$dst"$'\t'"$abs"$'\t'"$st")
    }

    # --- repos ----------------------------------------------------------
    cwd_repo=""; cwd_before=""; cwd_after=""
    if [ -f "$STATE/repos.tsv" ]; then
      while IFS=$'\t' read -r repo before; do
        [ -n "$repo" ] && [ -n "$before" ] || continue
        after=$(snapshot_tree "$repo") || continue
        [ -n "$after" ] && [ "$before" != "$after" ] || continue
        if is_under "$PWD" "$repo" && [ -z "$cwd_repo" ]; then
          cwd_repo="$repo"; cwd_before="$before"; cwd_after="$after"
        fi
        while IFS= read -r -d '' f; do
          git -C "$repo" diff --numstat "$before" "$after" -- "$f" 2>/dev/null \
            | head -1 | grep -q '^-' && continue     # binary
          tmp="$STATE/blob.tmp"
          if git -C "$repo" cat-file -e "$before:$f" 2>/dev/null; then
            git -C "$repo" show "$before:$f" > "$tmp" 2>/dev/null
            add_pair "$repo/$f" "$tmp" 1
          else
            add_pair "$repo/$f" "" 0
          fi
          rm -f "$tmp"
        done < <(git -C "$repo" diff --name-only -z "$before" "$after" 2>/dev/null)
      done < "$STATE/repos.tsv"
    fi

    # --- files outside every repo ----------------------------------------
    if [ -s "$STATE/touched.tsv" ]; then
      while IFS=$'\t' read -r abs had; do
        [ -n "$abs" ] || continue
        add_pair "$abs" "$STATE/blobs$abs" "${had:-0}"
      done < "$STATE/touched.tsv"
    fi

    rm -rf "$STATE/repos.tsv" "$STATE/touched.tsv" "$STATE/blobs" 2>/dev/null
    [ "${#pairs[@]}" -gt 0 ] || { rm -rf "$dir" 2>/dev/null; exit 0; }

    # --- shadow ref for the repo containing cwd: latest turn only --------
    if [ -n "$cwd_repo" ]; then
      parent=$(git -C "$cwd_repo" rev-parse -q --verify HEAD 2>/dev/null || true)
      head_tree=$(git -C "$cwd_repo" rev-parse -q --verify "HEAD^{tree}" 2>/dev/null || true)
      if [ "$cwd_before" != "${head_tree:-}" ]; then
        b=$(git -C "$cwd_repo" commit-tree "$cwd_before" ${parent:+-p "$parent"} \
              -m "· uncommitted state before this turn" 2>/dev/null)
        [ -n "$b" ] && parent="$b"
      fi
      c=$(git -C "$cwd_repo" commit-tree "$cwd_after" ${parent:+-p "$parent"} \
            -m "$prompt" 2>/dev/null)
      [ -n "$c" ] && git -C "$cwd_repo" update-ref refs/claude/turns "$c" 2>/dev/null
    fi

    # --- purge every earlier turn, then publish --------------------------
    find "$HOME/.claude/turn-diff" -maxdepth 1 -mindepth 1 -type d ! -path "$STATE" \
      -exec rm -rf {} + 2>/dev/null
    find "$STATE" -maxdepth 1 -mindepth 1 -name 'before-*' \
      ! -path "$dir" -exec rm -rf {} + 2>/dev/null

    # Written atomically so the extension's watcher never reads a half-written
    # manifest. Tuple order is [resource, original, modified, status].
    printf '%s\n' "${pairs[@]}" \
      | jq -R -s --arg root "$PWD" --arg title "Last turn changes" \
                 --arg ts "$short-$$" '
          { root: $root, title: $title, ts: $ts,
            files: [ split("\n")[]
                     | select(length > 0)
                     | split("\t")
                     | [.[1], .[0], .[1], .[2]] ] }' \
      > "$MANIFEST.tmp" 2>/dev/null \
      && mv -f "$MANIFEST.tmp" "$MANIFEST" 2>/dev/null
    exit 0
    ;;
esac
exit 0
