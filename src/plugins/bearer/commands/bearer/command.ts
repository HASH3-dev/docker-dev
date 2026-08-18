import { mkdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { readPluginConfig } from "@internal/plugins";
import type { ActionRegistry } from "@internal/registry";
import { execInDev, start } from "@lib/compose";

interface BearerConfig {
  failOnSeverity: string[];
}

export function register(registry: ActionRegistry): void {
  registry.register("scanBearerPath", async (context, args, manifest) => {
    const config = await readPluginConfig<BearerConfig>(
      context.dockerDevDirectory,
      "plugins/bearer",
    );
    const outputPath = manifest?.output
      ? join(context.dockerDevDirectory, manifest.output.file)
      : undefined;

    if (!config || !outputPath) {
      throw new Error("The bearer plugin is not selected in this project.");
    }

    await mkdir(dirname(outputPath), { recursive: true });
    const containerOutputPath = `/workspace/${relative(context.projectRoot, outputPath)}`;

    await start(context);

    await execInDev(context, [
      "--workdir",
      "/workspace",
      "dev",
      "bearer",
      "scan",
      "--format",
      "json",
      "--output",
      containerOutputPath,
      "--fail-on-severity",
      config.failOnSeverity.join(","),
      ...(context.commandOptions.fail === false ? ["--exit-code=0"] : []),
      ".",
      ...args,
    ]);
  });
}
