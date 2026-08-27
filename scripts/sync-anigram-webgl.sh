#!/usr/bin/env bash

set -euo pipefail

script_directory="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
repository_root="$(cd "${script_directory}/.." && pwd)"
build_source="${repository_root}/unity/AnigramUnity/Builds/WebGL"
public_target="${repository_root}/frontend/public/anigram-unity"

required_files=(
  "index.html"
  "Build/WebGL.loader.js"
  "Build/WebGL.data"
  "Build/WebGL.framework.js"
  "Build/WebGL.wasm"
)

for required_file in "${required_files[@]}"; do
  if [[ ! -f "${build_source}/${required_file}" ]]; then
    echo "Unity WebGL成果物が不足しています: ${required_file}" >&2
    echo "Unityで『Anigram > WebGL技術検証をビルド』を実行してください。" >&2
    exit 1
  fi
done

mkdir -p "${public_target}"
cp -R "${build_source}/." "${public_target}/"

echo "Anigram WebGL成果物をfrontend/public/anigram-unityへ同期しました。"
