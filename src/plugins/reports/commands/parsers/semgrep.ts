import { type Finding } from "./types";

const labels: Record<string, string> = {
  cwe: "CWE",
  category: "Category",
  technology: "Technology",
  confidence: "Confidence",
  owasp: "OWASP",
  references: "References",
  subcategory: "Subcategory",
  likelihood: "Likelihood",
  impact: "Impact",
  vulnerability_class: "Vulnerability class",
  shortlink: "Shortlink",
  code_extract: "Code extract",
};

function label(key: string): string {
  return labels[key] ?? key
    .split("_")
    .filter(Boolean)
    .map((word) => word.toUpperCase() === word ? word : `${word[0]?.toUpperCase()}${word.slice(1)}`)
    .join(" ");
}

function mapSemgrepSeverity(raw: string): string {
  const normalized = raw.toLowerCase();
  if (normalized === "error") return "high";
  if (normalized === "warning") return "medium";
  if (normalized === "info") return "low";
  if (["critical", "high", "medium", "low"].includes(normalized)) return normalized;
  return "unknown";
}

function normalizeValue(value: unknown): string {
  if (typeof value === "string") {
    if (/^https?:\/\//i.test(value)) {
      return `[${value}](${value})`;
    }
    return value;
  }

  if (Array.isArray(value)) {
    if (value.length === 0) return "";
    if (value.length === 1) return normalizeValue(value[0]);

    const allUrls = value.every((item) => typeof item === "string" && /^https?:\/\//i.test(item));
    if (allUrls) {
      return value.map((url) => `- [${url}](${url})`).join("\n");
    }

    return value.map((item) => `- ${normalizeValue(item)}`).join("\n");
  }

  return String(value);
}

export function parseSemgrep(value: any): Finding[] {
  return (value.results ?? []).map((item: any) => {
    const metadata = item.extra?.metadata ?? {};
    const detectedSeverity = mapSemgrepSeverity(item.extra?.severity ?? "unknown");

    const extractedFields = [
      "cwe", "category", "technology", "confidence", "owasp",
      "references", "subcategory", "likelihood", "impact",
      "vulnerability_class", "shortlink",
    ];

    const details: Array<[string, unknown]> = [];

    if (item.extra?.message) {
      details.push(["Message", item.extra.message]);
    }

    for (const key of extractedFields) {
      if (metadata[key] != null) {
        details.push([label(key), normalizeValue(metadata[key])]);
      }
    }

    return {
      severity: detectedSeverity,
      title: item.check_id ?? "Semgrep finding",
      location: item.path
        ? `${item.path}:${item.start?.line ?? "?"}`
        : undefined,
      details,
    };
  });
}
