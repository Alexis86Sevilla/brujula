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

/** Identity of the pipeline job (what connectionData returns) and of a PR author. */
const BOT = { id: "bot-id", displayName: "Project Build Service" };
const AUTHOR = { id: "author-id", displayName: "PR author" };

type Author = { id: string; displayName: string };
type Comment = { id: number; content: string; publishedDate?: string; author: Author };
type Thread = { id: number; status: string; comments: Comment[] };
type Request = { method: string; url: string; body: unknown };

function first<T>(xs: T[]): T {
  const x = xs[0];
  if (x === undefined) throw new Error("empty list");
  return x;
}

/** Minimal Azure DevOps API: connectionData, GET/POST threads, POST comments, PATCH thread. */
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
    if (/\/_apis\/connectionData/.test(url)) return send(200, { authenticatedUser: BOT });
    const one = /\/threads\/(\d+)(\/comments)?\?/.exec(url);
    if (req.method === "GET" && /\/threads\?/.test(url)) return send(200, { value: threads, count: threads.length });
    if (req.method === "POST" && /\/threads\?/.test(url)) {
      const t = body as Thread;
      const created = {
        ...t,
        id: 100 + threads.length,
        comments: t.comments.map((c, i) => ({ ...c, id: i + 1, author: BOT })),
      };
      threads.push(created);
      return send(200, created);
    }
    const thread = one ? threads.find((x) => x.id === Number(one[1])) : undefined;
    if (one && !thread) return send(404, {});
    if (thread && req.method === "POST" && one?.[2]) {
      const c = { ...(body as Comment), id: thread.comments.length + 1, author: BOT };
      thread.comments.push(c);
      return send(200, c);
    }
    if (thread && req.method === "PATCH") {
      thread.status = (body as { status: string }).status;
      return send(200, thread);
    }
    send(404, { message: "not found" });
  });
  return new Promise<{ base: string; threads: Thread[]; requests: Request[]; server: Server }>((resolve) =>
    server.listen(0, "127.0.0.1", () =>
      resolve({ base: `http://127.0.0.1:${(server.address() as AddressInfo).port}/`, threads, requests, server }),
    ),
  );
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

