import type { CommandContext } from "./context";

export async function run(
  context: CommandContext,
  command: string[],
  options: { cwd?: string; env?: Record<string, string>; quiet?: boolean } = {},
): Promise<string> {
  const process = Bun.spawn(command, {
    cwd: options.cwd ?? context.projectRoot,
    env: { ...globalThis.process.env, ...options.env },
    stdout: options.quiet ? "pipe" : "inherit",
    stderr: options.quiet ? "pipe" : "inherit",
    stdin: "inherit",
  });
  const output = options.quiet ? await new Response(process.stdout).text() : "";
  const code = await process.exited;
  if (code !== 0) throw new Error(`${command[0]} exited with code ${code}`);
  return output;
}
