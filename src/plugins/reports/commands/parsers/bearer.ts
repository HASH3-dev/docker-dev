import { severity, type Finding } from "./types";

const labels: Record<string, string> = {
  cwe_ids: "CWE IDs",
  cwe_id: "CWE ID",
  description: "Description",
  documentation_url: "Documentation URL",
  code_extract: "Code extract",
  remediation: "Remediation",
  recommendation: "Recommendation",
  references: "References",
};

function label(key: string): string {
  return labels[key] ?? key
    .split("_")
    .filter(Boolean)
    .map((word) => word.toUpperCase() === word ? word : `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

export function parseBearer(value: any): Finding[] {
  const findings = value.findings ?? value.issues ?? value.results;
  const buckets = ["critical", "high", "medium", "low"];
  const items = Array.isArray(findings)
    ? findings.map((item: any) => [item, undefined] as const)
    : buckets.flatMap((bucket) =>
      Array.isArray(value[bucket])
        ? value[bucket].map((item: any) => [item, bucket] as const)
        : [],
    );

  return items.map(([item, bucket]) => ({
    severity: severity(item.severity ?? item.level ?? bucket),
    title: item.title ?? item.rule_id ?? item.id ?? "Bearer finding",
    location: item.full_filename
      ? `${item.full_filename}${item.line_number != null ? `:${item.line_number}` : ""}`
      : item.filename ?? item.path ?? item.file,
    details: Object.entries(item)
      .filter(([key]) => ![
        "severity", "level", "title", "rule_id", "id", "filename",
        "full_filename", "line_number", "path", "file",
      ].includes(key))
      .map(([key, detail]) => [label(key), detail]),
  }));
}
