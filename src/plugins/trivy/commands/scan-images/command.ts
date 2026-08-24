import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve } from "node:path";
import manifest from "./command.json";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

const dockerfileName = /^Dockerfile(?:\..+)?$/i;
const composeName = /(?:^|[-_.])compose(?:[-_.].+)?\.ya?ml$/i;

async function files(path: string): Promise<string[]> {
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const file = join(path, entry.name);
      return entry.isDirectory() ? files(file) : [file];
    }),
  );
  return nested.flat();
}

async function directory(path: string): Promise<void> {
  if (!(await stat(path)).isDirectory()) {
    throw new Error(`Trivy image scan target is not a directory: ${path}`);
  }
}

function projectPath(projectRoot: string, path: string): string {
  const resolved = resolve(projectRoot, path);
  if (resolved !== projectRoot && !resolved.startsWith(`${projectRoot}/`)) {
    throw new Error("trivy:scan-images path must stay within the project root.");
  }
  return resolved;
}

async function removeReports(reports: readonly string[]): Promise<void> {
  await Promise.all(reports.map((report) => rm(report, { force: true })));
}

function imageReferences(file: string, content: string): string[] {
  if (dockerfileName.test(basename(file))) {
    return content
      .split("\n")
      .flatMap((line) => {
        const match = line.match(/^\s*FROM\s+(?:--\S+\s+)*(\S+)/i);
        return match?.[1] && !match[1].includes("$") ? [match[1]] : [];
      });
  }

  return content
    .split("\n")
    .flatMap((line) => {
      const match = line.match(/^\s*image:\s*["']?([^\s#"']+)["']?(?:\s+#.*)?$/i);
      return match?.[1] && !match[1].includes("$") ? [match[1]] : [];
    });
}

export async function findImageReferences(path: string): Promise<string[]> {
  const candidates = (await files(path)).filter((file) =>
    dockerfileName.test(basename(file)) || composeName.test(basename(file)),
  );
  const references = await Promise.all(
    candidates.map(async (file) => imageReferences(file, await readFile(file, "utf8"))),
  );
  return [...new Set(references.flat())].sort();
}

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("scanTrivyImages", async (context, args, command) => {
    const relativePath = args[0] ?? ".";
    if (args.length > 1) {
      throw new Error("trivy:scan-images accepts at most one path.");
    }

    const target = projectPath(context.projectRoot, relativePath);
    await directory(target);
    const images = await findImageReferences(target);
    const outputPath = command?.output
      ? join(context.dockerDevDirectory, command.output.file)
      : undefined;
    if (!outputPath) {
      throw new Error("The trivy image scan command declares no output file.");
    }

    await mkdir(dirname(outputPath), { recursive: true });
    if (!images.length) {
      await Bun.write(outputPath, `${JSON.stringify({ Results: [] }, null, 2)}\n`);
      return;
    }

    const containerOutputPath = `/workspace/${relative(context.projectRoot, outputPath)}`;
    await start(context);

    const reports = images.map((_, index) => `${outputPath}.${index}`);
    try {
      for (const [index, image] of images.entries()) {
        await execInDev(context, [
          "--workdir",
          "/workspace",
          "dev",
          "docker-dev-trivy-gate",
          "scan-image",
          image,
          `${containerOutputPath}.${index}`,
          context.commandOptions.fail === false ? "--exit-code=0" : "--exit-code=1",
        ]);
      }

      const values = await Promise.all(reports.map((report) => readFile(report, "utf8")));
      await Bun.write(
        outputPath,
        `${JSON.stringify({ Results: values.flatMap((value) => JSON.parse(value).Results ?? []) }, null, 2)}\n`,
      );
    } finally {
      await removeReports(reports);
    }
  });
}
