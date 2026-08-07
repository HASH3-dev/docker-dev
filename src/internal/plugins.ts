import * as p from "@clack/prompts";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { parsePluginManifest, type PluginManifest } from "../schemas/manifest";

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

async function choose(
  directory: string,
  enabledFile: string,
  label: string,
  projectRoot: string,
  runtimes: ReadonlySet<string>,
): Promise<PluginManifest[]> {
  const available = (await manifests(directory)).filter((plugin) =>
    supportsRuntimes(plugin, runtimes),
  );
  const selection = await readSelection(enabledFile);

  if (!available.length) {
    return [];
  }

  const selected = selection.ids.filter((id) =>
    available.some((plugin) => plugin.name === id),
  );
  const initialValues = selection.managed
    ? selected
    : [
        ...new Set([
          ...selected,
          ...available
            .filter((plugin) => isDetected(plugin, projectRoot))
            .map((plugin) => plugin.name),
        ]),
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

  const chosen = available.filter((plugin) => answer.includes(plugin.name));
  await mkdir(dirname(enabledFile), { recursive: true });
  await writeFile(
    enabledFile,
    `${selectionMarker}\n# Plugins selected by docker-dev setup for ${label}.\n${chosen.map((plugin) => plugin.name).join("\n")}\n`,
  );

  return chosen;
}

async function configureLevel(
  directory: string,
  enabledFile: string,
  label: string,
  projectRoot: string,
  runtimes: ReadonlySet<string>,
): Promise<void> {
  const selected = await choose(
    directory,
    enabledFile,
    label,
    projectRoot,
    runtimes,
  );

  for (const plugin of selected) {
    if (!plugin.plugins) {
      continue;
    }

    const pluginDirectory = join(directory, plugin.name);
    await configureLevel(
      join(pluginDirectory, plugin.plugins.directory),
      join(pluginDirectory, plugin.plugins.enabledFile ?? "plugins.enabled"),
      plugin.name,
      projectRoot,
      runtimes,
    );
  }
}

/** Interactively selects plugins compatible with the configured runtimes. */
export async function configurePlugins(
  dockerDevDirectory: string,
  projectRoot: string,
  runtimes: readonly string[],
): Promise<void> {
  const pluginsDirectory = join(dockerDevDirectory, "plugins");

  await configureLevel(
    pluginsDirectory,
    join(pluginsDirectory, "plugins.enabled"),
    "docker-dev",
    projectRoot,
    new Set(runtimes),
  );
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

    const manifest = parsePluginManifest(
      JSON.parse(await readFile(join(pluginDirectory, "plugin.json"), "utf8")),
    );

    // Command handlers run from the compiled executable and do not belong in
    // the host project or the Docker build context.
    await rm(join(pluginDirectory, "commands"), {
      recursive: true,
      force: true,
    });
    await rm(join(pluginDirectory, "README.md"), { force: true });

    if (manifest.plugins) {
      await pruneLevel(
        join(pluginDirectory, manifest.plugins.directory),
        join(
          pluginDirectory,
          manifest.plugins.enabledFile ?? "plugins.enabled",
        ),
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
      if (!plugin.plugins) {
        return [];
      }

      const pluginDirectory = join(directory, plugin.name);
      return selectedPluginManifests(
        join(pluginDirectory, plugin.plugins.directory),
        join(pluginDirectory, plugin.plugins.enabledFile ?? "plugins.enabled"),
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
