#!/usr/bin/env sh

# abort on errors
set -e

# init submodules
git submodule update --init

# build AR Engine WASM if emcc is available
if command -v emcc >/dev/null 2>&1; then
  make -C ar-engine/engine/
else
  echo "Warning: emcc not found, skipping AR Engine WASM build"
fi

# build
yarn install --immutable
yarn run build

# copy AR Engine web assets into dist (if ar-engine/web exists)
if [ -d "ar-engine/web" ]; then
  mkdir -p .vitepress/dist/ar
  cp -r ar-engine/web/. .vitepress/dist/ar/
fi

# navigate into the build output directory
cd blog/.vuepress/dist
git config --global user.email "github-actions@example.com"
git config --global user.name "GitHubActions[Bot]"

git init
git remote add origin https://alterfo:$1@github.com/alterfo/alterfo.github.io.git
git add -A
git commit -m 'deploy'

git push -f --set-upstream origin master

cd -
