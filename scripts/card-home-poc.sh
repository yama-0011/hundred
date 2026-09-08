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
    node scripts/export-bs01.mjs
    npm run db:seed -- data/releases/bs01-red-001/master.json data/releases/bs01-red-001/deck.json
    ;;
  bs01-start)
    exec npm run dev -- --var MASTER_VERSION:bs01-red-001
    ;;
  start)
    exec npm run dev
    ;;
  *) printf '%s\n' 'Usage: card-home-poc.sh [init|start|art-init|art-start|bs01-init|bs01-start]' >&2; exit 2 ;;
esac
