# Dafke AI Control Center -- Troubleshooting Guide

Common issues and resolutions for dafke.

---

## Diagnostic First Steps

Before investigating specific issues, always start with:

```bash
dafke doctor
```

This command performs a comprehensive health check and provides targeted fix recommendations. Include the doctor output when reporting bugs.

---

## Installation Issues

### "dafke init" Fails at Authentication

**Symptom**: The auth step times out, returns HTTP 401, or shows "unauthorized."

**Cause**: Expired or misconfigured Personal Access Token (PAT).

**Resolution**:
1. Verify your PAT in Azure DevOps: User Settings > Personal Access Tokens.
2. Confirm required scopes: `Code (Read/Write)`, `Work Items (Read/Write)`, `Build (Read)`.
3. Test manually:
   ```bash
   curl -u :YOUR_PAT "https://dev.azure.com/dafke/_apis/projects?api-version=7.0"
   ```
4. If using a proxy, set environment variables:
   ```bash
   export HTTP_PROXY=http://proxy.dafke.be:8080
   export HTTPS_PROXY=http://proxy.dafke.be:8080
   ```
5. Regenerate the PAT if it has expired and re-run:
   ```bash
   dafke init --resume
   ```

### "dafke: command not found"

**Symptom**: After installation, the `dafke` command is not recognized.

**Cause**: npm global bin directory is not in PATH, or using npx without global install.

**Resolution**:
1. For npx usage (no global install needed):
   ```bash
   npx dafke init
   ```
2. For global install, ensure npm bin is in PATH:
   ```bash
   npm config get prefix
   # Add <prefix>/bin to your PATH
   export PATH="$(npm config get prefix)/bin:$PATH"
   ```
3. On Windows, restart your terminal after global install.

### Node.js Version Mismatch

**Symptom**: Syntax errors, unexpected token errors, or "ERR_REQUIRE_ESM" on startup.

**Cause**: dafke requires Node.js 20+.

**Resolution**:
```bash
node --version
# If below 20, upgrade:
nvm install 20
nvm use 20
```

---

## Plugin and MCP Server Issues

### MCP Server Fails to Start

**Symptom**: Claude Code reports "MCP server connection failed" for context7, playwright, or gitnexus.

**Cause**: npx cannot download the package, or network issues.

**Resolution**:
1. Test the MCP server manually:
   ```bash
   npx -y @upstash/context7-mcp@latest
   ```
2. If behind a corporate firewall, check npm proxy settings:
   ```bash
   npm config get proxy
   npm config get https-proxy
   ```
3. Clear the npx cache:
   ```bash
   npx clear-npx-cache
   ```
4. Verify the MCP configuration in `.claude/settings.json` has the correct paths.

### Azure DevOps MCP Server Fails to Connect

**Symptom**: Claude Code reports "Failed to reconnect to azure-devops" after `dafke init`.

**Cause**: The Azure DevOps MCP server requires a Personal Access Token (PAT) via the `AZURE_PERSONAL_TOKEN` environment variable. Without it, the server attempts interactive (browser-based) authentication which cannot work inside Claude Code.

**Resolution**:
1. Find your Azure DevOps PAT (stored during `dafke init`):
   ```bash
   cat ~/Library/Preferences/dafke/config.yaml | grep pat:
   ```
   On Linux: `~/.config/dafke/config.yaml`
2. Add the PAT to your shell profile (`~/.zshrc` or `~/.bashrc`):
   ```bash
   export AZURE_PERSONAL_TOKEN="<your Azure DevOps PAT>"
   ```
3. Reload your shell:
   ```bash
   source ~/.zshrc
   ```
4. Restart Claude Code and verify with `/mcp`.

**Note**: If your project uses a private npm registry (e.g., Azure Artifacts), `dafke init` automatically adds `--registry https://registry.npmjs.org` to the npx args so that the public `@azure-devops/mcp` package can be downloaded.

### Plugin JSON Parse Error

**Symptom**: "SyntaxError: Unexpected token" when loading `.claude/settings.json`.

**Cause**: Manually edited JSON with syntax errors (trailing commas, missing quotes).

**Resolution**:
1. Validate the file:
   ```bash
   node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf-8'))"
   ```
2. Regenerate from templates:
   ```bash
   dafke update
   ```
3. If custom overrides were lost, they can be re-applied after regeneration via the manifest overrides.

---

## CI Template Issues

### CI Template Conflicts with Existing Pipeline

**Symptom**: "File already exists" error during the CI step, or merge conflicts in pipeline YAML.

**Cause**: The repository already has CI configuration that conflicts with the generated template.

**Resolution**:
1. The wizard never overwrites existing files by default. Review the diff:
   ```bash
   diff .azure-pipelines/build.yml .dafke/templates/ci/generated-build.yml
   ```
