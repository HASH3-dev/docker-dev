import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { collectSelectedPluginManifests } from "@internal/plugins";
import type { CommandContext } from "./context";
import { parsePortList } from "./ports";
import { run } from "./process";

function projectIdentity(path: string): string {
  const slug =
    path
      .split(/[\\/]/)
      .filter(Boolean)
      .at(-1)
      ?.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-") || "project";
  return `${slug.replace(/^-|-$/g, "")}-dev-${Bun.hash(path).toString(16).slice(0, 10)}`;
}

async function configuredPorts(context: CommandContext): Promise<string[]> {
  try {
    const line = (
      await readFile(join(context.dockerDevDirectory, "ports.env"), "utf8")
    )
      .split("\n")
      .find((item) => item.startsWith("DOCKER_DEV_PORTS="));
    return parsePortList(line?.slice("DOCKER_DEV_PORTS=".length) ?? "3000");
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT")
      return ["3000"];
    throw error;
  }
}

export async function portsOverride(context: CommandContext): Promise<string> {
  const ports = await configuredPorts(context);
  const content = ports.length
    ? [
        "services:",
        "  dev:",
        "    ports:",
        ...ports.map((value) => {
          const [host, container = host] = value.split(":");
          return `      - \"127.0.0.1:${host}:${container}\"`;
        }),
      ].join("\n") + "\n"
    : "services:\n  dev: {}\n";
  const target = join(context.dockerDevDirectory, ".ports.generated.yml");
  await mkdir(context.dockerDevDirectory, { recursive: true });
  await writeFile(target, content);
  return target;
}

/** Generates the Compose resources contributed by the selected plugins only. */
export async function generatePluginOverride(
  context: CommandContext,
): Promise<string> {
  const environment = new Map<string, string>();
  const volumes = new Map<string, string>();
  const volumeTargets = new Map<string, string>();

  for (const plugin of await collectSelectedPluginManifests(
    context.dockerDevDirectory,
  )) {
    for (const [name, value] of Object.entries(
      plugin.container?.environment ?? {},
    )) {
      const current = environment.get(name);

      if (current !== undefined && current !== value) {
        throw new Error(
          `Selected plugins define conflicting values for ${name}.`,
        );
      }

      environment.set(name, value);
    }

    for (const volume of plugin.container?.volumes ?? []) {
      const currentTarget = volumes.get(volume.name);
      const currentName = volumeTargets.get(volume.target);

      if (
        (currentTarget !== undefined && currentTarget !== volume.target) ||
        (currentName !== undefined && currentName !== volume.name)
      ) {
        throw new Error(
          `Selected plugins define conflicting container volumes for ${volume.target}.`,
        );
      }

      volumes.set(volume.name, volume.target);
      volumeTargets.set(volume.target, volume.name);
    }
  }

  if (volumes.size) {
    const writableDirectories = [...volumes.values()].join(":");
    const current = environment.get("DOCKER_DEV_WRITABLE_DIRECTORIES");

    if (current !== undefined && current !== writableDirectories) {
      throw new Error(
        "DOCKER_DEV_WRITABLE_DIRECTORIES is reserved for plugin volumes.",
      );
    }

    environment.set("DOCKER_DEV_WRITABLE_DIRECTORIES", writableDirectories);
  }

  const lines = ["services:", "  dev:"];

  if (!environment.size && !volumes.size) {
    lines[1] = "  dev: {}";
  } else {
    if (environment.size) {
      lines.push("    environment:");
      for (const [name, value] of environment) {
        lines.push(`      ${name}: ${JSON.stringify(value)}`);
      }
    }

    if (volumes.size) {
      lines.push("    volumes:");
      for (const [name, target] of volumes) {
        lines.push(`      - ${name}:${target}`);
      }
    }
  }

  if (volumes.size) {
    lines.push("", "volumes:");
    for (const name of volumes.keys()) {
      lines.push(`  ${name}:`);
    }
  }

  const target = join(context.dockerDevDirectory, ".plugins.generated.yml");
  await writeFile(target, `${lines.join("\n")}\n`);
  return target;
}

