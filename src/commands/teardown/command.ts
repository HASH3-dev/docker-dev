import manifest from "./command.json";
import { lstat, readlink, rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import type { ActionRegistry } from "@internal/registry";
import { compose } from "@lib/compose";

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("teardown", async (context) => {
    try {
      await compose(context, ["rm", "--stop", "--force", "dev"]);
    } catch {
      // Docker resources may already be absent.
    }

    const envrc = join(context.projectRoot, ".envrc");

    try {
      if ((await lstat(envrc)).isSymbolicLink() && (await readlink(envrc)) === ".docker-dev/direnv.envrc") {
        await unlink(envrc);
      }
    } catch {
      // Preserve a missing or user-managed .envrc.
    }

    await rm(context.dockerDevDirectory, { recursive: true, force: true });
  });
}
