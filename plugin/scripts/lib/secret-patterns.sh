# Shared secret patterns, sourced by user-prompt.sh and secret-scan.sh.
# Single source of truth: add new patterns here only.
# AWS access key | GitHub token | Anthropic key | PEM private key | Azure DevOps PAT (52 chars base32)
# shellcheck disable=SC2034  # used by the scripts that source this file
secret_re='(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{36}|sk-ant-[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|(^|[^A-Za-z0-9])[a-z2-7]{52}([^A-Za-z0-9]|$))'
