## Dafke Technology Constitution

### Testing Discipline
- **ALWAYS write tests for ALL happy paths AND ALL failure paths** when adding features, fixing bugs, or implementing stories. No exceptions.
- **ALWAYS validate new tests with mutation testing** (Stryker or equivalent) before considering them done. If mutation score < 80%, the tests are insufficient.
- Run `{{mutationCommand}}` after writing tests. Review surviving mutants. Fix tests until mutation score meets threshold.
- Test files follow the naming pattern: `<module>.test.ts` / `<module>.spec.ts`

### Planning & Impact Analysis
- **ALWAYS use plan mode before executing changes** on a codebase. Even "simple" fixes can cascade.
- **ALWAYS analyse the impact of your changes** before finalizing plans — analyse the blast radius of your changes before finalizing plans.
- **ALWAYS propose enhancements and improvements** to the user before finalizing plans — ask before integrating them.
- Before writing code, generate an **enhanced prompt** from user input: clarify intent, add relevant context, inject applicable rules.

### Security — Healthcare Context
- Dafke develops **critical healthcare software**. Patient data, medical workflows, and regulatory compliance are at stake. This is non-negotiable.
- Treat every code change as potentially affecting patient safety. Apply defense-in-depth.
- NEVER commit secrets, API keys, passwords, or tokens — enforce with gitleaks pre-commit hook.
- NEVER bypass branch protection or CI gates — these exist to protect patients.
- NEVER disable security scanning tools — they catch what humans miss.
- Always use parameterized queries for database access — SQL injection in healthcare = HIPAA/GDPR violation.
- Validate ALL external input — untrusted data reaches healthcare systems from many vectors.
- Apply principle of least privilege — services should only access what they need.
- High-risk paths (auth/*, data/*, healthcare/*, patient/*) require 2 reviewers + security sign-off.

### Guardrails & Hooks
- **Propose new hooks** (Claude Code hooks or git hooks) when you identify practices that should be automated and enforced.
- Review existing hooks during planning — are they still effective? Can they be improved?
- Git hooks BLOCK on failure — they are guardrails, not suggestions.

### Architecture Invariants
- Changes must follow the existing architecture — do not introduce new patterns without explicit approval.
- All file I/O is atomic (write temp, rename). No partial writes.
- Cross-platform always: `path.join()`, `cross-spawn`, `env-paths`. No hardcoded `/` or `\\`.