2. Manually merge the Dafke quality gates into your existing pipeline.
3. To force overwrite (destructive):
   ```bash
   dafke init --resume --force-ci
   ```

### Pipeline YAML Validation Errors

**Symptom**: Azure DevOps or GitHub Actions rejects the generated pipeline file.

**Cause**: Template variable was not substituted, or schema version mismatch.

**Resolution**:
1. Check for unresolved Handlebars placeholders (e.g., `{{variable}}`):
   ```bash
   grep -n '{{' .azure-pipelines/*.yml
   ```
2. Validate YAML syntax:
   ```bash
   node -e "require('yaml').parse(require('fs').readFileSync('.azure-pipelines/build.yml','utf-8'))"
   ```
3. Re-run the CI step:
   ```bash
   dafke init --resume --skip=auth,detect,assess,claude_md,hooks,plugins
   ```

---

## Coverage Tool Issues

### Coverage Tool Not Detected

**Symptom**: The coverage step reports "no coverage tool found" despite having tests.

**Cause**: The adapter could not locate the expected coverage configuration.

**Resolution by tech stack**:

**TypeScript**:
- Verify `vitest.config.ts` or `jest.config.ts` exists
- Ensure `@vitest/coverage-v8` or `istanbul` is in devDependencies
- Run manually: `npx vitest run --coverage`

**Java**:
- Verify JaCoCo plugin in `pom.xml` or `build.gradle`
- Run manually: `mvn test jacoco:report`

**.NET**:
- Verify `coverlet.collector` NuGet package is installed
- Run manually: `dotnet test --collect:"XPlat Code Coverage"`

**Manual override** (any tech stack):
```yaml
# .dafke/manifest.yaml
overrides:
  coverage:
    tool: "c8"
    command: "npx c8 vitest run"
    reportPath: "coverage/lcov.info"
    reportFormat: "lcov"
```

### Coverage Report Not Found After Test Run

**Symptom**: Tests pass but coverage report file is missing.

**Cause**: Report path mismatch between the tool output and what dafke expects.

**Resolution**:
1. Run the test coverage command and check where the report is written.
2. Update the manifest override with the correct `reportPath`.
3. Common paths:
   - Vitest/c8: `coverage/lcov.info`
   - Jest/istanbul: `coverage/lcov.info`
   - JaCoCo: `target/site/jacoco/jacoco.xml`
   - Coverlet: `TestResults/*/coverage.cobertura.xml`

---

## GitNexus Issues

### GitNexus Index Stale or Missing

**Symptom**: GitNexus MCP commands return outdated information or "index not found."

**Cause**: The knowledge graph index has not been built or is out of date.

**Resolution**:
```bash
# Build or rebuild the index
npx gitnexus analyze

# Verify the index
npx gitnexus status

# Full clean and rebuild
npx gitnexus clean
npx gitnexus analyze
```

### GitNexus Out of Memory

**Symptom**: GitNexus analysis crashes with heap allocation errors on large repositories.

**Cause**: Default Node.js heap size is insufficient for very large codebases.

**Resolution**:
```bash
NODE_OPTIONS="--max-old-space-size=8192" npx gitnexus analyze
```

---

## Cross-Platform Issues

### Windows: Path Too Long

**Symptom**: "ENAMETOOLONG" errors on Windows.

**Cause**: Windows has a 260-character path limit by default.

**Resolution**:
1. Enable long paths in Windows (requires admin):
   ```powershell
   New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
     -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
   ```
2. Enable long paths in Git:
   ```bash
   git config --global core.longpaths true
   ```

### Windows: Hook Execution Fails

**Symptom**: Claude Code hooks fail with "ENOENT" or "spawn" errors on Windows.

**Cause**: Node.js not in PATH for the shell Claude Code uses, or `cross-spawn` not resolving correctly.

**Resolution**:
1. Verify Node.js is in your system PATH (not just terminal-specific):
   ```powershell
   where node
   ```
2. Reinstall dafke to regenerate hooks:
   ```bash
   dafke update
   ```
3. Ensure you are running Claude Code from a terminal that has Node.js available.

### macOS: Permission Denied on Global Config

**Symptom**: "EACCES: permission denied" when writing to config directory.

**Cause**: The config directory has incorrect ownership.

**Resolution**:
```bash
# Check ownership
ls -la ~/Library/Preferences/dafke/

# Fix ownership
sudo chown -R $(whoami) ~/Library/Preferences/dafke/
```

---

## Configuration Issues

### Manifest Schema Validation Error

**Symptom**: "ZodError" when loading `.dafke/manifest.yaml`.

