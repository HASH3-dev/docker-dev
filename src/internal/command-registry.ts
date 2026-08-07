import { parseCommandManifest, type CommandManifest } from "../schemas/manifest";
import * as setupModule from "../commands/setup/command";
import * as teardownModule from "../commands/teardown/command";
import upManifest from "../commands/up/command.json";
import shellManifest from "../commands/shell/command.json";
import runManifest from "../commands/run/command.json";
import downManifest from "../commands/down/command.json";
import logsManifest from "../commands/logs/command.json";
import rebuildManifest from "../commands/rebuild/command.json";
import resetManifest from "../commands/reset/command.json";
import * as scanModule from "../plugins/trivy/commands/scan/command";
import * as npmModule from "../plugins/trivy/adapters/npm/commands/npm/command";
import * as pnpmModule from "../plugins/trivy/adapters/pnpm/commands/pnpm/command";
import * as yarnModule from "../plugins/trivy/adapters/yarn/commands/yarn/command";
import * as uvModule from "../plugins/trivy/adapters/uv/commands/uv/command";
import installManifest from "../plugins/trivy/adapters/npm/commands/install/command.json";
import type { ActionRegistry } from "./registry";

const modules = [setupModule, teardownModule, scanModule, npmModule, pnpmModule, yarnModule, uvModule];

export const manifests: readonly CommandManifest[] = modules
  .map(({ default: manifest }) => parseCommandManifest(manifest))
  .concat(
    [upManifest, shellManifest, runManifest, downManifest, logsManifest, rebuildManifest, resetManifest, installManifest].map((manifest) =>
      parseCommandManifest(manifest),
    ),
  );

export function registerCommandModules(registry: ActionRegistry): void {
  for (const module of modules) module.register(registry);
}
