import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const roots = [
  join(import.meta.dir, "..", "src", "assets"),
  join(import.meta.dir, "..", "src", "plugins"),
];
const output = join(import.meta.dir, "..", ".generated", "embedded-assets.ts");
const isConfiguration = (path: string) =>
  path === "ports.env" || path === ".ports.generated.yml";

async function files(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : [path];
    }),
  );
  return nested.flat();
}

const sourceFiles = (await Promise.all(roots.map(files))).flat();
const entries = await Promise.all(
  sourceFiles.map(async (path) => ({
    path: path.startsWith(roots[1]!)
      ? join("plugins", relative(roots[1]!, path))
      : relative(roots[0]!, path),
    data: (await readFile(path)).toString("base64"),
    mode: (await stat(path)).mode & 0o777,
  })),
);
const filtered = entries.filter((entry) => !isConfiguration(entry.path));
await mkdir(join(import.meta.dir, "..", ".generated"), { recursive: true });
await writeFile(
  output,
  `export const embeddedAssets = ${JSON.stringify(filtered)} as const;\n`,
);
