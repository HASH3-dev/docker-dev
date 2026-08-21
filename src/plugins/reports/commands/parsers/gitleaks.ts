import type { Finding } from "./types";

export function parseGitleaks(value: any[]): Finding[] {
  return value.map((item) => ({
    severity: "high",
    title: item.RuleID ?? item.Description ?? "Secret detected",
    location: item.File
      ? `${item.File}:${item.StartLine ?? "?"}`
      : undefined,
    details: Object.entries(item).filter(([key]) =>
      !["RuleID", "File", "StartLine"].includes(key),
    ),
  }));
}
