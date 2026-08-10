#!/bin/zsh
set -euo pipefail

script_dir=${0:A:h}
source_dir="$script_dir/link-handler"
app_dir="$HOME/Applications/Agent Attention Link.app"
contents_dir="$app_dir/Contents"
macos_dir="$contents_dir/MacOS"
register_bin="/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister"

if ! command -v swiftc >/dev/null 2>&1; then
  printf '{"status":"error","repair":"install Xcode Command Line Tools to provide swiftc"}\n' >&2
  exit 1
fi
if [[ ! -x "$register_bin" ]]; then
  printf '{"status":"error","repair":"lsregister is not available at the expected LaunchServices path"}\n' >&2
  exit 1
fi

mkdir -p "$macos_dir"
swiftc -parse-as-library "$source_dir/main.swift" -o "$macos_dir/AgentAttentionLink"
cp "$source_dir/Info.plist" "$contents_dir/Info.plist"
chmod 755 "$macos_dir/AgentAttentionLink"
"$register_bin" -f "$app_dir"
printf '{"status":"installed","app":"%s","scheme":"agent-attention"}\n' "$app_dir"
