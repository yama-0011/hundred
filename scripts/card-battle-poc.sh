#!/usr/bin/env bash
set -euo pipefail
repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
server_dir="$repo_dir/battle-server"
unity_dir="$repo_dir/unity/CardBattleUnity"
unity_bin="${UNITY_EDITOR:-/Applications/Unity/Hub/Editor/6000.5.10f1/Unity.app/Contents/MacOS/Unity}"
export DOTNET_USE_POLLING_FILE_WATCHER=1
export DOTNET_HOSTBUILDER__RELOADCONFIGONCHANGE=false
export DOTNET_CLI_TELEMETRY_OPTOUT=1
export DOTNET_CLI_HOME="$server_dir/.dotnet-home"
case "${1:-start}" in
  build)
    mkdir -p "$unity_dir/Logs"
    if "$unity_bin" -batchmode -nographics -quit -projectPath "$unity_dir" -buildTarget WebGL -executeMethod PocBuilder.BuildWebGl -logFile "$unity_dir/Logs/poc-build.log"; then
      printf '%s\n' 'WebGL build completed. Run this script with start.'
    else
      build_status=$?
      printf 'WebGL build failed (exit %s). Log: %s\n' "$build_status" "$unity_dir/Logs/poc-build.log" >&2
      if [[ -f "$unity_dir/Logs/poc-build.log" ]]; then
        tail -n 80 "$unity_dir/Logs/poc-build.log" >&2
      fi
      exit "$build_status"
    fi
    ;;
  start)
    if [[ -x "$server_dir/.dotnet/dotnet" ]]; then
      dotnet_bin="$server_dir/.dotnet/dotnet"
    elif command -v dotnet >/dev/null 2>&1; then
      dotnet_bin="$(command -v dotnet)"
    else
      printf '%s\n' '.NET 10 SDK is required. See battle-server/README.md.' >&2
      exit 1
    fi
    mkdir -p "$unity_dir/Builds/WebGL"
    cd "$server_dir"
    "$dotnet_bin" build --disable-build-servers -p:UseSharedCompilation=false
    printf '%s\n' 'Open http://127.0.0.1:5080 after the WebGL build. Stop with Ctrl+C.'
    exec "$dotnet_bin" bin/Debug/net10.0/BattleServer.dll
    ;;
  test)
    python3 "$server_dir/tests/smoke.py"
    ;;
  *) printf '%s\n' 'Usage: card-battle-poc.sh [build|start|test]' >&2; exit 2 ;;
esac
