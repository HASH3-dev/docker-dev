import { severity, type Finding } from "./types";

function formatVersion(version: any): string {
  if (version == null) return "--";
  if (Array.isArray(version)) return version.join(", ");
  return String(version);
}

export function parseTrivy(value: any): Finding[] {
  return (value.Results ?? []).flatMap((result: any) => [
    ...(result.Vulnerabilities ?? []).map((item: any) => ({
      severity: severity(item.Severity),
      title: `${item.VulnerabilityID ?? "Vulnerability"}: ${item.PkgName ?? "unknown package"}`,
      location: result.Target,
      details: [
        ["Installed Version", formatVersion(item.InstalledVersion)],
        ["Fixed Version", formatVersion(item.FixedVersion)],
        ["Title", item.Title],
        ["Description", item.Description],
      ].filter(([, detail]) => detail != null),
    })),
    ...(result.Misconfigurations ?? []).map((item: any) => ({
      severity: severity(item.Severity),
      title: `${item.ID ?? "Misconfiguration"}: ${item.Title ?? item.Message ?? "security misconfiguration"}`,
      location: result.Target,
      details: [
        ["Message", item.Message],
        ["Description", item.Description],
        ["Resolution", item.Resolution],
        ["Primary URL", item.PrimaryURL],
      ].filter(([, detail]) => detail != null),
    })),
  ]);
}
