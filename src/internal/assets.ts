import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";
import packageManifest from "../../package.json";
import { embeddedAssets } from "../../.generated/embedded-assets";
import { parsePluginManifest } from "../schemas/manifest";

const stateName = ".docker-dev-state.json";
const version = packageManifest.version;
const selectionMarker = "# docker-dev managed plugin selection";
type State = { version: string; hashes: Record<string, string> };
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const isPluginSelection = (path: string) => path.endsWith("plugins.enabled");
const isProjectConfiguration = (path: string) =>
  isPluginSelection(path) ||
  path === "ports.env" ||
  path === "custom-compose.yml";

/**
 * Paths (relative to .docker-dev) of every plugin's own config file, derived
 * from `configPath` in each embedded plugin.json. The embedded copy always
 * carries the plugin author's defaults, since it ships from src/plugins/.
 */
function pluginConfigPaths(): Set<string> {
  const paths = new Set<string>();

  for (const asset of embeddedAssets) {
    if (!asset.path.endsWith("/plugin.json")) continue;

    const { configPath } = parsePluginManifest(
      JSON.parse(Buffer.from(asset.data, "base64").toString("utf8")),
    );

    if (configPath) {
      paths.add(join(dirname(asset.path), configPath));
    }
  }

  return paths;
}

/** A fully-decided setup configuration, applied atomically by materializeAssets. */
export interface AssetPlan {
  /** Final contents of .docker-dev/ports.env. */
  ports: string;
  /** plugins.enabled path (relative to .docker-dev) -> chosen plugin names, for every level. */
  pluginSelections: Map<string, string[]>;
}

function pluginSelectionContent(names: readonly string[]): string {
  return `${selectionMarker}\n${names.join("\n")}${names.length ? "\n" : ""}`;
}

/** Whether an embedded asset path survives the plan's plugin selection. */
function isPluginAssetIncluded(
  path: string,
  pluginSelections: Map<string, string[]>,
): boolean {
  if (!path.startsWith("plugins/")) {
    return true;
  }

  if (path === "plugins/README.md") {
    return false;
  }

  let prefix = "plugins";
  let rest = path.slice(prefix.length + 1);

  for (;;) {
    if (!rest.includes("/")) {
      // A file directly under this level (plugins.enabled handled separately).
      return true;
    }

    const [pluginName, ...tail] = rest.split("/");
    const selected = pluginSelections.get(`${prefix}/plugins.enabled`) ?? [];

    if (!pluginName || !selected.includes(pluginName)) {
      return false;
    }

    const pluginRest = tail.join("/");

    if (pluginRest === "README.md" || pluginRest.startsWith("commands/")) {
      return false;
    }

    if (!pluginRest.startsWith("plugins/")) {
      return true;
    }

    prefix = `${prefix}/${pluginName}/plugins`;
    rest = pluginRest.slice("plugins/".length);
  }
}

export async function materializeAssets(
  directory: string,
  plan?: AssetPlan,
): Promise<void> {
  const configPaths = pluginConfigPaths();
  const isConfiguration = (path: string) =>
    isProjectConfiguration(path) || configPaths.has(path);
  const statePath = join(directory, stateName);
  let previous: State | undefined;
  try {
    previous = JSON.parse(await readFile(statePath, "utf8")) as State;
  } catch {
    /* first setup */
  }
  if (!previous) {
    try {
      if ((await readdir(directory)).length > 0)
        throw new Error(
          ".docker-dev is not managed by docker-dev v2; refusing to replace it.",
        );
    } catch (error) {
      if (error instanceof Error && error.message.includes("refusing"))
        throw error;
    }
  }
  if (previous) {
    for (const [path, expected] of Object.entries(previous.hashes)) {
      // Project configuration is copied into the next asset tree below and
      // may legitimately differ from the defaults embedded in the executable.
      if (isConfiguration(path)) {
        continue;
      }

      let current: Buffer;

      try {
        current = await readFile(join(directory, path));
      } catch (error) {
        if (
          path.startsWith("plugins/") &&
          error instanceof Error &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          continue;
        }

        throw error;
      }

      if (hash(current) !== expected)
        throw new Error(
          `Refusing to overwrite managed asset modified locally: ${path}`,
        );
    }
  }
  const temporary = `${directory}.next`;
  await rm(temporary, { recursive: true, force: true });
  const hashes: Record<string, string> = {};
  for (const asset of embeddedAssets) {
    if (plan && !isPluginAssetIncluded(asset.path, plan.pluginSelections)) {
      continue;
    }

    const target = join(temporary, asset.path);
    await mkdir(dirname(target), { recursive: true });

    if (plan && isPluginSelection(asset.path)) {
      const names = plan.pluginSelections.get(asset.path) ?? [];
      await writeFile(target, pluginSelectionContent(names), {
        mode: asset.mode,
      });
      continue;
    }

    const data = Buffer.from(asset.data, "base64");

    if (isConfiguration(asset.path)) {
      try {
        await copyFile(join(directory, asset.path), target);
        continue;
      } catch {
        /* First setup: distribute the embedded default. */
      }
    }

    await writeFile(target, data, { mode: asset.mode });
    await chmod(target, asset.mode);
    hashes[asset.path] = hash(data);
  }
  if (plan) {
    const portsTarget = join(temporary, "ports.env");
    await mkdir(dirname(portsTarget), { recursive: true });
    await writeFile(portsTarget, plan.ports);
  }
  await writeFile(
    join(temporary, stateName),
    JSON.stringify({ version, hashes }, null, 2) + "\n",
  );
  await rm(directory, { recursive: true, force: true });
  await rename(temporary, directory);
}
