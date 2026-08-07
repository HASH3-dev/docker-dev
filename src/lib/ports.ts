const portMapping = /^([1-9][0-9]{0,4})(?::([1-9][0-9]{0,4}))?$/;

export function parsePortList(value: string): string[] {
  const ports = value
    .split(",")
    .map((port) => port.trim())
    .filter(Boolean);

  if (!ports.length) {
    throw new Error("Provide at least one port.");
  }

  for (const port of ports) {
    const match = port.match(portMapping);
    const host = Number(match?.[1]);
    const container = Number(match?.[2] ?? match?.[1]);

    if (!match || host > 65535 || container > 65535) {
      throw new Error(
        "Use comma-separated ports such as 3000 or 3002:3001 (from 1 to 65535).",
      );
    }
  }

  return ports;
}
