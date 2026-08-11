import Ajv2020 from "ajv/dist/2020";
import commandSchema from "./command.schema.json";
import pluginSchema from "./plugin.schema.json";

export interface CommandManifest {
  $schema?: string;
  name: string;
  args?: string;
  options?: Array<{
    flags: string;
    description: string;
    defaultValue?: string | boolean;
  }>;
  summary: string;
  help: string;
  steps: Array<{ call: { function: string; args?: string[] } }>;
}

export interface PluginManifest {
  $schema?: string;
  name: string;
  kind: string;
  summary: string;
  requiresRuntimes?: string[];
  configPath?: string;
  detect?: { files: string[] };
  container?: {
    environment?: Record<string, string>;
    volumes?: Array<{ name: string; target: string }>;
  };
  hooks?: Record<string, string>;
}

const validator = new Ajv2020({ allErrors: true, strict: true });
const validateCommand = validator.compile(commandSchema);
const validatePlugin = validator.compile(pluginSchema);

function parse<T>(
  valid: (value: unknown) => boolean,
  value: unknown,
  label: string,
): T {
  if (!valid(value)) throw new Error(`Invalid ${label} manifest.`);
  return value as T;
}

export function parseCommandManifest(value: unknown): CommandManifest {
  return parse(validateCommand, value, "command");
}
export function parsePluginManifest(value: unknown): PluginManifest {
  return parse(validatePlugin, value, "plugin");
}
