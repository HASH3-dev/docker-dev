# bearer

Static analysis (SAST) focused on sensitive data flows (PII/PHI) and the
OWASP Top 10, using the free Bearer CLI (no login required).

```bash
docker-dev bearer [path]
```

Scans the given path (default: the project root) inside the development
container, writes a JSON report to
`.docker-dev/reports/bearer.json`, and exits non-zero when
findings are reported at the configured severity.

Configure the failing severities in `bearer.config.json`:

```json
{
  "failOnSeverity": ["critical", "high", "medium", "low"]
}
```
