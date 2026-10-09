#!/usr/bin/env bash

source "$(dirname "${BASH_SOURCE[0]}")/common.sh"

VERSION="$(version)"
TAG="v$VERSION"
CHANGELOG_VERSION="$(grep -m 1 '^## ' CHANGELOG.md | sed 's/^## //')"
REPO_URL="$(node -p "require('./package.json').repository.url" | sed 's/\.git$//')"

[ "$CHANGELOG_VERSION" = "$VERSION" ] || {
  echo "package.json says $VERSION but the latest changelog section is $CHANGELOG_VERSION" >&2
  exit 1
}

[ -z "$(git status --porcelain)" ] || {
  echo "the working tree has uncommitted changes" >&2
  exit 1
}

git fetch -q origin || exit 1

[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || {
  echo "HEAD is not what origin/main has — push first" >&2
  exit 1
}

tag_exists() {
  git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && return 0
  git ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1
}

tag_exists && {
  echo "$TAG already exists" >&2
  exit 1
}

npm test || {
  echo "tests failed — not tagging" >&2
  exit 1
}

git tag "$TAG" || exit 1
git push origin "$TAG" || exit 1

echo
echo "pushed $TAG — the Publish workflow takes it from here: $REPO_URL/actions"
