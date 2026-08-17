import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { readdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { embeddedAssets } from "../../.generated/embedded-assets";
import {
  parseCommandManifest,
  parsePluginManifest,
  type PluginManifest,
} from "../schemas/manifest";

const selectionMarker = "# docker-dev managed plugin selection";

type Selection = {
  ids: string[];
  managed: boolean;
};

async function readSelection(file: string): Promise<Selection> {
  try {
    const contents = await readFile(file, "utf8");
    return {
      ids: contents
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#")),
      managed: contents.includes(selectionMarker),
    };
  } catch {
    return { ids: [], managed: false };
  }
}

/** Reads plugin manifests directly from the embedded assets, without touching disk. */
function embeddedPluginManifests(prefix: string): PluginManifest[] {
  const marker = `${prefix}/`;
  const children = new Map<string, string>();

  for (const asset of embeddedAssets) {
    if (!asset.path.startsWith(marker)) continue;

    const rest = asset.path.slice(marker.length);
    const [child, ...tail] = rest.split("/");

    if (child && tail.join("/") === "plugin.json") {
      children.set(child, asset.path);
    }
  }

  return [...children.entries()].map(([name, path]) => {
    const asset = embeddedAssets.find((entry) => entry.path === path)!;
    const manifest = parsePluginManifest(
      JSON.parse(Buffer.from(asset.data, "base64").toString("utf8")),
    );

    if (manifest.name !== name) {
      throw new Error(
        `Plugin manifest name does not match its directory: ${name}`,
      );
    }

    return manifest;
  });
}

async function manifests(directory: string): Promise<PluginManifest[]> {
  const entries = await readdir(directory, { withFileTypes: true });

  return Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifest = parsePluginManifest(
          JSON.parse(
            await readFile(join(directory, entry.name, "plugin.json"), "utf8"),
          ),
        );

        if (manifest.name !== entry.name) {
          throw new Error(
            `Plugin manifest name does not match its directory: ${entry.name}`,
          );
        }

        return manifest;
      }),
  );
}

/**
 * Reads a plugin's own config file, following `configPath` from its
 * `plugin.json`. `pluginRelativeDir` is the plugin's directory relative to
 * `.docker-dev` (e.g. "plugins/trivy/plugins/npm", mirroring its location
 * under src/plugins/). Returns undefined if the plugin declares no
 * `configPath` or the user has not created the file yet.
 */
export async function readPluginConfig<T = unknown>(
  dockerDevDirectory: string,
  pluginRelativeDir: string,
): Promise<T | undefined> {
  const pluginDirectory = join(dockerDevDirectory, ...pluginRelativeDir.split("/"));
  const manifest = parsePluginManifest(
    JSON.parse(await readFile(join(pluginDirectory, "plugin.json"), "utf8")),
  );

  if (!manifest.configPath) {
    return undefined;
  }

  try {
    return JSON.parse(
      await readFile(join(pluginDirectory, manifest.configPath), "utf8"),
    ) as T;
  } catch {
    return undefined;
  }
}

function supportsRuntimes(
  plugin: PluginManifest,
  runtimes: ReadonlySet<string>,
): boolean {
  return (
    !plugin.requiresRuntimes ||
    plugin.requiresRuntimes.some((runtime) => runtimes.has(runtime))
  );
}

function isDetected(plugin: PluginManifest, projectRoot: string): boolean {
  return (
    plugin.detect?.files.some((file) => existsSync(join(projectRoot, file))) ??
    false
  );
}

function hasSubplugins(prefix: string): boolean {
  const marker = `${prefix}/plugins/`;
  return embeddedAssets.some((asset) => asset.path.startsWith(marker));
}

/**
 * Decides which plugins are selected at one level of the tree, prompting only
 * when no selection is already recorded on disk. Never writes to disk.
 *
 * `prefix` is the path of this level relative to `.docker-dev` (matching
 * embedded asset paths, e.g. "plugins" or "plugins/trivy/plugins"); the plan
 * map is keyed by that same relative convention so materializeAssets can
 * match it against embedded asset paths.
 */
async function planLevel(
  prefix: string,
  dockerDevDirectory: string,
  label: string,
  projectRoot: string,
  runtimes: ReadonlySet<string>,
  plan: Map<string, string[]>,
): Promise<void> {
  const available = embeddedPluginManifests(prefix).filter((plugin) =>
    supportsRuntimes(plugin, runtimes),
  );

  if (!available.length) {
    return;
  }

  const relativeEnabledFile = `${prefix}/plugins.enabled`;
  const diskEnabledFile = join(dockerDevDirectory, ...prefix.split("/"), "plugins.enabled");
  const selection = await readSelection(diskEnabledFile);
  let chosen: PluginManifest[];

  if (existsSync(diskEnabledFile)) {
    const selected = new Set(selection.ids);
    chosen = available.filter((plugin) => selected.has(plugin.name));
  } else {
    const initialValues = [
      ...new Set(
        available
          .filter((plugin) => isDetected(plugin, projectRoot))
          .map((plugin) => plugin.name),
      ),
    ];
    const answer = await p.multiselect({
      message: `Select plugins for ${label}`,
      initialValues,
      options: available.map((plugin) => ({
        value: plugin.name,
        label: plugin.name,
        hint: plugin.summary,
      })),
      required: false,
    });

    if (p.isCancel(answer)) {
      throw new Error("Plugin selection cancelled.");
    }

    chosen = available.filter((plugin) => answer.includes(plugin.name));
  }

  plan.set(
    relativeEnabledFile,
    chosen.map((plugin) => plugin.name),
  );

  for (const plugin of chosen) {
    const pluginPrefix = `${prefix}/${plugin.name}`;

    if (!hasSubplugins(pluginPrefix)) {
      continue;
    }

    await planLevel(
      `${pluginPrefix}/plugins`,
      dockerDevDirectory,
      plugin.name,
      projectRoot,
      runtimes,
      plan,
    );
  }
}

