import manifest from "./command.json";
import packageManifest from "../../../package.json";
import type { ActionRegistry } from "@internal/registry";
import { run } from "@lib/process";
import {
  latestRelease,
  pinnedVersion,
  releases,
  updateCommand,
} from "@lib/update";

export default manifest;

export function register(registry: ActionRegistry): void {
  registry.register("update", async (context) => {
    const args = context.commandArguments;
    const [version] = args;
    const list = context.commandOptions.list === true;
    const check = context.commandOptions.check === true;

    if (args.length > 1) {
      throw new Error("Provide at most one version.");
    }
    if ((list || check) && version) {
      throw new Error("--list and --check do not accept a version.");
    }
    if (list && check) {
      throw new Error("Use either --list or --check, not both.");
    }

    if (list) {
      console.log(
        (await releases())
          .map((release) =>
            release.replace(/^v/, "") === packageManifest.version
              ? `${release} (running)`
              : release,
          )
          .join("\n"),
      );
      return;
    }

    if (check) {
      const [pinned, latest] = await Promise.all([
        pinnedVersion(context.projectRoot),
        latestRelease(),
      ]);
      console.log(
        [
          `Running version: ${packageManifest.version}`,
          `Pinned version: ${pinned ?? "not pinned"}`,
          `Latest release: ${latest}`,
        ].join("\n"),
      );
      return;
    }

    const installer = updateCommand(context.projectRoot, version);
    console.log(installer.display);
    await run(context, installer.command);
  });
}
