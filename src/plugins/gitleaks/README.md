# gitleaks

Dedicated secret detection across the git history (default) or the working
tree, using the free Gitleaks CLI.

```bash
docker-dev gitleaks:scan [path]
```

Scans the given path (default: the project root) inside the development
container, writes a JSON report to
`.docker-dev/reports/gitleaks.json`, and exits non-zero
when leaks are found.

Configure the scan mode in `gitleaks.config.json`:

```json
{
  "mode": "git"
}
```

`"git"` scans the full git history (`gitleaks git`); `"dir"` scans only the
working tree (`gitleaks dir`), which is faster but misses secrets already
removed from tracked files.
