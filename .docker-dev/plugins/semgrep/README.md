# semgrep

Static analysis (SAST) for source code, using the free Semgrep Community
Edition rules (no login required).

```bash
docker-dev semgrep:scan [path]
```

Scans the given path (default: the project root) inside the development
container, writes a JSON report to
`.docker-dev/reports/semgrep.json`, and exits non-zero when
findings are reported at the configured severity.

Configure the ruleset and severity in `semgrep.config.json`:

```json
{
  "config": "p/ci",
  "severity": ["ERROR"],
  "metricsOff": true
}
```

`config` is passed to `--config` (e.g. `p/ci`, `p/owasp-top-ten`, `auto`, or a
local path). `auto` requires metrics, so set `metricsOff` to `false` when using
it. `severity` is a list of Semgrep severities (`INFO`, `WARNING`, `ERROR`) that
count toward the exit code.

## Dashboard normalization

The `reports:dashboard` server extracts structured fields from each finding's
`metadata` object and displays them as separate labeled rows with readable values:

- **CWE**, Category, Technology, Confidence, **OWASP**, References, Subcategory,
  Likelihood, Impact, Vulnerability class, Shortlink

Array values are normalized:
- Single-item arrays → extracted as plain text
- Multiple URLs → markdown link list
- Multiple values → markdown list

Semgrep severities are mapped to dashboard levels:
- `ERROR` → **high**
- `WARNING` → **medium**
- `INFO` → **low**

The fields **Confidence**, **Likelihood**, and **Impact** are rendered as colored
severity badges when their values are `HIGH`, `MEDIUM`, or `LOW`.
