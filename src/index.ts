#!/usr/bin/env bun
import { Command } from "commander";
import {
  manifests,
  registerCommandModules,
} from "../.generated/command-registry";
import packageManifest from "../package.json";
import { registerInternalActions } from "@internal/actions";
import { createContext } from "@lib/context";
import { runManifest } from "@internal/command-runner";
import { ActionRegistry } from "@internal/registry";

const registry = new ActionRegistry();
registerInternalActions(registry);
registerCommandModules(registry);

const program = new Command()
  .name("docker-dev")
  .description("Portable Docker development environments.")
  .version(packageManifest.version)
  .showSuggestionAfterError();

for (const manifest of manifests) {
  const forwardsArguments = manifest.steps.some((step) =>
    step.call.args?.includes("$@"),
  );
  const command = program
    .command([manifest.name, manifest.args].filter(Boolean).join(" "))
    .summary(manifest.summary)
    .description(manifest.help)
    .allowUnknownOption(forwardsArguments);

  for (const option of manifest.options ?? []) {
    command.option(option.flags, option.description, option.defaultValue);
  }

  command.action(async (...values: unknown[]) => {
    const command = values.at(-1);

    if (!(command instanceof Command)) {
      throw new Error(`Could not read arguments for ${manifest.name}.`);
    }

    await runManifest(
      manifest,
      registry,
      createContext(command.args, command.opts()),
    );
  });
}

program.parseAsync().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`error: ${message}`);
  process.exitCode = 1;
});
