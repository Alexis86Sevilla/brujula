import { execFile, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const run = promisify(execFile);
const script = join(process.cwd(), "scripts/ado-pr-comment.sh");

type Comment = { id: number; content: string; publishedDate?: string };
type Thread = { id: number; status: string; comments: Comment[] };
type Request = { method: string; url: string; body: unknown };

/** Minimal Azure DevOps PR threads API: GET/POST threads, POST comments, PATCH thread. */
function fakeAdo(initial: Thread[]) {
  const threads: Thread[] = structuredClone(initial);
  const requests: Request[] = [];
  const read = (req: IncomingMessage) =>
    new Promise<unknown>((resolve) => {
      let data = "";
      req.on("data", (c) => (data += c));
      req.on("end", () => resolve(data ? JSON.parse(data) : null));
    });
  const server: Server = createServer(async (req, res) => {
    const body = await read(req);
    const url = req.url ?? "";
    requests.push({ method: req.method ?? "", url, body });
    const send = (code: number, payload: unknown) => {
      res.writeHead(code, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    };
    const one = /\/threads\/(\d+)(\/comments)?\?/.exec(url);
    if (req.method === "GET" && /\/threads\?/.test(url)) return send(200, { value: threads, count: threads.length });
    if (req.method === "POST" && /\/threads\?/.test(url)) {
      const t = body as Thread;
      const created = { ...t, id: 100 + threads.length, comments: t.comments.map((c, i) => ({ ...c, id: i + 1 })) };
      threads.push(created);
      return send(200, created);
    }
    if (one && req.method === "POST" && one[2]) {
      const t = threads.find((x) => x.id === Number(one[1]));
      if (!t) return send(404, {});
      const c = { ...(body as Comment), id: t.comments.length + 1 };
      t.comments.push(c);
      return send(200, c);
    }
    if (one && req.method === "PATCH") {
      const t = threads.find((x) => x.id === Number(one[1]));
      if (!t) return send(404, {});
      t.status = (body as { status: string }).status;
      return send(200, t);
    }
    send(404, { message: "not found" });
  });
  return new Promise<{ base: string; threads: Thread[]; requests: Request[]; server: Server }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, threads, requests, server }),
    ),
  );
}

function first<T>(xs: T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error("empty list");
  return x;
}

let servers: Server[] = [];
afterEach(() => {
  servers.forEach((s) => s.close());
  servers = [];
});

/** A git repo whose HEAD contains `files`; returns its dir and the HEAD sha. */
function repo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "adocomment-"));
  const git = (...args: string[]) => execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", "main");
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  git("add", "-A");
  git("-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "c");
  return { dir, sha: git("rev-parse", "HEAD") };
}

const findingKey = (path: string, evidence: string) =>
  Buffer.from(JSON.stringify({ path, evidence })).toString("base64");

function reviewDir(findings: object[]) {
  const dir = mkdtempSync(join(tmpdir(), "review-"));
  writeFileSync(join(dir, "review.json"), JSON.stringify({ summary: "s", findings }));
  writeFileSync(join(dir, "review.md"), "## Revisión automática (Claude)\n\ns");
  return dir;
}

async function post(ado: { base: string }, cwd: string, sha: string, args: string[]) {
  return run(script, args, {
    cwd,
    env: {
      ...process.env,
      SYSTEM_ACCESSTOKEN: "test-token",
      SYSTEM_COLLECTIONURI: ado.base,
      SYSTEM_TEAMPROJECTID: "proj",
      BUILD_REPOSITORY_ID: "repo",
      SYSTEM_PULLREQUEST_PULLREQUESTID: "7",
      SYSTEM_PULLREQUEST_SOURCECOMMITID: sha,
    },
  });
}

const summaryThread = (id: number, sha: string, date: string): Thread => ({
  id,
  status: "closed",
  comments: [{ id: 1, content: `<!-- brujula-review:${sha} -->\nresumen`, publishedDate: date }],
});