function reviewDir(findings: object[], extra: object = {}) {
  const dir = mkdtempSync(join(tmpdir(), "review-"));
  writeFileSync(join(dir, "review.json"), JSON.stringify({ summary: "s", findings, ...extra }));
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

const summaryThread = (id: number, sha: string, date: string, author: Author = BOT, status = "closed"): Thread => ({
  id,
  status,
  comments: [{ id: 1, content: `<!-- brujula-review:${sha} -->\nresumen`, publishedDate: date, author }],
});

const findingThread = (id: number, path: string, evidence: string, author: Author = BOT): Thread => ({
  id,
  status: "active",
  comments: [{ id: 1, content: `<!-- brujula-finding:${findingKey(path, evidence)} -->\n**major**`, author }],
});

const posts = (ado: { requests: Request[] }) =>
  ado.requests.filter((r) => r.method === "POST" && /\/threads\?/.test(r.url));

describe("ado-pr-comment.sh --last-reviewed", () => {
  it("prints the most recent sha reviewed by the job identity", async () => {
    const ado = await fakeAdo([summaryThread(1, "aaa111", "2026-11-01T10:00:00Z")]);
    servers.push(ado.server);
    first(ado.threads).comments.push({
      id: 2,
      content: "<!-- brujula-review:bbb222 -->\nincremental",
      publishedDate: "2026-11-02T10:00:00Z",
      author: BOT,
    });
    const { dir, sha } = repo({ "a.ts": "x\n" });
    expect((await post(ado, dir, sha, ["--last-reviewed"])).stdout.trim()).toBe("bbb222");
  });

  it("ignores a marker forged by someone else in the PR", async () => {
    const ado = await fakeAdo([
      summaryThread(1, "aaa111", "2026-11-01T10:00:00Z"),
      summaryThread(2, "fff999", "2026-11-03T10:00:00Z", AUTHOR),
    ]);
    servers.push(ado.server);
    const { dir, sha } = repo({ "a.ts": "x\n" });
    expect((await post(ado, dir, sha, ["--last-reviewed"])).stdout.trim()).toBe("aaa111");
  });

  it("prints nothing on a PR without reviews", async () => {
    const ado = await fakeAdo([]);
    servers.push(ado.server);
    const { dir, sha } = repo({ "a.ts": "x\n" });
    expect((await post(ado, dir, sha, ["--last-reviewed"])).stdout.trim()).toBe("");
  });
});

describe("ado-pr-comment.sh posting", () => {
  const evidence = "return xs[xs.length];";
  const buggy = `export const f = (xs) => {\n  ${evidence}\n};\n`;
  const finding = { path: "src/a.ts", line: 2, severity: "major", problem: "off by one", evidence, fix: "-1" };

  it("does not open a duplicate thread for a finding that is still present", async () => {
    const { dir, sha } = repo({ "src/a.ts": buggy });
    const ado = await fakeAdo([
      summaryThread(1, "old", "2026-11-01T10:00:00Z"),
      findingThread(2, "src/a.ts", evidence),
    ]);
    servers.push(ado.server);
    await post(ado, dir, sha, [reviewDir([finding])]);
    expect(posts(ado)).toHaveLength(0);
    expect(ado.threads.find((t) => t.id === 2)?.status).toBe("active");
  });

  it("a finding key forged by someone else does not suppress a real finding", async () => {
    const { dir, sha } = repo({ "src/a.ts": buggy });
    const ado = await fakeAdo([findingThread(2, "src/a.ts", evidence, AUTHOR)]);
    servers.push(ado.server);
    await post(ado, dir, sha, [reviewDir([finding])]);
    const inline = ado.threads.filter((t) =>
      t.comments.some((c) => c.author.id === BOT.id && c.content.includes("brujula-finding:")),
    );
    expect(inline).toHaveLength(1);
  });

  it("marks as fixed the thread of a finding whose code is gone", async () => {
    const { dir, sha } = repo({ "src/a.ts": "export const f = (xs) => xs.at(-1);\n" });
    const ado = await fakeAdo([
      summaryThread(1, "old", "2026-11-01T10:00:00Z"),
      findingThread(2, "src/a.ts", "xs[xs.length]"),
    ]);
    servers.push(ado.server);
    const r = await post(ado, dir, sha, [reviewDir([])]);
    const patch = ado.requests.find((q) => q.method === "PATCH" && q.url.includes("/threads/2?"));
    expect(patch?.body).toEqual({ status: "fixed" });
    expect(r.stdout + r.stderr).toContain("fixed thread 2");
  });

  it("never marks as fixed a thread it did not open", async () => {
    const { dir, sha } = repo({ "src/a.ts": "clean\n" });
    const ado = await fakeAdo([findingThread(2, "src/a.ts", "gone", AUTHOR)]);
    servers.push(ado.server);
    await post(ado, dir, sha, [reviewDir([])]);
    expect(ado.requests.filter((q) => q.method === "PATCH")).toHaveLength(0);
  });

  it("opens a keyed inline thread for a new finding whose evidence is in the file", async () => {
    const { dir, sha } = repo({ "src/a.ts": buggy });
    const ado = await fakeAdo([]);
    servers.push(ado.server);
    await post(ado, dir, sha, [reviewDir([{ ...finding, severity: "blocker" }])]);
    const inline = ado.threads.find((t) => t.comments.some((c) => c.content.includes("brujula-finding:")));
    expect(inline?.comments[0]?.content).toContain(findingKey("src/a.ts", evidence));
    const summary = ado.threads.find((t) => t.comments.some((c) => c.content.includes(`brujula-review:${sha}`)));
    expect(summary?.status).toBe("active");
  });

  it("posts a finding whose evidence is not in the file without a tracking key", async () => {
    const { dir, sha } = repo({ "src/a.ts": "something else\n" });
    const ado = await fakeAdo([]);
    servers.push(ado.server);
    await post(ado, dir, sha, [reviewDir([finding])]);
    const inline = ado.threads.filter((t) => t.comments.some((c) => c.content.includes("off by one")));
    expect(inline).toHaveLength(1);
    expect(first(first(inline).comments).content).not.toContain("brujula-finding:");
  });

  it("adds the new summary to the existing summary thread and does not close it", async () => {
    const { dir, sha } = repo({ "src/a.ts": "x\n" });
    const ado = await fakeAdo([summaryThread(1, "old", "2026-11-01T10:00:00Z", BOT, "active")]);
    servers.push(ado.server);
    await post(ado, dir, sha, [reviewDir([])]);
    expect(ado.threads).toHaveLength(1);
    expect(first(ado.threads).comments.at(-1)?.content).toContain(`brujula-review:${sha}`);
    expect(first(ado.threads).status).toBe("active");
  });

  it("a failed review is reported without the marker, so the next run reviews this commit again", async () => {
    const { dir, sha } = repo({ "src/a.ts": "x\n" });
    const ado = await fakeAdo([]);
    servers.push(ado.server);
    await post(ado, dir, sha, [reviewDir([], { failed: true })]);
    const all = ado.threads.flatMap((t) => t.comments.map((c) => c.content)).join("\n");
    expect(all).toContain("Revisión automática");
    expect(all).not.toContain("brujula-review:");
  });

  it("posts nothing when this commit was already reviewed by the job", async () => {
    const { dir, sha } = repo({ "src/a.ts": "x\n" });
    const ado = await fakeAdo([summaryThread(1, sha, "2026-11-01T10:00:00Z")]);
    servers.push(ado.server);
    const r = await post(ado, dir, sha, [reviewDir([])]);
    expect(r.stdout).toContain("already reviewed");
    expect(ado.requests.filter((q) => q.method !== "GET")).toHaveLength(0);
  });

  it("a forged 'already reviewed' marker does not stop the review", async () => {
    const { dir, sha } = repo({ "src/a.ts": "x\n" });
    const ado = await fakeAdo([summaryThread(1, sha, "2026-11-01T10:00:00Z", AUTHOR)]);
    servers.push(ado.server);
    const r = await post(ado, dir, sha, [reviewDir([])]);
    expect(r.stdout).not.toContain("already reviewed");
    expect(ado.threads.some((t) => t.comments.some((c) => c.author.id === BOT.id))).toBe(true);
  });
});
