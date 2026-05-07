#!/usr/bin/env bash
set -euo pipefail

# Bump version: patch | minor | major
LEVEL="${1:-patch}"
CURRENT=$(node -p "require('./package.json').version")

echo "Current version: $CURRENT"
echo "Bumping $LEVEL..."

npm version "$LEVEL" --no-git-tag-version

NEW=$(node -p "require('./package.json').version")

git add package.json
git commit -m "chore: bump version to $NEW"
git tag "v$NEW"

echo "Done: $CURRENT → $NEW (tag: v$NEW)"
echo ""
echo "To push: git push && git push --tags"
