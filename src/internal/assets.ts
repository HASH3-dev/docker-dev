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
import { embeddedAssets } from "../../.generated/embedded-assets";

const stateName = ".docker-dev-state.json";
const version = "0.1.0";
type State = { version: string; hashes: Record<string, string> };
const hash = (data: Uint8Array) =>
  createHash("sha256").update(data).digest("hex");
const isPluginSelection = (path: string) => path.endsWith("plugins.enabled");
const isProjectConfiguration = (path: string) =>
  isPluginSelection(path) ||
  path === "ports.env" ||
  path === "custom-compose.yml";

export async function materializeAssets(directory: string): Promise<void> {
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
      if (isProjectConfiguration(path)) {
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
    const target = join(temporary, asset.path);
    const data = Buffer.from(asset.data, "base64");
    await mkdir(dirname(target), { recursive: true });

    if (isProjectConfiguration(asset.path)) {
      try {
        await copyFile(join(directory, asset.path), target);
        continue;
      } catch {
        /* First setup: distribute the default plugin selection. */
      }
    }

    await writeFile(target, data, { mode: asset.mode });
    await chmod(target, asset.mode);
    hashes[asset.path] = hash(data);
  }
  await writeFile(
    join(temporary, stateName),
    JSON.stringify({ version, hashes }, null, 2) + "\n",
  );
  await rm(directory, { recursive: true, force: true });
  await rename(temporary, directory);
}