async function selectedPlugins(context: CommandContext): Promise<string> {
  try {
    return (
      await readFile(
        join(context.dockerDevDirectory, "plugins", "plugins.enabled"),
        "utf8",
      )
    )
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .join(",");
  } catch {
    return "";
  }
}

export function resolveInfrastructureCompose(
  projectRoot: string,
  commandOptions: Readonly<Record<string, unknown>>,
): string | undefined {
  const merge = commandOptions.mergeCompose === true;
  const requested = commandOptions.mergeFile;

  if (requested !== undefined && typeof requested !== "string") {
    throw new Error("The Compose file must be a path.");
  }

  if (requested && !merge) {
    throw new Error("Use --merge-file together with --merge-compose.");
  }

  if (!merge) {
    return undefined;
  }

  if (requested) {
    const path = resolve(projectRoot, requested);

    if (!existsSync(path)) {
      throw new Error(`Compose file not found: ${path}`);
    }

    return path;
  }

  const candidates = [
    "compose.yaml",
    "compose.yml",
    "docker-compose.yaml",
    "docker-compose.yml",
  ]
    .map((file) => join(projectRoot, file))
    .filter(existsSync);

  if (candidates.length > 1) {
    throw new Error(
      "More than one Compose file was found. Use --merge-file to select one.",
    );
  }

  return candidates[0];
}

export async function runPluginHook(
  context: CommandContext,
  hook: string,
): Promise<void> {
  const plugins = await selectedPlugins(context);

  if (!plugins) {
    return;
  }

  await execInDev(context, [
    "dev",
    "docker-dev-plugin-runner",
    "run-hook",
    hook,
    plugins,
  ]);
}

export async function compose(
  context: CommandContext,
  args: readonly string[],
): Promise<string> {
  const portFile = await portsOverride(context);
  const pluginFile = await generatePluginOverride(context);
  const infrastructure = resolveInfrastructureCompose(
    context.projectRoot,
    context.commandOptions,
  );
  const explicitMergeFile =
    typeof context.commandOptions.mergeFile === "string";
  const customCompose = join(context.dockerDevDirectory, "custom-compose.yml");
  const command = [
    "docker",
    "compose",
    "-p",
    projectIdentity(context.projectRoot),
    "-f",
    ...(infrastructure && !explicitMergeFile ? [infrastructure, "-f"] : []),
    join(context.dockerDevDirectory, "compose.yml"),
    "-f",
    pluginFile,
    "-f",
    portFile,
    "-f",
    customCompose,
    ...(infrastructure && explicitMergeFile ? ["-f", infrastructure] : []),
    ...args,
  ];
  return run(context, command, {
    quiet: args[0] === "ps",
    env: {
      DOCKER_DEV_DIR: context.dockerDevDirectory,
      DOCKER_DEV_PROJECT_ROOT: context.projectRoot,
      DOCKER_DEV_PLUGINS: await selectedPlugins(context),
      DOCKER_DEV_IMAGE: `${projectIdentity(context.projectRoot)}-dev`,
      LOCAL_UID: String(process.getuid?.() ?? 1000),
      LOCAL_GID: String(process.getgid?.() ?? 1000),
    },
  });
}

export async function start(context: CommandContext): Promise<void> {
  const services = await compose(context, [
    "ps",
    "--status",
    "running",
    "--services",
  ]);
  if (services.split("\n").includes("dev")) return;
  await compose(context, ["up", "--detach", "--build"]);
}

export async function execInDev(
  context: CommandContext,
  args: readonly string[],
): Promise<void> {
  await compose(context, [
    "exec",
    "--user",
    `${process.getuid?.() ?? 1000}:${process.getgid?.() ?? 1000}`,
    ...args,
  ]);
}

export function projectComposePath(
  context: CommandContext,
  path: string,
): string {
  return resolve(context.projectRoot, path);
}