/**
 * Interactively plans plugin selection compatible with the configured
 * runtimes, reusing any selection already recorded in `.docker-dev`. Returns
 * a map of the `plugins.enabled` path (relative to `.docker-dev`) to the
 * chosen plugin names for that level; nothing is written to disk.
 */
export async function planPlugins(
  dockerDevDirectory: string,
  projectRoot: string,
  runtimes: readonly string[],
): Promise<Map<string, string[]>> {
  const plan = new Map<string, string[]>();
  await planLevel(
    "plugins",
    dockerDevDirectory,
    "docker-dev",
    projectRoot,
    new Set(runtimes),
    plan,
  );
  return plan;
}

async function pruneLevel(
  directory: string,
  enabledFile: string,
): Promise<void> {
  const enabled = new Set((await readSelection(enabledFile)).ids);
  const entries = await readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const pluginDirectory = join(directory, entry.name);

    if (!enabled.has(entry.name)) {
      await rm(pluginDirectory, { recursive: true, force: true });
      continue;
    }

    // Command handlers run from the compiled executable and do not belong in
    // the host project or the Docker build context.
    await rm(join(pluginDirectory, "commands"), {
      recursive: true,
      force: true,
    });
    await rm(join(pluginDirectory, "README.md"), { force: true });

    if (existsSync(join(pluginDirectory, "plugins"))) {
      await pruneLevel(
        join(pluginDirectory, "plugins"),
        join(pluginDirectory, "plugins", "plugins.enabled"),
      );
    }
  }
}

/** Removes source files and plugins that were not selected during setup. */
export async function prunePlugins(dockerDevDirectory: string): Promise<void> {
  const pluginsDirectory = join(dockerDevDirectory, "plugins");

  await rm(join(pluginsDirectory, "README.md"), { force: true });
  await pruneLevel(pluginsDirectory, join(pluginsDirectory, "plugins.enabled"));
}

async function selectedPluginManifests(
  directory: string,
  enabledFile: string,
): Promise<PluginManifest[]> {
  const enabled = new Set((await readSelection(enabledFile)).ids);
  const available = await manifests(directory);
  const selected = available.filter((plugin) => enabled.has(plugin.name));
  const nested = await Promise.all(
    selected.map(async (plugin) => {
      const pluginDirectory = join(directory, plugin.name);

      if (!existsSync(join(pluginDirectory, "plugins"))) {
        return [];
      }

      return selectedPluginManifests(
        join(pluginDirectory, "plugins"),
        join(pluginDirectory, "plugins", "plugins.enabled"),
      );
    }),
  );

  return [...selected, ...nested.flat()];
}

/** Reads all selected plugin manifests, including recursively selected children. */
export async function collectSelectedPluginManifests(
  dockerDevDirectory: string,
): Promise<PluginManifest[]> {
  const pluginsDirectory = join(dockerDevDirectory, "plugins");
  return selectedPluginManifests(
    pluginsDirectory,
    join(pluginsDirectory, "plugins.enabled"),
  );
}

async function commandOutputPaths(pluginDirectory: string): Promise<string[]> {
  const commandsDirectory = join(pluginDirectory, "commands");
  if (!existsSync(commandsDirectory)) return [];

  const commands = await readdir(commandsDirectory, { withFileTypes: true });
  return Promise.all(
    commands
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const manifest = parseCommandManifest(
          JSON.parse(
            await readFile(join(commandsDirectory, entry.name, "command.json"), "utf8"),
          ),
        );
        return manifest.output && manifest.output.shared !== true
          ? [manifest.output.file]
          : [];
      }),
  ).then((paths) => paths.flat());
}

async function selectedPluginOutputPaths(
  directory: string,
  enabledFile: string,
): Promise<string[]> {
  const enabled = new Set((await readSelection(enabledFile)).ids);
  const available = await manifests(directory);
  const selected = available.filter((plugin) => enabled.has(plugin.name));
  const nested = await Promise.all(
    selected.map(async (plugin) => {
      const pluginDirectory = join(directory, plugin.name);
      const own = await commandOutputPaths(pluginDirectory);

      if (!existsSync(join(pluginDirectory, "plugins"))) return own;

      return [
        ...own,
        ...(await selectedPluginOutputPaths(
          join(pluginDirectory, "plugins"),
          join(pluginDirectory, "plugins", "plugins.enabled"),
        )),
      ];
    }),
  );

  return nested.flat();
}

/**
 * Paths (relative to .docker-dev) of every selected plugin's non-shared
 * output file, including recursively selected children. Used to keep
 * `.docker-dev/.gitignore` in sync with the plugins currently enabled.
 */
export async function collectSelectedPluginOutputPaths(
  dockerDevDirectory: string,
): Promise<string[]> {
  const pluginsDirectory = join(dockerDevDirectory, "plugins");
  return selectedPluginOutputPaths(
    pluginsDirectory,
    join(pluginsDirectory, "plugins.enabled"),
  );
}
