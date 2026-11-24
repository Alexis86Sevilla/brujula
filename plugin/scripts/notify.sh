#!/usr/bin/env bash
# Notification and Stop: tell the human that Claude is waiting or done.
# Tries notify-send (WSLg), then a Windows toast through PowerShell, then the terminal bell.
# Set BRUJULA_NOTIFY_DRY_RUN=1 to print instead of notifying (used by the tests).
set -u

json="$(dirname "${BASH_SOURCE[0]}")/lib/json.mjs"
{
  IFS= read -r -d '' event
  IFS= read -r -d '' title
  IFS= read -r -d '' message
} < <(node "$json" get hook_event_name=Notification "title=Claude Code" "message=Claude needs your attention")
[ "$event" = "Stop" ] && message="Turn finished"
project=$(basename "${CLAUDE_PROJECT_DIR:-$PWD}")
title="$title · $project"

if [ "${BRUJULA_NOTIFY_DRY_RUN:-}" = "1" ]; then
  echo "$title|$message"
  exit 0
fi

if command -v notify-send >/dev/null 2>&1; then
  notify-send "$title" "$message" 2>/dev/null && exit 0
fi
# Single quotes would break out of the PowerShell string: double them.
ps_title=${title//\'/\'\'}
ps_message=${message//\'/\'\'}
if command -v powershell.exe >/dev/null 2>&1; then
  powershell.exe -NoProfile -Command "
    Add-Type -AssemblyName System.Windows.Forms
    \$n = New-Object System.Windows.Forms.NotifyIcon
    \$n.Icon = [System.Drawing.SystemIcons]::Information
    \$n.Visible = \$true
    \$n.ShowBalloonTip(4000, '$ps_title', '$ps_message', 'Info')
    Start-Sleep -Seconds 5
    \$n.Dispose()" >/dev/null 2>&1 && exit 0
fi
printf '\a' >/dev/tty 2>/dev/null
exit 0