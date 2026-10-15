import { readFileSync } from "node:fs";
import { z } from "zod";

const PackageJson = z.object({ version: z.string() });

export function version(): string {
  const raw = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  return PackageJson.parse(JSON.parse(raw)).version;
}
