---
name: doctor
description: Diagnoses the Brujula plugin environment of this machine and project (Node version, git access to the marketplace without prompts, native runtime dependencies, whether the project declares if it uses pull requests) and tells the user the exact command that fixes each failing check. Use when the plugin, its MCP server or an update does not work.
disable-model-invocation: true
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs *)
---

Run exactly this command (the paths are passed as arguments because commands do not inherit them):

```bash
node ${CLAUDE_PLUGIN_ROOT}/scripts/doctor.mjs "${CLAUDE_PLUGIN_ROOT}" "${CLAUDE_PLUGIN_DATA}"
```

It prints a JSON array of checks `{ name, ok, detail, fix, skipped? }` and exits 1 if any check fails.

Report in Spanish, briefly:

1. One line per check: ✅ (ok), ❌ (not ok) or ⚠️ (`skipped`: this environment cannot run it,
   it is not a failure), the `name` and its `detail`. For a skipped check, copy the command in
   its `detail` in a code block: the user runs it in a normal terminal.
2. For each failing check, the `fix` command in a code block, copied verbatim.
3. If every check passes, say so in one line.

Say only what the JSON says. Do not guess causes it does not state, and do not run the fixes yourself.
