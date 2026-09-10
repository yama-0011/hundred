#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$repo_dir/workers/card-home-poc"
case "${1:-start}" in
  init)
    npm install
    npm run setup
    ;;
  art-init)
    npm run db:seed -- data/master-poc-art-001.json
    ;;
  art-start)
    exec npm run dev -- --var MASTER_VERSION:poc-art-001
    ;;
  bs01-init)
    node node_modules/wrangler/bin/wrangler.js d1 migrations apply hundred-card-home-local --local
    node scripts/export-bs01.mjs
    npm run db:seed -- data/releases/bs01-red-001/master.json data/releases/bs01-red-001/deck.json
    ;;
  bs01-start)
    node node_modules/wrangler/bin/wrangler.js d1 migrations apply hundred-card-home-local --local
    dev_args=(--var MASTER_VERSION:bs01-red-001)
    if [[ -n "${BATTLE_PUBLIC_URL:-}" ]]; then
      dev_args+=(--var "BATTLE_PUBLIC_URL:$BATTLE_PUBLIC_URL")
    fi
    exec npm run dev -- "${dev_args[@]}"
    ;;
  start)
    exec npm run dev
    ;;
  *) printf '%s\n' 'Usage: card-home-poc.sh [init|start|art-init|art-start|bs01-init|bs01-start]' >&2; exit 2 ;;
esac
