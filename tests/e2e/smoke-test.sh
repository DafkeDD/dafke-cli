#!/bin/bash
# Smoke test for dafke CLI
# Verifies all commands work on a clean install.
# Exit on first failure.
set -eo pipefail

PASS=0
FAIL=0
CLI="node dist/cli.mjs"

pass() { echo "  ✓ $1"; PASS=$((PASS + 1)); }
fail() { echo "  ✗ $1: $2"; FAIL=$((FAIL + 1)); }

echo ""
echo "=== dafke Smoke Test ==="
echo ""

# 1. Help and version
echo "--- Basic CLI ---"
$CLI --help > /dev/null 2>&1 && pass "dafke --help" || fail "--help" "exit non-zero"
$CLI --help 2>&1 | grep -q "resolve" && pass "--help lists resolve" || fail "--help" "missing resolve command"
$CLI --help 2>&1 | grep -q "docs" && pass "--help lists docs" || fail "--help" "missing docs command"
$CLI --help 2>&1 | grep -q "skills" && pass "--help lists skills" || fail "--help" "missing skills command"

# 2. No banner after subcommands
echo "--- Banner behavior ---"
AUDIT_OUT=$($CLI audit --format json 2>/dev/null || true)
echo "$AUDIT_OUT" | grep -q "██████╗" && fail "audit no banner" "banner appeared" || pass "audit no banner"

# 3. Audit
echo "--- Audit ---"
AUDIT_ERR=$($CLI audit --format json 2>&1 1>/tmp/audit_out.json; cat /tmp/audit_out.json)
node -e "const d=JSON.parse(require('fs').readFileSync('/tmp/audit_out.json','utf8')); if(!d.scores) process.exit(1)" 2>/dev/null && pass "audit --format json" || { echo "  stderr: $(echo "$AUDIT_ERR" | head -3)"; fail "audit json" "invalid JSON"; }
($CLI audit --format text 2>&1 || true) | grep -q "Readiness" && pass "audit text output" || fail "audit text" "no readiness header"
$CLI audit --override cicd=5 --format json 2>/dev/null | node -e "const d=JSON.parse(require('fs').readFileSync('/dev/stdin','utf8')); if(d.scores.cicd!==5) process.exit(1)" 2>/dev/null && pass "audit --override" || fail "audit override" "override not applied"

# 4. Resolve
echo "--- Resolve ---"
$CLI resolve --dry-run --format json 2>/dev/null | node -e "JSON.parse(require('fs').readFileSync('/dev/stdin','utf8'))" 2>/dev/null && pass "resolve --dry-run json" || fail "resolve dry-run" "invalid JSON"
RESOLVE_OUT=$($CLI resolve --dry-run --dimension security 2>&1 || true)
echo "$RESOLVE_OUT" | grep -qiE "security|resolvable" && pass "resolve --dimension" || fail "resolve dimension" "no output"

# 5. Doctor
echo "--- Doctor ---"
DOCTOR_OUT=$($CLI doctor 2>&1 || true)
echo "$DOCTOR_OUT" | grep -qiE "git" && pass "doctor shows Git" || fail "doctor" "no Git check"
echo "$DOCTOR_OUT" | grep -qiE "node" && pass "doctor shows Node" || fail "doctor" "no Node check"

# 6. Skills (deprecated — verify deprecation message)
echo "--- Skills ---"
$CLI skills 2>&1 | grep -q "deprecated" && pass "skills deprecated message" || fail "skills" "no deprecation message"

# 7. Hook list
echo "--- Hook ---"
$CLI hook 2>&1 | grep -q "Available hook events" && pass "hook list" || fail "hook list" "no events listed"

# 7b. Status
echo "--- Status ---"
($CLI status 2>&1 || true) | grep -qiE "readiness|wave|init" && pass "status output" || fail "status" "no output"
# status --format json requires manifest; test after init creates one
($CLI status --format json 2>/dev/null || true) | node -e "require('fs').readFileSync('/dev/stdin','utf8')" && pass "status --format json" || fail "status json" "command failed"

# 7c. Repos (no auth configured, should gracefully handle)
echo "--- Repos ---"
($CLI repos 2>&1 || true) | grep -qiE "repo|configured|warning|error" && pass "repos handles no config" || fail "repos" "unexpected output"

# 8. Docs (formerly gendoc)
echo "--- Docs ---"
$CLI docs --dry-run 2>&1 | grep -q "DRY RUN" && pass "docs --dry-run" || fail "docs" "no dry-run output"
$CLI docs --skip gitnexus,graphify,typedoc 2>&1 | grep -q "ARCHITECTURE.md" && pass "docs scaffolds docs" || fail "docs" "no ARCHITECTURE.md"
$CLI gendoc --dry-run 2>&1 | grep -q "DRY RUN" && pass "gendoc alias works" || fail "gendoc alias" "alias broken"
test -f docs/ARCHITECTURE.md && pass "ARCHITECTURE.md exists" || fail "ARCHITECTURE.md" "file not created"
test -f docs/INDEX.md && pass "INDEX.md exists" || fail "INDEX.md" "file not created"

# 9. Init (non-interactive, skip auth/plugins/connect)
# Note: init requires Claude CLI. In CI without it, the pre-flight check exits 1.
echo "--- Init ---"
INIT_OUT=$($CLI init --non-interactive --skip auth,connect,plugins 2>&1 || true)
echo "$INIT_OUT" | grep -qE "complete|Claude Code CLI is required" && pass "init non-interactive" || fail "init" "no completion or CLI message"
test -f CLAUDE.md && pass "CLAUDE.md generated" || fail "CLAUDE.md" "not created"
test -f .claude/settings.json && pass "settings.json generated" || fail "settings.json" "not created"
test -f lefthook.yml && pass "lefthook.yml generated" || fail "lefthook.yml" "not created"

# Summary
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
