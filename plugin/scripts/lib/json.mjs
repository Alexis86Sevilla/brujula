// JSON helper for the hook scripts, so they need no jq (native Windows has none; Node is already
// required by the plugin). Plain ESM, no dependencies. Usage:
//
//   node json.mjs get <path>[=default] ...   hook JSON on stdin; prints each field followed by a NUL
//                                            byte (read it with `read -r -d ''`). Strings print raw,
//                                            objects/arrays/numbers/booleans as JSON; a missing or null
//                                            field prints its default, or nothing. Invalid input: as
//                                            if every field were missing.
//   node json.mjs decision <ask|deny> <reason>   PreToolUse permission decision
//   node json.mjs block <reason>                 {decision: "block", reason}
//   node json.mjs context <event> <text>         hookSpecificOutput.additionalContext
//   node json.mjs config <shared> <local> [--pretty]   merged project settings (see project-config.sh);
//                                                      exit 1 + reason on stderr if a file is invalid
//   node json.mjs pull-requests <shared> <local>       true | false | unset | invalid
//   node json.mjs setting <shared> <local> <key>       the value of <key>, or nothing
//
// Output objects are printed with 2-space indentation, like `jq -n`.
import { readFileSync, readSync, statSync } from "node:fs";

const [command, ...args] = process.argv.slice(2);

const print = (value) => process.stdout.write(JSON.stringify(value, null, 2) + "\n");

/**
 * All of stdin. A non-blocking pipe (seen on Windows) raises EAGAIN: wait and retry instead of
 * reading nothing, which a guard would take for an empty, harmless input. Any other read error
 * propagates, so the helper exits non-zero and prints nothing; callers that must fail closed
 * detect the missing fields.
 */
function readStdin() {
  const chunks = [];
  const buffer = Buffer.alloc(65536);
  const pause = new Int32Array(new SharedArrayBuffer(4));
  for (;;) {
    let n;
    try {
      n = readSync(0, buffer, 0, buffer.length, null);
    } catch (err) {
      if (err.code === "EAGAIN") {
        Atomics.wait(pause, 0, 0, 10);
        continue;
      }
      if (err.code === "EOF") break;
      throw err;
    }
    if (n === 0) break;
    chunks.push(Buffer.from(buffer.subarray(0, n)));
  }
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * A field as `jq -r` prints it: strings raw, anything else as compact JSON. NUL bytes are dropped
 * (as bash did with jq's output): the fields are NUL-separated, and a NUL inside a value would
 * empty or shift the fields a guard reads.
 */
const raw = (value) => (typeof value === "string" ? value : JSON.stringify(value)).replaceAll("\0", "");

function get(paths) {
  let input;
  try {
    input = JSON.parse(readStdin());
  } catch {
    input = undefined;
  }
  let out = "";
  for (const spec of paths) {
    const eq = spec.indexOf("=");
    const path = eq < 0 ? spec : spec.slice(0, eq);
    const fallback = eq < 0 ? "" : spec.slice(eq + 1);
    let value = input;
    for (const key of path.split(".")) {
      value = value !== null && typeof value === "object" && !Array.isArray(value) ? value[key] : undefined;
    }
    out += (value === undefined || value === null ? fallback : raw(value)) + "\0";
  }
  process.stdout.write(out);
}

const STRING_KEYS = ["baseBranch", "testCmd", "lintCmd", "adoProject"];

/** One settings file: exactly one JSON object whose known keys have the right type, or undefined. */
function readSettings(file) {
  try {
    const value = JSON.parse(readFileSync(file, "utf8").replace(/^\uFEFF/, ""));
    if (value === null || typeof value !== "object" || Array.isArray(value)) return undefined;
    if ("pullRequests" in value && typeof value.pullRequests !== "boolean") return undefined;
    if (!STRING_KEYS.every((k) => value[k] === undefined || value[k] === null || typeof value[k] === "string")) {
      return undefined;
    }
    return value;
  } catch {
    return undefined;
  }
}

const isFile = (file) => {
  try {
    return statSync(file).isFile();
  } catch {
    return false;
  }
};

/**
 * Merged settings: the personal file wins key by key. testCmd and lintCmd are commands the quality
 * gate runs outside the sandbox, so they are taken only from the personal file.
 */
function mergedConfig(shared, local) {
  let merged = {};
  for (const file of [shared, local]) {
    if (!isFile(file)) continue;
    const settings = readSettings(file);
    if (settings === undefined) {
      process.stderr.write(
        `${file} is invalid: it must be a JSON object like {"pullRequests": true, "testCmd": "./mvnw test"}\n`,
      );
      return undefined;
    }
    if (file === shared) {
      // testCmd and lintCmd run commands: only the personal file may set them.
      const rest = { ...settings };
      delete rest.testCmd;
      delete rest.lintCmd;
      merged = { ...merged, ...rest };
    } else {
      merged = { ...merged, ...settings };
    }
  }
  return merged;
}

switch (command) {
  case "get":
    get(args);
    break;
  case "decision":
    print({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: args[0],
        permissionDecisionReason: args[1],
      },
    });
    break;
  case "block":
    print({ decision: "block", reason: args[0] });
    break;
  case "context":
    print({ hookSpecificOutput: { hookEventName: args[0], additionalContext: args[1] } });
    break;
  case "config": {
    const merged = mergedConfig(args[0], args[1]);
    if (merged === undefined) process.exit(1);
    process.stdout.write((args[2] === "--pretty" ? JSON.stringify(merged, null, 2) : JSON.stringify(merged)) + "\n");
    break;
  }
  case "pull-requests": {
    const merged = mergedConfig(args[0], args[1]);
    process.stdout.write(
      (merged === undefined ? "invalid" : "pullRequests" in merged ? String(merged.pullRequests) : "unset") + "\n",
    );
    break;
  }
  case "setting": {
    const merged = mergedConfig(args[0], args[1]);
    const value = merged?.[args[2]];
    // Like jq's `.[$k] // empty`: null and false print nothing.
    if (value !== undefined && value !== null && value !== false) process.stdout.write(raw(value) + "\n");
    break;
  }
  default:
    process.stderr.write(`json.mjs: unknown command: ${command ?? ""}\n`);
    process.exit(2);
}