describe("ado-pr-comment.sh", () => {
  it("--last-reviewed prints the most recent reviewed sha from the PR threads", async () => {
    const ado = await fakeAdo([summaryThread(1, "aaa111", "2026-11-01T10:00:00Z")]);
    servers.push(ado.server);
    first(ado.threads).comments.push({
      id: 2,
      content: "<!-- brujula-review:bbb222 -->\nincremental",
      publishedDate: "2026-11-02T10:00:00Z",
    });
    const { dir, sha } = repo({ "a.ts": "x\n" });
    const r = await post(ado, dir, sha, ["--last-reviewed"]);
    expect(r.stdout.trim()).toBe("bbb222");
  });

  it("--last-reviewed prints nothing on a PR without reviews", async () => {
    const ado = await fakeAdo([]);
    servers.push(ado.server);
    const { dir, sha } = repo({ "a.ts": "x\n" });
    expect((await post(ado, dir, sha, ["--last-reviewed"])).stdout.trim()).toBe("");
  });

  it("does not open a duplicate thread for a finding that is still present", async () => {
    const evidence = "return xs[xs.length];";
    const { dir, sha } = repo({ "src/a.ts": `export const f = (xs) => {\n  ${evidence}\n};\n` });
    const ado = await fakeAdo([
      summaryThread(1, "old", "2026-11-01T10:00:00Z"),
      {
        id: 2,
        status: "active",
        comments: [{ id: 1, content: `<!-- brujula-finding:${findingKey("src/a.ts", evidence)} -->\n**major**` }],
      },
    ]);
    servers.push(ado.server);
    const finding = { path: "src/a.ts", line: 2, severity: "major", problem: "off by one", evidence, fix: "-1" };
    await post(ado, dir, sha, [reviewDir([finding])]);
    const newThreads = ado.requests.filter((r) => r.method === "POST" && /\/threads\?/.test(r.url));
    expect(newThreads).toHaveLength(0);
    expect(ado.threads.find((t) => t.id === 2)?.status).toBe("active");
  });

  it("marks as fixed the thread of a finding whose code is gone", async () => {
    const { dir, sha } = repo({ "src/a.ts": "export const f = (xs) => xs.at(-1);\n" });
    const ado = await fakeAdo([
      summaryThread(1, "old", "2026-11-01T10:00:00Z"),
      {
        id: 2,
        status: "active",
        comments: [{ id: 1, content: `<!-- brujula-finding:${findingKey("src/a.ts", "xs[xs.length]")} -->` }],
      },
    ]);
    servers.push(ado.server);
    const r = await post(ado, dir, sha, [reviewDir([])]);
    const patch = ado.requests.find((q) => q.method === "PATCH");
    expect(patch?.url).toContain("/threads/2?");
    expect(patch?.body).toEqual({ status: "fixed" });
    expect(r.stdout + r.stderr).toContain("fixed thread 2");
  });

  it("adds the new summary to the existing summary thread instead of opening another", async () => {
    const { dir, sha } = repo({ "src/a.ts": "x\n" });
    const ado = await fakeAdo([summaryThread(1, "old", "2026-11-01T10:00:00Z")]);
    servers.push(ado.server);
    await post(ado, dir, sha, [reviewDir([])]);
    expect(ado.threads).toHaveLength(1);
    expect(first(ado.threads).comments.at(-1)?.content).toContain(`brujula-review:${sha}`);
  });

  it("opens a keyed inline thread for a new finding", async () => {
    const evidence = "return xs[xs.length];";
    const { dir, sha } = repo({ "src/a.ts": `export const f = (xs) => {\n  ${evidence}\n};\n` });
    const ado = await fakeAdo([]);
    servers.push(ado.server);
    const finding = { path: "src/a.ts", line: 2, severity: "blocker", problem: "off by one", evidence, fix: "-1" };
    await post(ado, dir, sha, [reviewDir([finding])]);
    const inline = ado.threads.find((t) => t.comments.some((c) => c.content.includes("brujula-finding:")));
    expect(inline?.comments[0]?.content).toContain(findingKey("src/a.ts", evidence));
    expect(ado.threads.find((t) => t.comments.some((c) => c.content.includes(`brujula-review:${sha}`)))?.status).toBe(
      "active",
    );
  });

  it("posts nothing when this commit was already reviewed", async () => {
    const { dir, sha } = repo({ "src/a.ts": "x\n" });
    const ado = await fakeAdo([summaryThread(1, "placeholder", "2026-11-01T10:00:00Z")]);
    first(first(ado.threads).comments).content = `<!-- brujula-review:${sha} -->`;
    servers.push(ado.server);
    const r = await post(ado, dir, sha, [reviewDir([])]);
    expect(r.stdout).toContain("already reviewed");
    expect(ado.requests.filter((q) => q.method !== "GET")).toHaveLength(0);
  });
});
