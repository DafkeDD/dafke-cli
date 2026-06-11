# Smoke test for dafke CLI (Windows)
# Verifies all commands work on a clean install.

$ErrorActionPreference = "Continue"
$pass = 0
$fail = 0
$CLI = "node dist/cli.mjs"

function Pass($msg) { Write-Host "  [PASS] $msg" -ForegroundColor Green; $script:pass++ }
function Fail($msg, $err) { Write-Host "  [FAIL] ${msg}: $err" -ForegroundColor Red; $script:fail++ }

Write-Host ""
Write-Host "=== dafke Smoke Test (Windows) ==="
Write-Host ""

# 1. Help
Write-Host "--- Basic CLI ---"
$out = & node dist/cli.mjs --help 2>&1
if ($LASTEXITCODE -eq 0) { Pass "--help" } else { Fail "--help" "exit non-zero" }
if ($out -match "resolve") { Pass "--help lists resolve" } else { Fail "--help" "missing resolve" }

# 2. Audit
Write-Host "--- Audit ---"
$json = & node dist/cli.mjs audit --format json 2>$null
try {
    $parsed = $json | ConvertFrom-Json
    if ($parsed.scores) { Pass "audit json" } else { Fail "audit json" "no scores" }
} catch { Fail "audit json" "invalid JSON" }

# 3. Doctor
Write-Host "--- Doctor ---"
$doc = & node dist/cli.mjs doctor 2>&1
if ($doc -match "Git:") { Pass "doctor Git" } else { Fail "doctor" "no Git" }
if ($doc -match "Node.js:") { Pass "doctor Node" } else { Fail "doctor" "no Node" }

# 4. Skills (deprecated)
Write-Host "--- Skills ---"
$skills = & node dist/cli.mjs skills 2>&1
if ($skills -match "deprecated") { Pass "skills deprecated" } else { Fail "skills" "no deprecation message" }

# 5. Gendoc dry-run
Write-Host "--- Gendoc ---"
$gendoc = & node dist/cli.mjs gendoc --dry-run 2>&1
if ($gendoc -match "DRY RUN") { Pass "gendoc dry-run" } else { Fail "gendoc" "no dry-run" }

# Summary
Write-Host ""
Write-Host "=== Results: $pass passed, $fail failed ==="
Write-Host ""

if ($fail -gt 0) { exit 1 }
