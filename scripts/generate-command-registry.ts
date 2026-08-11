import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const roots = [
  join(import.meta.dir, "..", "src", "commands"),
  join(import.meta.dir, "..", "src", "plugins"),
];
const output = join(
  import.meta.dir,
  "..",
  ".generated",
  "command-registry.ts",
);

async function manifestPaths(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? manifestPaths(path) : [];
    }),
  );
  const found = entries.some((entry) => entry.name === "command.json")
    ? [join(directory, "command.json")]
    : [];
  return [...found, ...nested.flat()];
}

const manifestFiles = (
  await Promise.all(roots.map((root) => manifestPaths(root)))
).flat();

const generatedDirectory = join(import.meta.dir, "..", ".generated");
const importPath = (path: string) =>
  relative(generatedDirectory, path).replaceAll("\\", "/");

const modules = manifestFiles
  .filter((manifest) => existsSync(join(manifest, "..", "command.ts")))
  .map((manifest, index) => ({
    alias: `m${index}`,
    moduleImport: importPath(join(manifest, "..", "command")),
  }));

const lines = [
  'import { parseCommandManifest, type CommandManifest } from "../src/schemas/manifest";',
  ...manifestFiles.map(
    (manifest, index) =>
      `import manifest${index} from "${importPath(manifest)}";`,
  ),
  ...modules.map((m) => `import * as ${m.alias} from "${m.moduleImport}";`),
  'import type { ActionRegistry } from "../src/internal/registry";',
  "",
  "export const manifests: readonly CommandManifest[] = [",
  ...manifestFiles.map((_, index) => `  parseCommandManifest(manifest${index}),`),
  "];",
  "",
  "export function registerCommandModules(registry: ActionRegistry): void {",
  ...modules.map((m) => `  ${m.alias}.register(registry);`),
  "}",
  "",
];

await mkdir(generatedDirectory, { recursive: true });
await writeFile(output, lines.join("\n"));
