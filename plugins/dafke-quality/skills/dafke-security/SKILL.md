---
name: dafke-security
description: Use when the user wants to run security scans, check for vulnerabilities, or audit dependencies
category: quality
allowed-tools:
  - Bash
  - Read
  - Grep
  - Glob
---

# /dafke-security

Run the full security analysis pipeline: static analysis, dependency audit, and secrets scan.

## Steps

1. **SAST (Static Application Security Testing)** — Scan source code for vulnerabilities:
   - Check for common vulnerability patterns:
     - SQL injection (string concatenation in queries).
     - XSS (unescaped user input in output).
     - Path traversal (unsanitized file paths).
     - Command injection (unsanitized shell commands).
     - Insecure deserialization.
   - Use available tools: `semgrep`, `eslint-plugin-security`, or manual pattern matching.
   - Report each finding with file, line, severity, and remediation.

2. **SCA (Software Composition Analysis)** — Audit dependencies:
   - Run `npm audit --json` (or equivalent for other package managers).
   - Check for known CVEs in dependencies.
   - Identify outdated dependencies with `npm outdated`.
   - Flag dependencies with no maintenance (last publish > 2 years).
   - Report: package name, severity, CVE ID, fixed version, upgrade path.

3. **Secrets Scanning** — Detect hardcoded secrets:
   - Scan for patterns: API keys, tokens, passwords, connection strings, private keys.
   - Check common locations: `.env` files, config files, test fixtures, comments.
   - Verify `.gitignore` excludes sensitive files (`.env`, `*.pem`, `credentials.*`).
   - Use `trufflehog` or `gitleaks` if available, otherwise regex-based scan.

4. **Additional checks**:
   - CODEOWNERS file exists and covers security-critical paths.
   - Branch protection rules configured (if detectable).
   - HTTPS enforced for all API endpoints in config.

5. **Generate report**:
   ```
   ## Security Report

   ### SAST Findings
   | Severity | Count | Top Issue |
   |----------|-------|-----------|
   | Critical | 0     | — |
   | High     | 1     | Possible SQL injection in query.ts:45 |
   | Medium   | 3     | Unvalidated input in handler.ts |
   | Low      | 2     | Console.log with user data |

   ### SCA Findings
   - Critical CVEs: 0
   - High CVEs: 1 (lodash < 4.17.21)
   - Outdated packages: 5

   ### Secrets Scan
   - Hardcoded secrets found: 0
   - .gitignore coverage: PASS

   ### Overall Risk: MEDIUM
   Action required: 1 high SAST + 1 high SCA finding
   ```

6. **Save report** — Write to `.dafke/security-report.json`.

## Error Handling

- Security tools not installed: use built-in regex scanning, recommend tool installation.
- Private registry: skip SCA if npm audit fails, note in report.
- Large codebase: scan changed files first, then full scan in background.