**Cause**: Manifest was manually edited with invalid values.

**Resolution**:
1. Validate the manifest:
   ```bash
   dafke doctor
   ```
2. Check for common errors:
   - `techStack` must be one of: `java`, `dotnet`, `typescript`, `delphi`, `foxpro`, `unknown`
   - `wave` must be one of: `wave1`, `wave2`, `wave3`
   - `readinessScores` values must be integers 0-5
3. To regenerate from scratch:
   ```bash
   rm .dafke/manifest.yaml
   dafke init --resume
   ```

### Global Config Corrupted

**Symptom**: All commands fail with YAML parse errors.

**Cause**: The global config file was corrupted (e.g., partial write, manual edit error).

**Resolution**:
```bash
# Back up the current file
cp ~/.config/dafke/config.yaml ~/.config/dafke/config.yaml.bak

# Remove and let dafke regenerate with defaults
rm ~/.config/dafke/config.yaml

# Re-run auth setup
dafke init --skip=detect,assess,claude_md,hooks,plugins,ci,coverage,arch,connect,skills,verify
```

---

## CLAUDE.md and Merge Issues

### CLAUDE.md Merge Preserves Wrong Content

**Symptom**: After running `dafke init` or `dafke update`, the generated `CLAUDE.md` retains sections you expected to be replaced, or overwrites custom sections you wanted to keep.

**Cause**: CLAUDE.md generation uses a section-based merge strategy. Each section is identified by its H2 heading (`## Section Name`). The merge rules are:

1. **Dafke-managed sections** (e.g., `## Security Rules`, `## Git Workflow`, `## Tech Stack Guidelines`) are always overwritten with the latest template content.
2. **User-added sections** (any H2 section not recognized as Dafke-managed) are preserved as-is during merge.
3. **The `## Lessons Learned` section** is always preserved — it is never overwritten.

**Resolution**:
1. If a Dafke section contains content you want to customize, add your customizations in a separate user section (e.g., `## Project-Specific Rules`) rather than editing the managed section directly.
2. To force a full regeneration (discarding all custom sections):
   ```bash
   rm CLAUDE.md
   dafke init --resume
   ```
3. If using Claude Code CLI, the smart merge (`--deep`) uses AI to intelligently reconcile conflicts. Without Claude Code, the deterministic section-based merge is used.

### Plugin Priority Doesn't Match Expected

**Symptom**: During `dafke init`, the plugin recommendations don't match what you expected for your tech stack or project setup.

**Cause**: Plugin recommendations are scored based on multiple signals: detected tech stack, CI platform, existing tooling, and (when Claude Code is available) AI-driven context analysis. The scoring weights may not align with your expectations.

**Resolution**:
1. Review the plugin scores displayed during the wizard's plugin step. Each plugin shows its relevance score and the signals that contributed.
2. In non-interactive mode (`--non-interactive`), all recommended plugins above a threshold score are installed. Use `--skip=plugins` to skip automatic installation and install manually.
3. To override plugin selection, edit `.claude/settings.json` directly after the wizard completes.
4. Without Claude Code CLI, all standard plugins are recommended equally (no context-aware scoring). Install Claude Code for smarter recommendations.

### Prerequisite Check Fails

**Symptom**: `dafke init` reports missing prerequisites and blocks or warns during startup.

**Cause**: The prerequisite checker validates three tiers of tools:

| Tier | Tools | Behavior |
|------|-------|----------|
| **Required** | Node.js 20+, Git 2.30+ | Blocks wizard if missing |
| **Recommended** | Claude Code CLI, Gitleaks, Lefthook | Warns but continues |
| **Optional** | Azure CLI (`az`), GitHub CLI (`gh`) | Noted only when relevant provider is detected |

**Resolution**:
1. **Required tools missing**: Install the missing tool. The wizard provides OS-specific installation hints (e.g., `brew install node` on macOS, `choco install nodejs` on Windows).
2. **Recommended tools missing**: These are not mandatory. The wizard continues with reduced functionality. Install them later for the full feature set.
3. **Optional tools missing**: Only relevant if you use the corresponding provider. For example, `az` is only needed for Azure DevOps integration.
4. Run `dafke doctor` after installing tools to verify they are detected correctly.

---

## Getting Help

If the troubleshooting steps above do not resolve your issue:

1. Run `dafke doctor` and save the output.
2. Collect environment details:
   ```bash
   node --version
   npm --version
   git --version
   claude --version
   uname -a        # or: systeminfo (Windows)
   ```
3. File an issue at: `https://dev.azure.com/dafke/platform/dafke/_workitems`
4. Include: doctor output, environment details, steps to reproduce, and any error messages.
5. For urgent issues, contact Platform Engineering via Microsoft Teams.
