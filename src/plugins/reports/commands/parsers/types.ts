export type Finding = {
  id?: string;
  severity: string;
  title: string;
  location?: string;
  details: Array<[string, unknown]>;
};

export function severity(value: unknown): string {
  const normalized = String(value ?? "unknown").toLowerCase();
  return ["critical", "high", "medium", "low"].includes(normalized)
    ? normalized
    : "unknown";
}
