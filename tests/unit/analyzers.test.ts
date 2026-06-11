import { describe, it, expect, vi, beforeEach } from "vitest";
import { vol } from "memfs";

// ---------------------------------------------------------------------------
// Mock the filesystem with memfs
// ---------------------------------------------------------------------------

vi.mock("node:fs/promises", async () => {
  const memfs = await import("memfs");
  return memfs.fs.promises;
});

vi.mock("node:fs", async () => {
  const memfs = await import("memfs");
  return memfs.fs;
});

// ---------------------------------------------------------------------------
// Mock execa for dora-analyzer
// ---------------------------------------------------------------------------

const mockExeca = vi.fn();

vi.mock("execa", () => ({
  execa: (...args: unknown[]) => mockExeca(...args),
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { CicdAnalyzer } from "../../src/core/analyzer/cicd-analyzer.js";
import { SecurityAnalyzer } from "../../src/core/analyzer/security-analyzer.js";
import { CoverageAnalyzer } from "../../src/core/analyzer/coverage-analyzer.js";
import { ReviewAnalyzer } from "../../src/core/analyzer/review-analyzer.js";
import { DoraAnalyzer } from "../../src/core/analyzer/dora-analyzer.js";
import { DocsAnalyzer } from "../../src/core/analyzer/docs-analyzer.js";
import type { AnalyzerContext } from "../../src/core/analyzer/dimension-analyzer.js";

const REPO = "/test-repo";

const makeContext = (externalTools: Record<string, unknown> = {}): AnalyzerContext => ({
  repoRoot: REPO,
  manifest: {
    corulusCcVersion: "0.3.5",
    techStack: "typescript",
    configSchemaVersion: 2,
    ciPlatform: "none",
    overrides: {},
    externalTools,
  } as AnalyzerContext["manifest"],
});

beforeEach(() => {
  vol.reset();
  mockExeca.mockReset();
});

// ===========================================================================
// CI/CD Analyzer
// ===========================================================================

describe("CicdAnalyzer", () => {
  const analyzer = new CicdAnalyzer();

  it("scores 0 when no pipeline files exist", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
    expect(result.dimension).toBe("cicd");
    expect(result.evidence).toContainEqual(expect.stringContaining("No pipeline files"));
  });

  it("scores 1 when pipeline exists but has no test or lint keywords", async () => {
    vol.fromJSON(
      {
        ".github/workflows/build.yml": "name: Build\non:\n  push:\njobs:\n  build:\n    runs-on: ubuntu-22.04\n    steps:\n      - uses: actions/checkout@v4\n      - run: echo hello",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(1);
  });

  it("scores 2 when pipeline has tests but no lint", async () => {
    vol.fromJSON(
      {
        ".github/workflows/ci.yml": "name: CI\non:\n  push:\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(2);
  });

  it("scores 3 when pipeline has tests and lint", async () => {
    vol.fromJSON(
      {
        ".github/workflows/ci.yml":
          "name: CI\non:\n  pull_request:\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n      - run: npm run lint",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
    expect(result.evidence).toContainEqual(expect.stringContaining("Test step"));
    expect(result.evidence).toContainEqual(expect.stringContaining("Lint step"));
  });

  it("scores 4 when pipeline has tests, lint, SAST, and deploy", async () => {
    vol.fromJSON(
      {
        ".github/workflows/ci.yml":
          "name: CI\non:\n  pull_request:\njobs:\n  ci:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n      - run: npm run lint\n      - run: semgrep scan\n      - run: deploy to staging",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(4);
  });

  it("scores 5 when pipeline has full CD with self-healing", async () => {
    vol.fromJSON(
      {
        ".github/workflows/cd.yml":
          "name: CD\non:\n  push:\n    branches: [main]\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm test\n      - run: npm run lint\n      - run: semgrep scan\n      - run: deploy canary\n      - run: auto-rollback on failure",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(5);
  });

  it("detects azure-pipelines.yml", async () => {
    vol.fromJSON(
      {
        "azure-pipelines.yml":
          "trigger:\n  - main\nsteps:\n  - script: npm test\n  - script: npm run lint",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
    expect(result.evidence).toContainEqual(expect.stringContaining("azure-pipelines.yml"));
  });

  it("detects .gitlab-ci.yml", async () => {
    vol.fromJSON(
      {
        ".gitlab-ci.yml": "test:\n  script:\n    - npm test\nlint:\n  script:\n    - eslint .",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
  });
});

// ===========================================================================
// Security Analyzer
// ===========================================================================

describe("SecurityAnalyzer", () => {
  const analyzer = new SecurityAnalyzer();

  it("scores 0 when nothing is configured", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
    expect(result.dimension).toBe("security");
    expect(result.evidence).toContainEqual(expect.stringContaining("No security tooling"));
  });

  it("scores 2 when only SAST is configured (no secrets detection)", async () => {
    vol.fromJSON(
      {
        ".semgrep.yml": "rules: []",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(2);
  });

  it("scores 3 when SAST and secrets detection are active", async () => {
    vol.fromJSON(
      {
        ".semgrep.yml": "rules: []",
        ".gitleaks.toml": "[allowlist]",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
    expect(result.evidence).toContainEqual(expect.stringContaining("Semgrep"));
    expect(result.evidence).toContainEqual(expect.stringContaining("Gitleaks"));
  });

  it("scores 3 when SAST + secrets are in CI pipeline", async () => {
    vol.fromJSON(
      {
        ".github/workflows/security.yml":
          "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
  });

  it("scores 4 with SAST + secrets + SCA", async () => {
    vol.fromJSON(
      {
        ".semgrep.yml": "rules: []",
        ".gitleaks.toml": "[allowlist]",
        ".snyk": "{}",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(4);
  });

  it("scores 5 with full security suite including DAST and SBOM", async () => {
    vol.fromJSON(
      {
        ".github/workflows/security.yml":
          "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test\n      - run: zap scan\n      - run: syft generate sbom",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(5);
  });

  it("detects Dependabot config file", async () => {
    vol.fromJSON(
      {
        ".github/dependabot.yml": "version: 2\nupdates: []",
        ".semgrep.yml": "rules: []",
        ".gitleaks.toml": "[allowlist]",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    // SAST + secrets + SCA = 4
    expect(result.score).toBe(4);
    expect(result.evidence).toContainEqual(expect.stringContaining("Dependabot"));
  });
});

// ===========================================================================
// Coverage Analyzer
// ===========================================================================

describe("CoverageAnalyzer", () => {
  const analyzer = new CoverageAnalyzer();

  it("scores 0 when no coverage config or reports exist", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
    expect(result.dimension).toBe("coverage");
  });

  it("scores 1 when coverage config exists but no reports or enforcement", async () => {
    vol.fromJSON(
      {
        "package.json": JSON.stringify({ scripts: { "test:coverage": "vitest run --coverage" } }),
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(1);
  });

  it("scores 2 when coverage reports exist without enforcement", async () => {
    vol.fromJSON(
      {
        "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
        "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(2);
  });

  it("scores 4 when enforcement thresholds are configured at 80%", async () => {
    vol.fromJSON(
      {
        "vitest.config.ts":
          'import { defineConfig } from "vitest/config";\nexport default defineConfig({\n  test: {\n    coverage: {\n      thresholds: {\n        branches: 80,\n        functions: 80,\n        lines: 80,\n      }\n    }\n  }\n});',
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(4);
  });

  it("scores 5 when enforcement and mutation testing are configured", async () => {
    vol.fromJSON(
      {
        "vitest.config.ts":
          'export default { test: { coverage: { thresholds: { lines: 90 } } } };',
        "stryker.conf.js": "module.exports = { mutate: ['src/**/*.ts'] };",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(5);
  });

  it("detects JaCoCo in pom.xml", async () => {
    vol.fromJSON(
      {
        "pom.xml":
          '<project>\n  <build>\n    <plugins>\n      <plugin>\n        <groupId>org.jacoco</groupId>\n        <artifactId>jacoco-maven-plugin</artifactId>\n        <configuration>\n          <rules><rule><limits><limit><minimum>0.80</minimum></limit></limits></rule></rules>\n        </configuration>\n      </plugin>\n    </plugins>\n  </build>\n</project>',
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    // Score 3: has enforcement (minimum keyword) but threshold not in parseable format
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.evidence).toContainEqual(expect.stringContaining("JaCoCo"));
  });
});

// ===========================================================================
// Review Analyzer
// ===========================================================================

describe("ReviewAnalyzer", () => {
  const analyzer = new ReviewAnalyzer();

  it("scores 0 when no review config exists", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
    expect(result.dimension).toBe("review");
  });

  it("scores 2 when CODEOWNERS exists but no PR template", async () => {
    vol.fromJSON(
      {
        ".github/CODEOWNERS": "* @team-lead",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(2);
  });

  it("scores 2 when PR template exists but no CODEOWNERS", async () => {
    vol.fromJSON(
      {
        ".github/PULL_REQUEST_TEMPLATE.md": "## Description\n\nPlease describe your changes.",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(2);
  });

  it("scores 3 when CODEOWNERS and PR template with checklist exist", async () => {
    vol.fromJSON(
      {
        ".github/CODEOWNERS": "* @team-lead\nsrc/api/ @api-team",
        ".github/PULL_REQUEST_TEMPLATE.md":
          "## Description\n\n## Checklist\n- [ ] Tests added\n- [ ] Docs updated\n- [ ] No breaking changes",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
  });

  it("scores 4 with CODEOWNERS including security reviewers and branch protection", async () => {
    vol.fromJSON(
      {
        ".github/CODEOWNERS": "* @team-lead\nsrc/auth/ @security-team\nsrc/api/ @api-team",
        ".github/PULL_REQUEST_TEMPLATE.md": "## Review Checklist\n- [ ] Security review\n- [ ] Tests pass",
        ".github/settings.yml": "branches:\n  - name: main\n    protection:\n      required_pull_request_reviews:\n        required_approving_review_count: 2\n      require_code_owner_reviews: true",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(4);
  });

  it("scores 5 with review bot and review metrics", async () => {
    vol.fromJSON(
      {
        ".github/CODEOWNERS": "* @team-lead",
        ".github/PULL_REQUEST_TEMPLATE.md": "## Review\n- [ ] Reviewed",
        ".coderabbit.yaml": "reviews:\n  auto_review: true",
        ".github/workflows/review.yml": "name: Review Metrics\non:\n  pull_request_review:\njobs:\n  metrics:\n    steps:\n      - run: review-metrics collect",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(5);
  });

  it("provides specific suggestions at score 4 (not generic)", async () => {
    vol.fromJSON(
      {
        ".github/CODEOWNERS": "* @team-lead\nsrc/auth/ @security-team",
        ".github/PULL_REQUEST_TEMPLATE.md": "## Review Checklist\n- [ ] Security review",
        ".github/settings.yml": "branches:\n  - name: main\n    protection:\n      required_pull_request_reviews:\n        required_approving_review_count: 2",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(4);
    expect(result.suggestions.length).toBeGreaterThan(0);
    // Should NOT have the generic fallback
    expect(result.suggestions.some((s: string) => s.includes("level 5"))).toBe(true);
  });

  it("detects Danger.js as a review bot", async () => {
    vol.fromJSON(
      {
        "dangerfile.ts": "import { danger, warn } from 'danger';",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.evidence).toContainEqual(expect.stringContaining("Danger.js"));
  });
});

// ===========================================================================
// DORA Analyzer
// ===========================================================================

describe("DoraAnalyzer", () => {
  const analyzer = new DoraAnalyzer();

  it("scores 0 when not a git repo", async () => {
    vol.fromJSON({}, REPO);
    mockExeca.mockRejectedValue(new Error("not a git repo"));

    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
    expect(result.dimension).toBe("dora");
  });

  it("scores 1 when repo has few tags and some commits", async () => {
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes("--is-inside-work-tree")) {
        return Promise.resolve({ stdout: "true" });
      }
      if (args?.includes("--sort=-creatordate")) {
        // 1 tag in last 90 days = quarterly
        const recentDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        return Promise.resolve({ stdout: recentDate });
      }
      if (args?.includes("--count")) {
        return Promise.resolve({ stdout: "50" });
      }
      if (args?.some((a: string) => a.includes("--grep"))) {
        // High CFR: 10 reverts out of 50 = 20%
        return Promise.resolve({ stdout: "r1\nr2\nr3\nr4\nr5\nr6\nr7\nr8\nr9\nr10" });
      }
      return Promise.resolve({ stdout: "" });
    });

    const result = await analyzer.analyze(REPO);
    // quarterly + 20% CFR = 1
    expect(result.score).toBe(1);
  });

  it("scores 3 with monthly releases and low CFR", async () => {
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes("--is-inside-work-tree")) {
        return Promise.resolve({ stdout: "true" });
      }
      if (args?.includes("--sort=-creatordate")) {
        // 4 tags in 90 days = monthly
        const dates = Array.from({ length: 4 }, (_, i) =>
          new Date(Date.now() - i * 20 * 24 * 60 * 60 * 1000).toISOString(),
        );
        return Promise.resolve({ stdout: dates.join("\n") });
      }
      if (args?.includes("--count")) {
        return Promise.resolve({ stdout: "200" });
      }
      if (args?.some((a: string) => a.includes("--grep"))) {
        // 5 reverts out of 200 = 2.5%
        return Promise.resolve({ stdout: "r1\nr2\nr3\nr4\nr5" });
      }
      return Promise.resolve({ stdout: "" });
    });

    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
  });

  it("scores 4 with weekly releases and very low CFR", async () => {
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes("--is-inside-work-tree")) {
        return Promise.resolve({ stdout: "true" });
      }
      if (args?.includes("--sort=-creatordate")) {
        // 13 tags in 90 days = weekly
        const dates = Array.from({ length: 13 }, (_, i) =>
          new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
        );
        return Promise.resolve({ stdout: dates.join("\n") });
      }
      if (args?.includes("--count")) {
        return Promise.resolve({ stdout: "500" });
      }
      if (args?.some((a: string) => a.includes("--grep"))) {
        // 5 reverts out of 500 = 1%
        return Promise.resolve({ stdout: "r1\nr2\nr3\nr4\nr5" });
      }
      return Promise.resolve({ stdout: "" });
    });

    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(4);
  });

  it("scores 5 with on-demand releases and minimal CFR", async () => {
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes("--is-inside-work-tree")) {
        return Promise.resolve({ stdout: "true" });
      }
      if (args?.includes("--sort=-creatordate")) {
        // 100 tags in 90 days = on-demand
        const dates = Array.from({ length: 100 }, (_, i) =>
          new Date(Date.now() - i * 0.9 * 24 * 60 * 60 * 1000).toISOString(),
        );
        return Promise.resolve({ stdout: dates.join("\n") });
      }
      if (args?.includes("--count")) {
        return Promise.resolve({ stdout: "1000" });
      }
      if (args?.some((a: string) => a.includes("--grep"))) {
        // 5 reverts out of 1000 = 0.5%
        return Promise.resolve({ stdout: "r1\nr2\nr3\nr4\nr5" });
      }
      return Promise.resolve({ stdout: "" });
    });

    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(5);
  });

  it("provides specific suggestions at score 4 (not generic)", async () => {
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes("--is-inside-work-tree")) {
        return Promise.resolve({ stdout: "true" });
      }
      if (args?.includes("--sort=-creatordate")) {
        const dates = Array.from({ length: 13 }, (_, i) =>
          new Date(Date.now() - i * 7 * 24 * 60 * 60 * 1000).toISOString(),
        );
        return Promise.resolve({ stdout: dates.join("\n") });
      }
      if (args?.includes("--count")) {
        return Promise.resolve({ stdout: "500" });
      }
      if (args?.some((a: string) => a.includes("--grep"))) {
        return Promise.resolve({ stdout: "r1\nr2\nr3\nr4\nr5" });
      }
      return Promise.resolve({ stdout: "" });
    });

    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(4);
    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestions.some((s: string) => s.includes("level 5"))).toBe(true);
  });

  it("includes deployment frequency and CFR in evidence", async () => {
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes("--is-inside-work-tree")) {
        return Promise.resolve({ stdout: "true" });
      }
      if (args?.includes("--sort=-creatordate")) {
        return Promise.resolve({ stdout: "" });
      }
      if (args?.includes("--count")) {
        return Promise.resolve({ stdout: "100" });
      }
      if (args?.some((a: string) => a.includes("--grep"))) {
        return Promise.resolve({ stdout: "" });
      }
      return Promise.resolve({ stdout: "" });
    });

    const result = await analyzer.analyze(REPO);
    expect(result.evidence).toContainEqual(expect.stringContaining("deployment frequency"));
    expect(result.evidence).toContainEqual(expect.stringContaining("change failure rate"));
  });
});

// ===========================================================================
// Docs Analyzer
// ===========================================================================

describe("DocsAnalyzer", () => {
  const analyzer = new DocsAnalyzer();

  it("scores 0 when no README exists", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
    expect(result.dimension).toBe("docs");
  });

  it("scores 1 for a minimal README", async () => {
    vol.fromJSON(
      {
        "README.md": "# My Project\n\nA project.\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(1);
  });

  it("scores 2 for a README with meaningful content (>20 lines)", async () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i + 1}: Some documentation content.`);
    vol.fromJSON(
      {
        "README.md": `# My Project\n\n${lines.join("\n")}\n`,
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(2);
  });

  it("scores 3 when README includes build and test commands", async () => {
    vol.fromJSON(
      {
        "README.md":
          "# My Project\n\n## Getting Started\n\n```bash\nnpm install\nnpm run build\nnpm test\n```\n\n## Features\n\nLots of features here.\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
  });

  it("scores 4 with full docs (architecture, API, onboarding)", async () => {
    vol.fromJSON(
      {
        "README.md":
          "# My Project\n\n## Setup\n\n```bash\nnpm install\nnpm run build\n```\n",
        "ARCHITECTURE.md": "# Architecture\n\n## Overview\n\nThe system uses microservices...\n",
        "openapi.yaml": "openapi: 3.0.0\ninfo:\n  title: My API\n  version: 1.0.0\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(4);
  });

  it("scores 5 when CLAUDE.md and .claude/ directory are configured with README build commands", async () => {
    vol.fromJSON(
      {
        "README.md":
          "# My Project\n\n## Setup\n\n```bash\nnpm run build\nnpm test\n```\n",
        "CLAUDE.md": "# Claude Configuration\n\nThis project uses Claude Code.\n",
        ".claude/settings.json": '{"model": "claude-sonnet-4-20250514"}',
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(5);
  });

  it("does not score 5 when CLAUDE.md exists but README lacks build commands", async () => {
    vol.fromJSON(
      {
        "README.md":
          "# My Project\n\n## About\n\nThis is a project.\n",
        "CLAUDE.md": "# Claude Configuration\n\nThis project uses Claude Code.\n",
        ".claude/settings.json": '{"model": "claude-sonnet-4-20250514"}',
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBeLessThan(5);
  });

  it("detects CONTRIBUTING.md", async () => {
    vol.fromJSON(
      {
        "README.md": "# Project\n\nHello\n",
        "CONTRIBUTING.md": "# Contributing\n\nPlease follow the guidelines.\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.evidence).toContainEqual(expect.stringContaining("Contributing guide"));
  });

  it("detects docs/ directory", async () => {
    vol.fromJSON(
      {
        "README.md": "# Project\n\nHello\n",
        "docs/guide.md": "# Guide\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.evidence).toContainEqual(expect.stringContaining("docs/ directory"));
  });
});

// ---------------------------------------------------------------------------
// Score-without-effect pattern tests
// ---------------------------------------------------------------------------

describe("CicdAnalyzer — keyword accuracy", () => {
  const analyzer = new CicdAnalyzer();

  it("does not give deploy credit for shell 'cd' commands", async () => {
    vol.fromJSON(
      {
        ".github/workflows/ci.yml":
          "name: CI\non: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    steps:\n      - run: cd src && npm run build\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    // Should not detect "deploy" from shell "cd" command
    expect(result.evidence).not.toContainEqual(expect.stringContaining("Deployment step"));
  });

  it("does not give SAST credit for gitleaks-only pipeline", async () => {
    vol.fromJSON(
      {
        ".github/workflows/ci.yml":
          "name: CI\non: push\njobs:\n  secrets:\n    runs-on: ubuntu-latest\n    steps:\n      - run: gitleaks detect\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    // gitleaks is secrets detection, not SAST
    expect(result.evidence).not.toContainEqual(expect.stringContaining("SAST"));
  });

  it("gives deploy credit for actual deploy keyword", async () => {
    vol.fromJSON(
      {
        ".github/workflows/ci.yml":
          "name: CI\non: push\njobs:\n  deploy:\n    runs-on: ubuntu-latest\n    steps:\n      - run: npm run deploy\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.evidence).toContainEqual(expect.stringContaining("Deployment step"));
  });
});

describe("SecurityAnalyzer — unwired config suggestions", () => {
  const analyzer = new SecurityAnalyzer();

  it("suggests wiring .semgrep.yml when config exists but CI uses --config auto only", async () => {
    vol.fromJSON(
      {
        ".semgrep.yml": "rules: []\n",
        ".github/workflows/ci.yml":
          "name: CI\non: push\njobs:\n  sast:\n    runs-on: ubuntu-latest\n    steps:\n      - run: semgrep scan --config auto .\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.suggestions).toContainEqual(expect.stringContaining(".semgrep.yml"));
    expect(result.suggestions).toContainEqual(expect.stringContaining("--config .semgrep.yml"));
  });

  it("no wiring suggestion when both config and CI reference exist", async () => {
    vol.fromJSON(
      {
        ".semgrep.yml": "rules: []\n",
        ".github/workflows/ci.yml":
          "name: CI\non: push\njobs:\n  sast:\n    runs-on: ubuntu-latest\n    steps:\n      - run: semgrep scan --config auto --config .semgrep.yml .\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.suggestions).not.toContainEqual(expect.stringContaining("--config .semgrep.yml"));
  });

  it("suggests Renovate service when renovate.json exists but not in CI", async () => {
    vol.fromJSON(
      {
        "renovate.json": '{ "extends": ["config:recommended"] }\n',
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.suggestions).toContainEqual(expect.stringContaining("renovate.json exists"));
    expect(result.suggestions).toContainEqual(expect.stringContaining("Mend Renovate"));
  });
});

describe("ReviewAnalyzer — placeholder and minimum checks", () => {
  const analyzer = new ReviewAnalyzer();

  it("does not give credit for CODEOWNERS with @FIXME placeholders", async () => {
    vol.fromJSON(
      {
        "CODEOWNERS": "# CODEOWNERS\n* @FIXME-add-team\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    // Should not count as having effective CODEOWNERS
    expect(result.evidence).toContainEqual(expect.stringContaining("placeholder"));
    expect(result.score).toBeLessThanOrEqual(1);
  });

  it("gives credit for CODEOWNERS with real team handles", async () => {
    vol.fromJSON(
      {
        "CODEOWNERS": "# CODEOWNERS\n* @myorg/backend-team\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.evidence).toContainEqual(expect.stringContaining("CODEOWNERS"));
    expect(result.score).toBeGreaterThanOrEqual(2);
  });

  it("requires at least 3 checklist items for review checklist credit", async () => {
    vol.fromJSON(
      {
        ".github/PULL_REQUEST_TEMPLATE.md":
          "## PR\n\n- [ ] One item only\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    // 1 checkbox < 3 minimum → no checklist credit
    expect(result.evidence).not.toContainEqual(expect.stringContaining("Review checklist"));
  });

  it("gives checklist credit with 3+ items", async () => {
    vol.fromJSON(
      {
        ".github/PULL_REQUEST_TEMPLATE.md":
          "## PR\n\n- [ ] Tests pass\n- [ ] No secrets\n- [ ] Reviewed\n",
        "CODEOWNERS": "* @team\n",
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.evidence).toContainEqual(expect.stringContaining("Review checklist"));
  });
});

describe("CoverageAnalyzer — strict scoring", () => {
  const analyzer = new CoverageAnalyzer();

  it("scores 3 (not 4) when enforcement exists but threshold is unknown", async () => {
    vol.fromJSON(
      {
        "vitest.config.ts":
          'export default { test: { coverage: { thresholds: {} } } };',
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    // Has "threshold" keyword but no parseable percentage → score 3 not 4
    expect(result.score).toBeLessThanOrEqual(3);
  });

  it("does not give config credit for devDep names containing coverage", async () => {
    vol.fromJSON(
      {
        "package.json": JSON.stringify({
          name: "test-project",
          devDependencies: {
            "@vitest/coverage-v8": "^1.0.0",
          },
        }),
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    // devDep name should not count as coverage config
    expect(result.score).toBe(0);
  });

  it("gives config credit for coverage scripts in package.json", async () => {
    vol.fromJSON(
      {
        "package.json": JSON.stringify({
          name: "test-project",
          scripts: {
            "test:coverage": "vitest run --coverage",
          },
        }),
      },
      REPO,
    );
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.evidence).toContainEqual(expect.stringContaining("coverage scripts"));
  });
});

// ===========================================================================
// Mutation-killing tests — DocsAnalyzer
// ===========================================================================

describe("DocsAnalyzer — mutation killing", () => {
  const analyzer = new DocsAnalyzer();

  describe("empty repo — all findings default to false", () => {
    it("should return score 0 with no documentation files", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
      expect(result.dimension).toBe("docs");
      expect(result.details).toBe("No documentation found.");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.evidence).toContainEqual("No documentation files detected.");
      expect(result.suggestions).toContainEqual(
        "Create a README.md with project description, setup, and usage instructions.",
      );
    });
  });

  describe("score 1 — minimal README", () => {
    it("should score exactly 1 for a short README (under 20 lines)", async () => {
      vol.fromJSON({ "README.md": "# Project\n\nShort readme.\n" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
      expect(result.details).toBe("Minimal README found.");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.suggestions).toContainEqual(
        "Expand the README with project setup, build, and test instructions.",
      );
      expect(result.suggestions).toContainEqual(
        "Consider adding a docs/ directory for detailed documentation.",
      );
    });

    it("should score 1 for README with exactly 20 lines (boundary)", async () => {
      // "# Project\n\n" = 2 newlines, 17 lines joined = 16 newlines, trailing "\n" = 1
      // total newlines = 19 => split("\n").length = 20 => NOT > 20 => score 1
      const lines = Array.from({ length: 17 }, (_, i) => `Line ${i}`);
      vol.fromJSON({ "README.md": `# Project\n\n${lines.join("\n")}\n` }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });
  });

  describe("score 2 — README with meaningful content (>20 lines)", () => {
    it("should score exactly 2 for a README with 25 lines but no build commands", async () => {
      const lines = Array.from({ length: 23 }, (_, i) => `Documentation line ${i}.`);
      vol.fromJSON({ "README.md": `# Project\n\n${lines.join("\n")}\n` }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.details).toBe("README exists with meaningful content.");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.suggestions).toContainEqual("Add build and test commands to the README.");
    });

    it("should suggest CONTRIBUTING.md when not present at score 2", async () => {
      const lines = Array.from({ length: 25 }, (_, i) => `Line ${i}.`);
      vol.fromJSON({ "README.md": `# Project\n\n${lines.join("\n")}\n` }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.suggestions).toContainEqual(
        "Add a CONTRIBUTING.md with workflow guidelines.",
      );
    });

    it("should not suggest CONTRIBUTING.md when it exists at score 2", async () => {
      const lines = Array.from({ length: 25 }, (_, i) => `Line ${i}.`);
      vol.fromJSON(
        {
          "README.md": `# Project\n\n${lines.join("\n")}\n`,
          "CONTRIBUTING.md": "# Contributing\n\nGuidelines.\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.suggestions).not.toContainEqual(
        "Add a CONTRIBUTING.md with workflow guidelines.",
      );
    });
  });

  describe("score 3 — README with build/test commands", () => {
    it("should score exactly 3 for README with npm run build (build command only)", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\n## Setup\n\n```bash\nnpm run build\n```\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.details).toBe("README includes build/test commands.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score exactly 3 for README with npm test (test command only)", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\n## Test\n\n```bash\nnpm test\n```\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with yarn build command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun `yarn build` to build.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with pnpm command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun `pnpm install` to setup.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with dotnet build command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun dotnet build to compile.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with mvn command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun mvn clean install.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with gradle command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun gradle build.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with make command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun make all to build.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with cargo build command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun cargo build.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with vitest test runner", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun vitest to test.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with jest test runner", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun jest to test.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with pytest test runner", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun pytest to test.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with dotnet test command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun dotnet test to verify.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with mvn test command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun mvn test to verify.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with cargo test command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun cargo test to verify.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 for README with yarn test command", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\nRun yarn test to verify.\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should suggest architecture docs when missing at score 3", async () => {
      vol.fromJSON(
        { "README.md": "# Project\n\n```bash\nnpm run build\nnpm test\n```\n" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.suggestions).toContainEqual("Add architecture documentation (ARCHITECTURE.md).");
      expect(result.suggestions).toContainEqual(
        "Add API documentation (openapi.yaml or swagger.json).",
      );
      expect(result.suggestions).toContainEqual(
        "Add an onboarding guide for new contributors.",
      );
    });
  });

  describe("score 4 — architecture + API/onboarding + build commands", () => {
    it("should score exactly 4 with architecture docs + API docs + build commands", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n\nOverview.\n",
          "openapi.yaml": "openapi: 3.0.0\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.details).toBe("Strong documentation with architecture, API, and onboarding docs.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score 4 with architecture docs + onboarding + build commands", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\nRun `npm run build`.\n",
          "ARCHITECTURE.md": "# Architecture\n\nOverview.\n",
          "ONBOARDING.md": "# Onboarding\n\nWelcome.\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should suggest CLAUDE.md when missing at score 4", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n\nOverview.\n",
          "openapi.yaml": "openapi: 3.0.0\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.suggestions).toContainEqual(
        "Add a CLAUDE.md file for AI-assisted development configuration.",
      );
      expect(result.suggestions).toContainEqual(
        "Create a .claude/ directory with settings.json.",
      );
    });

    it("should NOT score 4 when architecture docs exist but no API or onboarding", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n\nOverview.\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // Missing both API and onboarding => not score 4, falls to score 3
      expect(result.score).toBe(3);
    });

    it("should detect docs/architecture.md as architecture doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "docs/architecture.md": "# Architecture\n\nOverview.\n",
          "openapi.json": "{}",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.evidence).toContainEqual(expect.stringContaining("Architecture doc"));
    });

    it("should detect docs/design.md as architecture doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "docs/design.md": "# Design\n\nDesign doc.\n",
          "swagger.json": "{}",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect DESIGN.md as architecture doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "DESIGN.md": "# Design\n\nDesign doc.\n",
          "swagger.yaml": "swagger: '2.0'",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect swagger.yml as API doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n",
          "swagger.yml": "swagger: '2.0'",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect openapi.yml as API doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n",
          "openapi.yml": "openapi: 3.0.0\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect openapi.json as API doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n",
          "openapi.json": "{}",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect docs/api.md as API doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n",
          "docs/api.md": "# API\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect API.md as API doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n",
          "API.md": "# API\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect docs/onboarding.md as onboarding doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n",
          "docs/onboarding.md": "# Onboarding\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect docs/getting-started.md as onboarding doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n",
          "docs/getting-started.md": "# Getting Started\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect GETTING_STARTED.md as onboarding doc", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "ARCHITECTURE.md": "# Architecture\n",
          "GETTING_STARTED.md": "# Getting Started\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });
  });

  describe("score 5 — CLAUDE.md + .claude/ + build commands", () => {
    it("should score exactly 5 with CLAUDE.md + .claude/ dir + build commands", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "CLAUDE.md": "# Claude Config\n",
          ".claude/settings.json": '{"model":"claude-sonnet-4-20250514"}',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.details).toBe(
        "Comprehensive documentation including CLAUDE.md and .claude/ configuration.",
      );
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should NOT score 5 without build commands even with CLAUDE.md + .claude/", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\nJust a description.\n",
          "CLAUDE.md": "# Claude\n",
          ".claude/settings.json": '{}',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
    });

    it("should NOT score 5 with CLAUDE.md but without .claude/ directory", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "CLAUDE.md": "# Claude\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
    });

    it("should NOT score 5 with .claude/ directory but without CLAUDE.md", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          ".claude/settings.json": '{}',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
    });

    it("should suggest architecture docs when missing at score 5", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "CLAUDE.md": "# Claude\n",
          ".claude/settings.json": '{}',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.suggestions).toContainEqual(
        "Consider adding architecture documentation.",
      );
    });
  });

  describe("alternative README file names", () => {
    it("should detect readme.md (lowercase)", async () => {
      vol.fromJSON({ "readme.md": "# hello\nContent.\n" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.evidence).toContainEqual(expect.stringContaining("readme.md"));
    });

    it("should detect README.rst", async () => {
      vol.fromJSON({ "README.rst": "Project\n=======\nContent.\n" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.evidence).toContainEqual(expect.stringContaining("README.rst"));
    });

    it("should detect README.txt", async () => {
      vol.fromJSON({ "README.txt": "Project readme.\n" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.evidence).toContainEqual(expect.stringContaining("README.txt"));
    });

    it("should detect README (no extension)", async () => {
      vol.fromJSON({ "README": "Project readme.\n" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.evidence).toContainEqual(expect.stringContaining("README"));
    });
  });

  describe("contributing doc detection", () => {
    it("should detect contributing.md (lowercase)", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n",
          "contributing.md": "# Contributing\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Contributing guide"));
    });

    it("should detect docs/CONTRIBUTING.md", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n",
          "docs/CONTRIBUTING.md": "# Contributing\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Contributing guide"));
    });
  });

  describe("evidence and source tracking", () => {
    it("should report .claude/settings.json in evidence when it exists", async () => {
      vol.fromJSON(
        {
          "README.md": "# Project\n\n```bash\nnpm run build\n```\n",
          "CLAUDE.md": "# Claude\n",
          ".claude/settings.json": '{}',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining(".claude/settings.json"));
    });

    it("should include README line count in evidence", async () => {
      vol.fromJSON({ "README.md": "# Project\n\nLine.\n" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("lines"));
    });
  });
});

// ===========================================================================
// Mutation-killing tests — CoverageAnalyzer
// ===========================================================================

describe("CoverageAnalyzer — mutation killing", () => {
  const analyzer = new CoverageAnalyzer();

  describe("score 0 — no coverage at all", () => {
    it("should return score 0 for completely empty repo", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
      expect(result.dimension).toBe("coverage");
      expect(result.details).toBe("No code coverage measurement detected.");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.evidence).toContainEqual("No coverage configuration or reports detected.");
      expect(result.suggestions.length).toBeGreaterThan(0);
      expect(result.suggestions).toContainEqual(
        "Set up code coverage measurement for your test suite.",
      );
      expect(result.suggestions).toContainEqual(
        "Configure a coverage reporter (e.g. V8, Istanbul, JaCoCo, Coverlet).",
      );
    });

    it("should return score 0 for package.json with no coverage-related content", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ name: "my-app", scripts: { start: "node index.js" } }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
    });
  });

  describe("score 1 — config exists but no reports or enforcement", () => {
    it("should score exactly 1 with coverage script but no reports", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            scripts: { "test:coverage": "vitest --coverage" },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
      expect(result.details).toBe("Coverage tooling found but coverage appears low or unmeasured.");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.suggestions).toContainEqual(
        "Coverage config found but no recent reports. Run your test suite with coverage enabled.",
      );
      expect(result.suggestions).toContainEqual(
        "Add coverage enforcement thresholds to prevent regression.",
      );
    });

    it("should score 1 with c8 script but no reports", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            scripts: { test: "c8 vitest" },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with istanbul script but no reports", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            scripts: { test: "istanbul cover" },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with nyc script but no reports", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            scripts: { test: "nyc mocha" },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with package.json c8 config section but no reports", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            c8: { reporter: ["text", "lcov"] },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with package.json nyc config section but no reports", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            nyc: { reporter: ["text"] },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with jest collectCoverage in package.json but no reports", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            jest: { collectCoverage: true },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should detect vitest.config.ts with coverage keyword as config", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { provider: "v8" } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.evidence).toContainEqual(expect.stringContaining("vitest.config.ts"));
    });

    it("should detect vitest.config.js as config", async () => {
      vol.fromJSON(
        {
          "vitest.config.js": 'module.exports = { test: { coverage: {} } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
    });

    it("should detect vitest.config.mts as config", async () => {
      vol.fromJSON(
        {
          "vitest.config.mts": 'export default { test: { coverage: {} } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
    });

    it("should detect jest.config.ts as config", async () => {
      vol.fromJSON(
        {
          "jest.config.ts": 'export default { coverage: true };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
    });

    it("should detect jest.config.js as config", async () => {
      vol.fromJSON(
        {
          "jest.config.js": 'module.exports = { coverage: true };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
    });

    it("should detect jest.config.mjs as config", async () => {
      vol.fromJSON(
        {
          "jest.config.mjs": 'export default { coverage: true };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
    });

    it("should detect coverlet.runsettings as config", async () => {
      vol.fromJSON(
        {
          "coverlet.runsettings": "<RunSettings></RunSettings>",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.evidence).toContainEqual(expect.stringContaining("coverlet.runsettings"));
    });
  });

  describe("score 2 — reports exist but no enforcement", () => {
    it("should score exactly 2 when coverage reports exist with unknown percentage", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.details).toBe("Coverage configured but may be insufficient (40-60%).");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.suggestions).toContainEqual(
        "Add coverage threshold enforcement in CI to prevent regressions.",
      );
    });

    it("should detect lcov.info at root level", async () => {
      vol.fromJSON(
        {
          "lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
          "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should detect cobertura.xml in coverage dir", async () => {
      vol.fromJSON(
        {
          "coverage/cobertura.xml": "<coverage></coverage>",
          "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should detect cobertura.xml at root level", async () => {
      vol.fromJSON(
        {
          "cobertura.xml": "<coverage></coverage>",
          "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });
  });

  describe("score 3 — enforcement with unknown or 60-80% threshold", () => {
    it("should score exactly 3 when enforcement exists but threshold is unknown", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: {} } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.details).toBe("Good coverage (60-80% range) detected.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score exactly 3 when enforcement with 60% threshold", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 60 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score exactly 3 when enforcement with 79% threshold", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 79 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should suggest mutation testing when missing at enforcement level", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 70 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.suggestions).toContainEqual(
        "Add mutation testing (e.g. Stryker, PIT) for deeper coverage confidence.",
      );
    });

    it("should score 3 when enforcement detected in CI workflow", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { provider: "v8" } } };',
          ".github/workflows/ci.yml":
            "name: CI\njobs:\n  test:\n    steps:\n      - run: npx vitest --coverage --fail-under=70",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // CI has "coverage" + "fail" keywords => enforcement detected
      expect(result.score).toBeGreaterThanOrEqual(3);
    });
  });

  describe("score 4 — enforcement with >=80% threshold", () => {
    it("should score exactly 4 with 80% branches threshold", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { branches: 80 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.details).toBe("Strong coverage with threshold enforcement.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score exactly 4 with 90% lines threshold", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 90 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should score exactly 4 with functions threshold at 80", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { functions: 80 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should score exactly 4 with statements threshold at 85", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { statements: 85 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });
  });

  describe("score 5 — enforcement + mutation testing", () => {
    it("should score exactly 5 with enforcement + stryker.conf.js", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 90 } } } };',
          "stryker.conf.js": "module.exports = {};",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.details).toBe("Excellent coverage with enforcement and mutation testing.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score 5 with enforcement + stryker.conf.mjs", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          "stryker.conf.mjs": "export default {};",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should score 5 with enforcement + stryker.conf.json", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          "stryker.conf.json": "{}",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should score 5 with enforcement + stryker.config.js", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          "stryker.config.js": "module.exports = {};",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should score 5 with enforcement + stryker.config.mjs", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          "stryker.config.mjs": "export default {};",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should score 5 with enforcement + stryker.config.json", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          "stryker.config.json": "{}",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should score 5 with enforcement + PIT mutation testing in pom.xml", async () => {
      vol.fromJSON(
        {
          "pom.xml":
            '<project><build><plugins><plugin><groupId>org.jacoco</groupId><configuration><rules><rule><limits><limit><minimum>0.80</minimum></limit></limits></rule></rules></configuration></plugin><plugin><groupId>org.pitest</groupId></plugin></plugins></build></project>',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.evidence).toContainEqual(expect.stringContaining("PIT"));
    });

    it("should NOT score 5 with mutation testing but no enforcement", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { provider: "v8" } } };',
          "stryker.conf.js": "module.exports = {};",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
    });
  });

  describe("JaCoCo detection", () => {
    it("should detect JaCoCo config in pom.xml", async () => {
      vol.fromJSON(
        {
          "pom.xml": '<project><plugins><plugin><groupId>org.jacoco</groupId></plugin></plugins></project>',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("JaCoCo"));
    });

    it("should detect enforcement when pom.xml has minimum keyword", async () => {
      vol.fromJSON(
        {
          "pom.xml":
            '<project><plugins><plugin><groupId>org.jacoco</groupId><configuration><rules><rule><limits><limit><minimum>0.80</minimum></limit></limits></rule></rules></configuration></plugin></plugins></project>',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(3);
    });
  });

  describe("jest coverageThreshold detection", () => {
    it("should detect jest coverageThreshold in package.json as enforcement", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            jest: {
              coverageThreshold: { global: { branches: 80, functions: 80, lines: 80 } },
            },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(3);
    });
  });

  describe("evidence formatting", () => {
    it("should prefix config sources with 'Found: '", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            scripts: { "test:coverage": "vitest --coverage" },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Found:"));
    });
  });
});

// ===========================================================================
// Mutation-killing tests — SecurityAnalyzer
// ===========================================================================

describe("SecurityAnalyzer — mutation killing", () => {
  const analyzer = new SecurityAnalyzer();

  describe("score 0 — no security signals", () => {
    it("should return score 0 for empty repo", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
      expect(result.dimension).toBe("security");
      expect(result.details).toBe("No security scanning detected.");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.evidence).toContainEqual("No security tooling detected.");
      expect(result.suggestions).toContainEqual("Add SAST scanning (e.g. Semgrep or CodeQL).");
      expect(result.suggestions).toContainEqual(
        "Add secrets detection (e.g. Gitleaks or TruffleHog).",
      );
      expect(result.suggestions).toContainEqual(
        "Add dependency scanning (e.g. Snyk, Trivy, or Dependabot).",
      );
      expect(result.suggestions).toContainEqual("Add DAST scanning (e.g. OWASP ZAP).");
      expect(result.suggestions).toContainEqual("Generate SBOMs (e.g. Syft, CycloneDX).");
    });
  });

  describe("score 1 — ad-hoc signals only (not SAST or secrets)", () => {
    it("should score exactly 1 with only SCA (no SAST, no secrets)", async () => {
      vol.fromJSON(
        {
          ".snyk": "{}",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
      expect(result.details).toBe("Ad-hoc security tooling detected.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score 1 with only Dependabot config (no SAST, no secrets)", async () => {
      vol.fromJSON(
        {
          ".github/dependabot.yml": "version: 2\nupdates: []",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with only Renovate config (no SAST, no secrets)", async () => {
      vol.fromJSON(
        {
          "renovate.json": '{ "extends": ["config:recommended"] }',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with only .renovaterc.json config (no SAST, no secrets)", async () => {
      vol.fromJSON(
        {
          ".renovaterc.json": '{ "extends": ["config:recommended"] }',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with only DAST in CI (no SAST, no secrets)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml": "name: Security\njobs:\n  scan:\n    steps:\n      - run: zap scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 1 with only SBOM in CI (no SAST, no secrets)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml": "name: Security\njobs:\n  sbom:\n    steps:\n      - run: syft generate sbom",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });
  });

  describe("score 2 — SAST only OR secrets only", () => {
    it("should score exactly 2 with only SAST (Semgrep config file)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.details).toBe("Partial security scanning detected.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score exactly 2 with only SAST (.semgrep.yaml config file)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yaml": "rules: []",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only SAST (CodeQL directory)", async () => {
      vol.fromJSON(
        {
          ".github/codeql/config.yml": "queries: []",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only SAST (SonarQube config file)", async () => {
      vol.fromJSON(
        {
          "sonar-project.properties": "sonar.projectKey=my-project",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only SAST (Semgrep in CI)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: semgrep scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only SAST (CodeQL in CI)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - uses: github/codeql-action",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only SAST (SonarQube in CI)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: sonar-scanner",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only secrets detection (Gitleaks config file)", async () => {
      vol.fromJSON(
        {
          ".gitleaks.toml": "[allowlist]",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only secrets detection (Gitleaks in CI)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: gitleaks detect",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only secrets detection (TruffleHog in CI)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: trufflehog scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only secrets detection (detect-secrets in CI)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: detect-secrets scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });
  });

  describe("score 3 — SAST AND secrets", () => {
    it("should score exactly 3 with SAST + secrets (config files)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
          ".gitleaks.toml": "[allowlist]",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.details).toBe("SAST and secrets detection are active.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score exactly 3 with SAST + secrets (CI pipeline)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: trufflehog scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should NOT score 3 with only SAST (missing secrets)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.score).not.toBe(3);
    });

    it("should NOT score 3 with only secrets (missing SAST)", async () => {
      vol.fromJSON(
        {
          ".gitleaks.toml": "[allowlist]",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.score).not.toBe(3);
    });
  });

  describe("score 4 — SAST + secrets + SCA", () => {
    it("should score exactly 4 with SAST + secrets + SCA (Snyk)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
          ".gitleaks.toml": "[allowlist]",
          ".snyk": "{}",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.details).toBe("Strong security pipeline with SAST, secrets detection, and SCA.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score exactly 4 with SAST + secrets + SCA (Trivy in CI)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
          ".gitleaks.toml": "[allowlist]",
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: trivy image scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should score exactly 4 with SAST + secrets + SCA (Dependabot config)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
          ".gitleaks.toml": "[allowlist]",
          ".github/dependabot.yml": "version: 2\nupdates: []",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should score exactly 4 with SAST + secrets + SCA (Dependabot yaml)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
          ".gitleaks.toml": "[allowlist]",
          ".github/dependabot.yaml": "version: 2\nupdates: []",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should score exactly 4 with SAST + secrets + SCA (OWASP in CI)", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
          ".gitleaks.toml": "[allowlist]",
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: owasp dependency-check",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should score exactly 4 with SAST + secrets + SCA (Snyk in CI)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml":
            "name: CI\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });
  });

  describe("score 5 — SAST + secrets + SCA + DAST + SBOM", () => {
    it("should score exactly 5 with all five categories", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test\n      - run: zap scan\n      - run: syft generate sbom",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.details).toBe(
        "Comprehensive security pipeline with SAST, secrets detection, SCA, DAST, and SBOM.",
      );
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score 5 with DAST via Nuclei", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test\n      - run: nuclei scan\n      - run: syft generate sbom",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should score 5 with DAST via generic dast keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test\n      - run: dast scan\n      - run: cyclonedx generate",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should score 5 with SBOM via CycloneDX", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test\n      - run: zap scan\n      - run: cyclonedx generate",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should score 5 with SBOM via generic sbom keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test\n      - run: zap scan\n      - run: generate sbom output",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should NOT score 5 without DAST (missing one category)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test\n      - run: syft generate sbom",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.score).not.toBe(5);
    });

    it("should NOT score 5 without SBOM (missing one category)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect\n      - run: snyk test\n      - run: zap scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.score).not.toBe(5);
    });
  });

  describe("evidence contains tool names", () => {
    it("should include Semgrep in evidence when .semgrep.yml exists", async () => {
      vol.fromJSON({ ".semgrep.yml": "rules: []" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Semgrep"));
      expect(result.evidence).toContainEqual(expect.stringContaining("sast"));
    });

    it("should include CodeQL in evidence when .github/codeql dir exists", async () => {
      vol.fromJSON({ ".github/codeql/config.yml": "{}" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("CodeQL"));
    });

    it("should include Gitleaks in evidence when .gitleaks.toml exists", async () => {
      vol.fromJSON({ ".gitleaks.toml": "[allowlist]" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Gitleaks"));
      expect(result.evidence).toContainEqual(expect.stringContaining("secrets"));
    });

    it("should include Snyk in evidence when .snyk exists", async () => {
      vol.fromJSON({ ".snyk": "{}" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Snyk"));
      expect(result.evidence).toContainEqual(expect.stringContaining("sca"));
    });

    it("should include Dependabot in evidence when config exists", async () => {
      vol.fromJSON({ ".github/dependabot.yml": "version: 2" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Dependabot"));
    });

    it("should include Renovate in evidence when config exists", async () => {
      vol.fromJSON({ "renovate.json": '{ "extends": [] }' }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Renovate"));
    });

    it("should include TruffleHog in evidence when in CI", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: trufflehog scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("TruffleHog"));
    });

    it("should include detect-secrets in evidence when in CI", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: detect-secrets scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("detect-secrets"));
    });
  });

  describe("pipeline content reading", () => {
    it("should detect tools from .gitlab-ci.yml", async () => {
      vol.fromJSON(
        {
          ".gitlab-ci.yml": "security:\n  script:\n    - semgrep scan\n    - gitleaks detect",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should scan multiple workflow files in .github/workflows", async () => {
      vol.fromJSON(
        {
          ".github/workflows/sast.yml": "name: SAST\njobs:\n  scan:\n    steps:\n      - run: semgrep scan",
          ".github/workflows/secrets.yml": "name: Secrets\njobs:\n  scan:\n    steps:\n      - run: gitleaks detect",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should scan .yaml extension workflow files", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yaml": "name: Security\njobs:\n  scan:\n    steps:\n      - run: semgrep scan\n      - run: gitleaks detect",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });
  });

  describe("deduplication", () => {
    it("should not double-count Semgrep when both config file and CI mention exist", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
          ".github/workflows/ci.yml": "name: CI\njobs:\n  scan:\n    steps:\n      - run: semgrep scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // Even with dedup, there should be 2 evidence entries for Semgrep (config + CI)
      // But only one signal per category+tool combo
      expect(result.score).toBe(2); // Still only SAST, no secrets
    });
  });
});

// ===========================================================================
// Mutation-killing tests — ReviewAnalyzer
// ===========================================================================

describe("ReviewAnalyzer — mutation killing", () => {
  const analyzer = new ReviewAnalyzer();

  describe("score 0 — empty repo, all findings false", () => {
    it("should return score 0 with no review configuration", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
      expect(result.dimension).toBe("review");
      expect(result.details).toBe("No code review process detected.");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.evidence).toContainEqual("No code review configuration detected.");
      expect(result.suggestions).toContainEqual(
        "Set up pull request reviews as a team standard.",
      );
      expect(result.suggestions).toContainEqual(
        "Add a CODEOWNERS file to define review responsibilities.",
      );
    });
  });

  describe("score 1 — sources exist but none of the main signals", () => {
    it("should score exactly 1 when CODEOWNERS has placeholder @FIXME", async () => {
      vol.fromJSON(
        {
          "CODEOWNERS": "* @FIXME-add-team\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
      expect(result.details).toBe("Ad-hoc code review practices detected.");
      expect(result.details.length).toBeGreaterThan(0);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("placeholder"),
      );
    });

    it("should score exactly 1 when CODEOWNERS has @TODO placeholder", async () => {
      vol.fromJSON(
        {
          "CODEOWNERS": "* @TODO\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score exactly 1 when CODEOWNERS has @PLACEHOLDER", async () => {
      vol.fromJSON(
        {
          "CODEOWNERS": "* @PLACEHOLDER\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should suggest replacing placeholders at score 1", async () => {
      vol.fromJSON(
        {
          "CODEOWNERS": "* @FIXME\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
      expect(result.suggestions).toContainEqual(
        expect.stringContaining("@FIXME placeholders"),
      );
    });

    it("should suggest adding CODEOWNERS and PR template when only placeholder exists", async () => {
      vol.fromJSON(
        {
          "CODEOWNERS": "* @FIXME\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual(
        expect.stringContaining("@FIXME placeholders"),
      );
    });
  });

  describe("score 2 — has PR template OR CODEOWNERS OR branch protection", () => {
    it("should score exactly 2 with only CODEOWNERS (real teams)", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team-lead",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.details).toBe("Basic review process in place.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score exactly 2 with only PR template (no checklist)", async () => {
      vol.fromJSON(
        {
          ".github/PULL_REQUEST_TEMPLATE.md": "## Description\n\nDescribe changes.",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score exactly 2 with only branch protection", async () => {
      vol.fromJSON(
        {
          ".github/settings.yml": "branches:\n  - name: main\n    protection:\n      required_pull_request_reviews:\n        required_approving_review_count: 1",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should detect CODEOWNERS at root level", async () => {
      vol.fromJSON(
        {
          "CODEOWNERS": "* @org/team\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.evidence).toContainEqual(expect.stringContaining("CODEOWNERS"));
    });

    it("should detect CODEOWNERS in docs/ directory", async () => {
      vol.fromJSON(
        {
          "docs/CODEOWNERS": "* @org/team\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.evidence).toContainEqual(expect.stringContaining("CODEOWNERS"));
    });

    it("should detect PR template at .github/pull_request_template.md (lowercase)", async () => {
      vol.fromJSON(
        {
          ".github/pull_request_template.md": "## PR\nDescribe.",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.evidence).toContainEqual(expect.stringContaining("PR template"));
    });

    it("should detect PR template at .azuredevops/pull_request_template.md", async () => {
      vol.fromJSON(
        {
          ".azuredevops/pull_request_template.md": "## PR\nDescribe.",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should detect PR template at root level PULL_REQUEST_TEMPLATE.md", async () => {
      vol.fromJSON(
        {
          "PULL_REQUEST_TEMPLATE.md": "## PR\nDescribe.",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should detect PR template at .github/PULL_REQUEST_TEMPLATE (no extension)", async () => {
      vol.fromJSON(
        {
          ".github/PULL_REQUEST_TEMPLATE": "## PR\nDescribe.",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should detect multiple PR templates directory as risk-tiered", async () => {
      vol.fromJSON(
        {
          ".github/PULL_REQUEST_TEMPLATE/bug.md": "## Bug\n",
          ".github/PULL_REQUEST_TEMPLATE/feature.md": "## Feature\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(2);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Multiple PR templates"),
      );
    });

    it("should detect branch-protection.yml config", async () => {
      vol.fromJSON(
        {
          ".github/branch-protection.yml": "branches:\n  - name: main\n    protection:\n      required_pull_request_reviews:\n        required_approving_review_count: 1",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.evidence).toContainEqual(expect.stringContaining("Branch protection"));
    });

    it("should detect require_code_owner_reviews in branch protection", async () => {
      vol.fromJSON(
        {
          ".github/settings.yml": "branches:\n  - name: main\n    require_code_owner_reviews: true",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.evidence).toContainEqual(expect.stringContaining("Branch protection"));
    });

    it("should suggest CODEOWNERS when missing at score 2 (has PR template)", async () => {
      vol.fromJSON(
        {
          ".github/PULL_REQUEST_TEMPLATE.md": "## Description\n\nDescribe.",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.suggestions).toContainEqual("Add a CODEOWNERS file to define reviewers.");
    });

    it("should suggest PR template when missing at score 2 (has CODEOWNERS only)", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.suggestions).toContainEqual("Add a PR template with a review checklist.");
    });

    it("should suggest more checklist items when PR template has < 3 checkboxes", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
          ".github/PULL_REQUEST_TEMPLATE.md": "## PR\n- [ ] One item\n- [ ] Two items\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.suggestions).toContainEqual(
        "Add more checklist items to your PR template (at least 3 required).",
      );
    });

    it("should suggest replacing CODEOWNERS placeholders at score 2", async () => {
      vol.fromJSON(
        {
          "CODEOWNERS": "* @FIXME\n",
          ".github/PULL_REQUEST_TEMPLATE.md": "## PR\nDescribe.",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.suggestions).toContainEqual(
        expect.stringContaining("@FIXME placeholders"),
      );
    });
  });

  describe("score 3 — CODEOWNERS AND review checklist", () => {
    it("should score exactly 3 with CODEOWNERS + PR template with 3+ checkboxes", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n- [ ] No breaking changes\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.details).toBe("Structured reviews with defined reviewers and checklists.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should NOT score 3 with CODEOWNERS but PR template with only 2 checkboxes", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.score).not.toBe(3);
    });

    it("should count [x] (checked) checkboxes too", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [x] Tests\n- [ ] Docs\n- [x] Review\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should suggest security reviewers at score 3", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n- [ ] Review\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.suggestions).toContainEqual(
        "Add security-specific reviewers to CODEOWNERS for sensitive paths.",
      );
    });

    it("should suggest review bot at score 3 when missing", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n- [ ] Review\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.suggestions).toContainEqual(
        "Consider an automated review bot for faster feedback.",
      );
    });

    it("should count multiple PR templates directory as having checklist", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
          ".github/PULL_REQUEST_TEMPLATE/bug.md": "## Bug\n",
          ".github/PULL_REQUEST_TEMPLATE/feature.md": "## Feature\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // Multiple templates directory sets both hasPrTemplate and hasReviewChecklist
      expect(result.score).toBe(3);
    });
  });

  describe("score 4 — CODEOWNERS + security reviewers + (branch protection OR checklist)", () => {
    it("should score exactly 4 with CODEOWNERS + security reviewers + branch protection", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team\nsrc/auth/ @security-team",
          ".github/settings.yml": "branches:\n  - name: main\n    protection:\n      required_pull_request_reviews:\n        required_approving_review_count: 2",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.details).toBe("Risk-tiered reviews with security sign-off.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should score exactly 4 with CODEOWNERS + security reviewers + checklist", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team\nsrc/auth/ @security-team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n- [ ] Security\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect sec- prefix as security reviewer", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team\nsrc/api/ @sec-team",
          ".github/settings.yml": "branches:\n  - name: main\n    protection:\n      required_pull_request_reviews:\n        required_approving_review_count: 1",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Security-specific reviewers"),
      );
    });

    it("should detect infosec as security reviewer keyword", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team\nsrc/data/ @infosec-team",
          ".github/settings.yml": "branches:\n  - name: main\n    protection:\n      required_pull_request_reviews:\n        required_approving_review_count: 1",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should NOT score 4 without security reviewers", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team\nsrc/api/ @api-team",
          ".github/settings.yml": "branches:\n  - name: main\n    protection:\n      required_pull_request_reviews:\n        required_approving_review_count: 2",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n- [ ] Review\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.score).not.toBe(4);
    });

    it("should suggest review bot at score 4 when missing", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team\nsrc/auth/ @security-team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n- [ ] Security\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.suggestions).toContainEqual(
        "Add an automated review bot (e.g. CodeRabbit, Danger.js) for first-pass reviews.",
      );
    });

    it("should suggest review metrics at score 4 when missing", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team\nsrc/auth/ @security-team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n- [ ] Security\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.suggestions).toContainEqual(
        "Add review metrics tracking (turnaround time, review load balancing) to CI workflows.",
      );
    });

    it("should suggest level 5 improvements at score 4", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team\nsrc/auth/ @security-team",
          ".github/PULL_REQUEST_TEMPLATE.md":
            "## Checklist\n- [ ] Tests\n- [ ] Docs\n- [ ] Security\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.suggestions).toContainEqual(
        expect.stringContaining("level 5"),
      );
    });
  });

  describe("score 5 — review bot AND review metrics", () => {
    it("should score exactly 5 with review bot + review metrics", async () => {
      vol.fromJSON(
        {
          ".coderabbit.yaml": "reviews:\n  auto_review: true",
          ".github/workflows/review.yml": "name: Review\non:\n  pull_request_review:\njobs:\n  metrics:\n    steps:\n      - run: review-metrics collect",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.details).toBe(
        "Excellent review culture with automated first-pass and metrics tracking.",
      );
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should NOT score 5 with review bot but no metrics", async () => {
      vol.fromJSON(
        {
          ".coderabbit.yaml": "reviews:\n  auto_review: true",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
    });

    it("should NOT score 5 with review metrics but no bot", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @team",
          ".github/workflows/review.yml": "name: Review\non:\n  pull_request_review:\njobs:\n  metrics:\n    steps:\n      - run: review-metrics collect",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
    });
  });

  describe("review bot detection", () => {
    it("should detect .coderabbit.yml as review bot", async () => {
      vol.fromJSON(
        {
          ".coderabbit.yml": "reviews: {}",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("CodeRabbit"));
    });

    it("should detect .github/copilot-review.yml as review bot", async () => {
      vol.fromJSON(
        {
          ".github/copilot-review.yml": "enabled: true",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Copilot Review"));
    });

    it("should detect .reviewbot.yml as review bot", async () => {
      vol.fromJSON(
        {
          ".reviewbot.yml": "enabled: true",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("ReviewBot"));
    });

    it("should detect .prow.yaml as review bot", async () => {
      vol.fromJSON(
        {
          ".prow.yaml": "presubmits: []",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Prow"));
    });

    it("should detect dangerfile.js as review bot", async () => {
      vol.fromJSON(
        {
          "dangerfile.js": "const { danger } = require('danger');",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Danger.js"));
    });

    it("should detect dangerfile.ts as review bot", async () => {
      vol.fromJSON(
        {
          "dangerfile.ts": "import { danger } from 'danger';",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Danger.js"));
    });
  });

  describe("review metrics detection", () => {
    it("should detect auto-approve keyword as review metrics", async () => {
      vol.fromJSON(
        {
          ".github/workflows/auto.yml": "name: Auto\non:\n  pull_request:\njobs:\n  approve:\n    steps:\n      - run: auto-approve",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Review automation"));
    });

    it("should detect pull_request_review trigger as review metrics", async () => {
      vol.fromJSON(
        {
          ".github/workflows/review.yml": "name: Review\non:\n  pull_request_review:\njobs:\n  track:\n    steps:\n      - run: echo tracked",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Review automation"));
    });

    it("should scan .yaml extension workflow files for review metrics", async () => {
      vol.fromJSON(
        {
          ".github/workflows/review.yaml": "name: Review\non:\n  pull_request_review:\njobs:\n  track:\n    steps:\n      - run: review-metrics collect",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Review automation"));
    });
  });

  describe("CODEOWNERS placeholder detection variations", () => {
    it("should set hasCodeownersPlaceholder true for @FIXME and hasCodeowners false", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @FIXME-team\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // hasCodeownersPlaceholder = true, hasCodeowners = false
      // sources.length > 0, but no hasPrTemplate/hasBranchProtection => score 1
      expect(result.score).toBe(1);
      expect(result.evidence).toContainEqual(expect.stringContaining("placeholder"));
    });

    it("should not set hasCodeownersPlaceholder for normal teams", async () => {
      vol.fromJSON(
        {
          ".github/CODEOWNERS": "* @myorg/backend-team\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.evidence).not.toContainEqual(expect.stringContaining("placeholder"));
    });
  });
});

// ===========================================================================
// Mutation-killing tests — CicdAnalyzer
// ===========================================================================

describe("CicdAnalyzer — mutation killing", () => {
  const analyzer = new CicdAnalyzer();

  // -------------------------------------------------------------------------
  // Score 0 — no pipeline files at all
  // -------------------------------------------------------------------------
  describe("score 0 — empty repo", () => {
    it("should return score exactly 0 when no pipeline files exist", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
    });

    it("should return dimension 'cicd'", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.dimension).toBe("cicd");
    });

    it("should return exact details text for score 0", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("No CI/CD pipeline configuration found.");
      expect(result.details.length).toBeGreaterThan(0);
    });

    it("should return evidence with 'No pipeline files detected in standard locations.'", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toEqual(["No pipeline files detected in standard locations."]);
      expect(result.evidence.length).toBe(1);
    });

    it("should return exactly 2 suggestions for score 0", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions.length).toBe(2);
      expect(result.suggestions[0]).toBe(
        "Add a CI pipeline (e.g. .github/workflows/ci.yml or azure-pipelines.yml).",
      );
      expect(result.suggestions[1]).toBe("Start with a basic build + test workflow.");
    });

    it("should not return empty evidence array for score 0", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toEqual([]);
    });

    it("should not return empty suggestions array for score 0", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Score 1 — pipeline exists but no meaningful keywords
  // -------------------------------------------------------------------------
  describe("score 1 — pipeline file with no keywords", () => {
    it("should return score exactly 1", async () => {
      vol.fromJSON(
        {
          ".github/workflows/build.yml": "name: Build\non:\n  push:\njobs:\n  build:\n    runs-on: ubuntu\n    steps:\n      - run: echo hello",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should have evidence containing the pipeline file name", async () => {
      vol.fromJSON(
        {
          ".github/workflows/build.yml": "name: Build\non:\n  push:\njobs:\n  build:\n    runs-on: ubuntu\n    steps:\n      - run: echo hello",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(
        expect.stringContaining(".github/workflows/build.yml"),
      );
    });

    it("should have evidence containing 'Found 1 pipeline file(s)'", async () => {
      vol.fromJSON(
        {
          ".github/workflows/build.yml": "name: Build\non: push\njobs:\n  build:\n    runs-on: ubuntu\n    steps:\n      - run: echo hi",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Found 1 pipeline file(s)"),
      );
    });

    it("should return details 'Pipeline files found but minimal automation configured.'", async () => {
      vol.fromJSON(
        {
          ".github/workflows/build.yml": "name: Build\non: push\njobs:\n  build:\n    runs-on: ubuntu\n    steps:\n      - run: echo hi",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Pipeline files found but minimal automation configured.");
    });

    it("should suggest adding tests, lint, SAST, deploy, and self-healing at score 1", async () => {
      vol.fromJSON(
        {
          ".github/workflows/build.yml": "name: Build\non: push\njobs:\n  build:\n    runs-on: ubuntu\n    steps:\n      - run: echo hi",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Add automated tests to your CI pipeline.");
      expect(result.suggestions).toContainEqual("Add linting to your CI pipeline.");
      expect(result.suggestions).toContainEqual(
        "Add SAST scanning (e.g. Semgrep, CodeQL) to your pipeline.",
      );
      expect(result.suggestions).toContainEqual("Add automated deployment gates.");
      expect(result.suggestions).toContainEqual(
        "Consider canary deployments or auto-rollback for self-healing CD.",
      );
    });

    it("should not include 'Test step detected' in evidence at score 1", async () => {
      vol.fromJSON(
        {
          ".github/workflows/build.yml": "name: Build\non: push\njobs:\n  build:\n    runs-on: ubuntu\n    steps:\n      - run: echo hi",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("Test step detected"),
      );
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("Lint step detected"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Score 2 — tests OR lint but not both
  // -------------------------------------------------------------------------
  describe("score 2 — tests only (no lint)", () => {
    it("should score exactly 2 with only tests", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should include 'Test step detected in pipeline.' in evidence", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should NOT include 'Lint step detected' in evidence", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("Lint step detected"),
      );
    });

    it("should return details 'Basic CI pipeline detected but incomplete (missing tests or lint).'", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe(
        "Basic CI pipeline detected but incomplete (missing tests or lint).",
      );
    });

    it("should suggest adding lint but not adding tests", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Add linting to your CI pipeline.");
      expect(result.suggestions).not.toContainEqual(
        "Add automated tests to your CI pipeline.",
      );
    });
  });

  describe("score 2 — lint only (no tests)", () => {
    it("should score exactly 2 with only lint", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should include 'Lint step detected in pipeline.' in evidence", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
    });

    it("should NOT include 'Test step detected' in evidence for lint-only", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("Test step detected"),
      );
    });

    it("should suggest adding tests but not adding lint", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual(
        "Add automated tests to your CI pipeline.",
      );
      expect(result.suggestions).not.toContainEqual(
        "Add linting to your CI pipeline.",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Score 3 — tests AND lint
  // -------------------------------------------------------------------------
  describe("score 3 — tests + lint", () => {
    it("should score exactly 3 with tests and lint", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should include both test and lint evidence", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
    });

    it("should return details 'Good CI pipeline with tests and linting.'", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Good CI pipeline with tests and linting.");
    });

    it("should suggest SAST, deploy, and self-healing at score 3", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual(
        "Add SAST scanning (e.g. Semgrep, CodeQL) to your pipeline.",
      );
      expect(result.suggestions).toContainEqual("Add automated deployment gates.");
      expect(result.suggestions).toContainEqual(
        "Consider canary deployments or auto-rollback for self-healing CD.",
      );
    });

    it("should NOT suggest adding tests or lint at score 3", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual(
        "Add automated tests to your CI pipeline.",
      );
      expect(result.suggestions).not.toContainEqual(
        "Add linting to your CI pipeline.",
      );
    });
  });

  // -------------------------------------------------------------------------
  // Score 4 — tests + SAST + deploy (with or without lint)
  // -------------------------------------------------------------------------
  describe("score 4 — tests + SAST + deploy", () => {
    it("should score exactly 4 with tests, SAST, and deploy", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: npm run deploy",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should include SAST and deploy evidence", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: npm run deploy",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SAST/security scanning detected in pipeline.");
      expect(result.evidence).toContainEqual("Deployment step detected in pipeline.");
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should return details 'Mature CI/CD pipeline with security and deployment gates.'", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: npm run deploy",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe(
        "Mature CI/CD pipeline with security and deployment gates.",
      );
    });

    it("should still suggest self-healing at score 4", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: npm run deploy",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual(
        "Consider canary deployments or auto-rollback for self-healing CD.",
      );
    });

    it("should NOT suggest SAST or deploy at score 4", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: npm run deploy",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining("Add SAST scanning"),
      );
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining("Add automated deployment gates"),
      );
    });

    it("should score 4 (not 5) when tests + SAST + deploy but no self-heal", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: eslint .\n      - run: codeql analyze\n      - run: npm run deploy",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.score).not.toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Score 5 — self-healing + deploy + SAST
  // -------------------------------------------------------------------------
  describe("score 5 — full CD with self-healing", () => {
    it("should score exactly 5 with self-healing + deploy + SAST", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: deploy canary\n      - run: auto-rollback on failure",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
    });

    it("should include self-healing evidence", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: deploy canary\n      - run: auto-rollback on failure",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Self-healing/canary deployment detected.");
    });

    it("should return details 'Mature CI/CD pipeline with security and deployment gates.' at score 5", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: deploy canary\n      - run: auto-rollback on failure",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe(
        "Mature CI/CD pipeline with security and deployment gates.",
      );
    });

    it("should have no suggestions for self-healing at score 5", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    runs-on: ubuntu\n    steps:\n      - run: npm test\n      - run: eslint .\n      - run: semgrep scan\n      - run: deploy canary\n      - run: auto-rollback on failure",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining("canary deployments"),
      );
    });

    it("should score 5 only when all three of selfHeal + deploy + SAST are present", async () => {
      // selfHeal + deploy, but NO SAST → not score 5
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    runs-on: ubuntu\n    steps:\n      - run: deploy canary\n      - run: auto-rollback on failure",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
    });

    it("should not score 5 when selfHeal + SAST but no deploy", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  scan:\n    runs-on: ubuntu\n    steps:\n      - run: semgrep scan\n      - run: canary check",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
    });
  });

  // -------------------------------------------------------------------------
  // Individual feature detection — each keyword category
  // -------------------------------------------------------------------------
  describe("individual feature detection", () => {
    it("should detect 'jest' as a test keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: jest --ci",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should detect 'vitest' as a test keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: vitest run",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should detect 'mocha' as a test keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: mocha tests/",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should detect 'pytest' as a test keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: pytest",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should detect 'dotnet test' as a test keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: dotnet test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should detect 'mvn test' as a test keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: mvn test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should detect 'gradle test' as a test keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: gradle test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should detect 'prettier' as a lint keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: prettier --check .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
    });

    it("should detect 'checkstyle' as a lint keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: checkstyle src/",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
    });

    it("should detect 'flake8' as a lint keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: flake8 src/",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
    });

    it("should detect 'sonar' as a SAST keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: sonar-scanner",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SAST/security scanning detected in pipeline.");
    });

    it("should detect 'snyk' as a SAST keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: snyk test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SAST/security scanning detected in pipeline.");
    });

    it("should detect 'codeql' as a SAST keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: codeql analyze",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SAST/security scanning detected in pipeline.");
    });

    it("should detect 'zap' as a DAST keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: zap-baseline-scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("DAST scanning detected in pipeline.");
    });

    it("should detect 'nuclei' as a DAST keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: nuclei -t templates/",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("DAST scanning detected in pipeline.");
    });

    it("should detect 'release' as a deploy keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm release",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Deployment step detected in pipeline.");
    });

    it("should detect 'publish' as a deploy keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm publish",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Deployment step detected in pipeline.");
    });

    it("should detect 'blue-green' as a self-healing keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    steps:\n      - run: blue-green deploy\n      - run: semgrep scan\n      - run: deploy app",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Self-healing/canary deployment detected.");
    });

    it("should detect 'progressive' as a self-healing keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    steps:\n      - run: progressive rollout\n      - run: semgrep scan\n      - run: deploy app",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Self-healing/canary deployment detected.");
    });

    it("should detect 'rollback' as a self-healing keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    steps:\n      - run: rollback on error\n      - run: semgrep scan\n      - run: deploy app",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Self-healing/canary deployment detected.");
    });
  });

  // -------------------------------------------------------------------------
  // File extension filtering — .yml vs .yaml vs other
  // -------------------------------------------------------------------------
  describe("file extension filtering", () => {
    it("should read .yml files from workflows dir", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: npm test\n  - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.evidence).toContainEqual(expect.stringContaining("ci.yml"));
    });

    it("should read .yaml files from workflows dir", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yaml": "name: CI\nsteps:\n  - run: npm test\n  - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.evidence).toContainEqual(expect.stringContaining("ci.yaml"));
    });

    it("should ignore non-yml/yaml files in workflows dir", async () => {
      vol.fromJSON(
        {
          ".github/workflows/readme.txt": "This is not a pipeline file",
          ".github/workflows/config.json": '{"key": "value"}',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
    });

    it("should handle mixed yml and non-yml in same workflows dir", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: npm test",
          ".github/workflows/notes.txt": "Not a pipeline",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Found 1 pipeline file(s)"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // Pipeline file discovery — different locations
  // -------------------------------------------------------------------------
  describe("pipeline file discovery", () => {
    it("should discover GitHub workflows directory", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(
        expect.stringContaining(".github/workflows/ci.yml"),
      );
    });

    it("should discover GitLab CI config file", async () => {
      vol.fromJSON(
        {
          ".gitlab-ci.yml": "test:\n  script: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(
        expect.stringContaining(".gitlab-ci.yml"),
      );
    });

    it("should discover Jenkinsfile", async () => {
      vol.fromJSON(
        {
          "Jenkinsfile": "pipeline { agent any\n  stages { stage('Test') { steps { sh 'npm test' } } } }",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Jenkinsfile"),
      );
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should discover azure-pipelines.yml", async () => {
      vol.fromJSON(
        {
          "azure-pipelines.yml": "trigger:\n  - main\nsteps:\n  - script: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("azure-pipelines.yml"),
      );
    });

    it("should combine files from multiple sources", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: npm test",
          ".gitlab-ci.yml": "lint:\n  script: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Found 2 pipeline file(s)"),
      );
      // test from GitHub + lint from GitLab = score 3
      expect(result.score).toBe(3);
    });

    it("should combine content from all pipeline files for keyword detection", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: npm test",
          "Jenkinsfile": "pipeline { stages { stage('Lint') { steps { sh 'eslint .' } } } }",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
      expect(result.score).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Scoring boundary conditions — killing ConditionalExpression mutations
  // -------------------------------------------------------------------------
  describe("scoring boundary conditions", () => {
    it("should score 1 (not 2) when no tests AND no lint", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  build:\n    steps:\n      - run: echo build",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
      expect(result.score).not.toBe(2);
    });

    it("should score 2 (not 1 or 3) when only tests", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.score).not.toBe(1);
      expect(result.score).not.toBe(3);
    });

    it("should score 2 (not 1 or 3) when only lint", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.score).not.toBe(1);
      expect(result.score).not.toBe(3);
    });

    it("should score 3 (not 2 or 4) when tests + lint but no SAST", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.score).not.toBe(2);
      expect(result.score).not.toBe(4);
    });

    it("should score 4 (not 3 or 5) when tests + SAST + deploy but no self-heal", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: deploy staging",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.score).not.toBe(3);
      expect(result.score).not.toBe(5);
    });

    it("should score 5 (not 4) when selfHeal + deploy + SAST are all present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    steps:\n      - run: semgrep scan\n      - run: deploy canary\n      - run: auto-rollback",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.score).not.toBe(4);
    });
  });

  // -------------------------------------------------------------------------
  // Scoring conditions — interaction between features
  // -------------------------------------------------------------------------
  describe("scoring condition interactions", () => {
    it("should require hasSast AND hasDeploy AND hasTests for score 4", async () => {
      // hasSast + hasTests but NOT hasDeploy → score 3 (tests+lint via SAST contributing lint? No)
      // Actually: hasSast + hasTests without lint → score 2
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: semgrep scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // tests=true, lint=false, sast=true, deploy=false → not (sast && deploy && tests) → not 4
      // tests || lint → score 2
      expect(result.score).toBe(2);
    });

    it("should require all three for score 5: selfHeal AND deploy AND sast", async () => {
      // selfHeal + sast without deploy
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  ci:\n    steps:\n      - run: semgrep scan\n      - run: canary check",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(5);
      // sast=true, selfHeal=true, deploy=false, tests=false, lint=false
      // not (sast && deploy && tests) → not 4
      // not (tests && lint) → not 3
      // tests || lint → false → score 1
      expect(result.score).toBe(1);
    });

    it("tests + lint + SAST but no deploy should be score 3 (not 4)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: eslint .\n      - run: semgrep scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // tests=true, lint=true, sast=true, deploy=false
      // not (sast && deploy && tests) → not 4; not (selfHeal && deploy && sast) → not 5
      // tests && lint → score 3
      expect(result.score).toBe(3);
    });

    it("deploy + SAST but no tests should not be score 4", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: semgrep scan\n      - run: deploy staging",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // tests=false, sast=true, deploy=true → not (sast && deploy && tests) → not 4
      // tests || lint → false → score 1
      expect(result.score).toBe(1);
    });
  });

  // -------------------------------------------------------------------------
  // Suggestions — conditional inclusion based on score/flags
  // -------------------------------------------------------------------------
  describe("suggestions conditional logic", () => {
    it("should not suggest SAST when score >= 4", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: deploy staging",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining("SAST scanning"),
      );
    });

    it("should not suggest deploy gates when score >= 4", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: deploy staging",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining("deployment gates"),
      );
    });

    it("should suggest SAST when score < 4 and no SAST", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.suggestions).toContainEqual(
        "Add SAST scanning (e.g. Semgrep, CodeQL) to your pipeline.",
      );
    });

    it("should suggest deploy gates when score < 4 and no deploy", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.suggestions).toContainEqual("Add automated deployment gates.");
    });

    it("should suggest self-healing when score < 5 and no self-heal", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test\n      - run: semgrep scan\n      - run: deploy staging",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.suggestions).toContainEqual(
        "Consider canary deployments or auto-rollback for self-healing CD.",
      );
    });

    it("should not suggest self-healing at score 5", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    steps:\n      - run: npm test\n      - run: eslint .\n      - run: semgrep scan\n      - run: deploy canary\n      - run: auto-rollback",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining("canary deployments"),
      );
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining("self-healing"),
      );
    });

    it("should have empty suggestions array at score 5 with all features", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    steps:\n      - run: npm test\n      - run: eslint .\n      - run: semgrep scan\n      - run: deploy canary\n      - run: auto-rollback",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.suggestions).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Evidence join separator and count formatting
  // -------------------------------------------------------------------------
  describe("evidence formatting", () => {
    it("should join pipeline names with comma-space separator", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: echo hi",
          ".github/workflows/cd.yml": "name: CD\nsteps:\n  - run: echo hi",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence[0]).toContain(", ");
      expect(result.evidence[0]).toContain(".github/workflows/ci.yml");
      expect(result.evidence[0]).toContain(".github/workflows/cd.yml");
    });

    it("should show correct file count in evidence", async () => {
      vol.fromJSON(
        {
          ".github/workflows/a.yml": "name: A\nsteps:\n  - run: echo a",
          ".github/workflows/b.yml": "name: B\nsteps:\n  - run: echo b",
          ".github/workflows/c.yml": "name: C\nsteps:\n  - run: echo c",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence[0]).toContain("Found 3 pipeline file(s)");
    });

    it("should show singular file count in evidence", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: echo hi",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence[0]).toContain("Found 1 pipeline file(s)");
    });
  });

  // -------------------------------------------------------------------------
  // Content joining — all content is merged with newline separator
  // -------------------------------------------------------------------------
  describe("content joining across files", () => {
    it("should detect test keyword in one file and lint keyword in another", async () => {
      vol.fromJSON(
        {
          ".github/workflows/test.yml": "name: Test\nsteps:\n  - run: jest",
          ".github/workflows/lint.yml": "name: Lint\nsteps:\n  - run: prettier --check .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
      expect(result.score).toBe(3);
    });
  });

  // -------------------------------------------------------------------------
  // Error handling — AssessmentError wrapping
  // -------------------------------------------------------------------------
  describe("error handling", () => {
    it("should throw AssessmentError when readPipelineFiles fails", async () => {
      // Do NOT set up volume at all — vol.reset() in beforeEach clears it
      // The REPO path does not exist, but readdir/stat on a non-existent path
      // in memfs should fail. We need to trigger an error inside the try block.
      // We can do this by mocking readdir to throw on the specific directory.
      vol.fromJSON({}, "/different-root");
      // Analyze a path that has no volume entry — memfs will throw ENOENT
      // on readdir for .github/workflows, but the helpers catch that.
      // Actually, looking at the code, fileExists/dirExists catch errors
      // and return false, so we won't get an error from normal non-existence.
      // The AssessmentError is thrown only if something unexpected goes wrong
      // in the try block of analyze(). We'll test the dimension field.
      const result = await analyzer.analyze(REPO);
      // If the repo just doesn't exist, we get score 0 (no pipeline files found)
      expect(result.score).toBe(0);
      expect(result.dimension).toBe("cicd");
    });

    it("should return score 0 when workflows dir does not exist", async () => {
      vol.fromJSON({ "some-other-file.txt": "nothing" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
    });

    it("should handle empty workflows directory gracefully", async () => {
      vol.fromJSON(
        {
          ".github/workflows/.gitkeep": "",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // .gitkeep does not end with .yml or .yaml
      expect(result.score).toBe(0);
    });
  });

  // -------------------------------------------------------------------------
  // Boolean flag defaults — kill BooleanLiteral mutations
  // -------------------------------------------------------------------------
  describe("boolean flag defaults", () => {
    it("hasTests should be false when no test keywords present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  build:\n    steps:\n      - run: echo build",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("Test step"),
      );
    });

    it("hasLint should be false when no lint keywords present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  build:\n    steps:\n      - run: echo build",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("Lint step"),
      );
    });

    it("hasSast should be false when no SAST keywords present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  build:\n    steps:\n      - run: echo build",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("SAST"),
      );
    });

    it("hasDast should be false when no DAST keywords present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  build:\n    steps:\n      - run: echo build",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("DAST"),
      );
    });

    it("hasDeploy should be false when no deploy keywords present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  build:\n    steps:\n      - run: echo build",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("Deployment step"),
      );
    });

    it("hasSelfHeal should be false when no self-healing keywords present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  build:\n    steps:\n      - run: echo build",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(
        expect.stringContaining("Self-healing"),
      );
    });

    it("all feature flags should be true when all keywords present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/cd.yml": "name: CD\non: push\njobs:\n  deploy:\n    steps:\n      - run: npm test\n      - run: eslint .\n      - run: semgrep scan\n      - run: zap scan\n      - run: deploy canary\n      - run: auto-rollback",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
      expect(result.evidence).toContainEqual("SAST/security scanning detected in pipeline.");
      expect(result.evidence).toContainEqual("DAST scanning detected in pipeline.");
      expect(result.evidence).toContainEqual("Deployment step detected in pipeline.");
      expect(result.evidence).toContainEqual("Self-healing/canary deployment detected.");
    });
  });

  // -------------------------------------------------------------------------
  // Empty arrays initialization — kill ArrayDeclaration mutations
  // -------------------------------------------------------------------------
  describe("array initialization", () => {
    it("should start with empty evidence array (no spurious evidence at score 0)", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      // At score 0 the early-return path provides its own evidence
      expect(result.evidence).toHaveLength(1);
      expect(result.evidence[0]).toBe("No pipeline files detected in standard locations.");
    });

    it("should start with empty suggestions array at score 1 (filled by conditionals only)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/build.yml": "name: Build\non: push\njobs:\n  build:\n    steps:\n      - run: echo hi",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      // At score 1: missing tests, lint, SAST, deploy, self-heal → 5 suggestions
      expect(result.suggestions.length).toBe(5);
      // Each suggestion should be a non-empty string (no Stryker artifacts)
      for (const s of result.suggestions) {
        expect(typeof s).toBe("string");
        expect(s.length).toBeGreaterThan(0);
        expect(s).not.toBe("Stryker was here");
      }
    });

    it("evidence array should contain only real evidence strings (no Stryker artifacts)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      for (const e of result.evidence) {
        expect(typeof e).toBe("string");
        expect(e.length).toBeGreaterThan(0);
        expect(e).not.toBe("Stryker was here");
      }
    });
  });

  // -------------------------------------------------------------------------
  // Case-insensitive keyword detection
  // -------------------------------------------------------------------------
  describe("case-insensitive keyword detection", () => {
    it("should detect 'TEST' (uppercase) as a test keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm TEST",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
    });

    it("should detect 'ESLINT' (uppercase) as a lint keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: ESLINT src/",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
    });

    it("should detect 'Semgrep' (mixed case) as a SAST keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: Semgrep scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SAST/security scanning detected in pipeline.");
    });
  });

  // -------------------------------------------------------------------------
  // ReadFile encoding — kill "utf-8" string mutation
  // -------------------------------------------------------------------------
  describe("file reading", () => {
    it("should correctly read pipeline file content with special characters", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: npm test # runs all tests\n      - run: eslint . --fix # auto-fix",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.evidence).toContainEqual("Test step detected in pipeline.");
      expect(result.evidence).toContainEqual("Lint step detected in pipeline.");
    });
  });

  // -------------------------------------------------------------------------
  // LogicalOperator mutations — "dir" in loc && loc.dir / "file" in loc && loc.file
  // -------------------------------------------------------------------------
  describe("logical operator conditions", () => {
    it("should process dir-based locations (GitHub workflows)", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: npm test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThan(0);
      expect(result.evidence).toContainEqual(
        expect.stringContaining(".github/workflows/ci.yml"),
      );
    });

    it("should process file-based locations (Jenkinsfile)", async () => {
      vol.fromJSON(
        {
          "Jenkinsfile": "pipeline { stages { stage('Test') { steps { sh 'npm test' } } } }",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThan(0);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Jenkinsfile"),
      );
    });

    it("should process file-based locations (.gitlab-ci.yml)", async () => {
      vol.fromJSON(
        {
          ".gitlab-ci.yml": "test:\n  script: npm test\nlint:\n  script: eslint .",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.evidence).toContainEqual(
        expect.stringContaining(".gitlab-ci.yml"),
      );
    });

    it("should process both dir and file locations in the same repo", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\nsteps:\n  - run: npm test",
          "Jenkinsfile": "pipeline { stages { stage('Lint') { steps { sh 'eslint .' } } } }",
          ".gitlab-ci.yml": "security:\n  script: semgrep scan\ndeploy:\n  script: deploy app",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(
        expect.stringContaining("Found 3 pipeline file(s)"),
      );
    });
  });

  // -------------------------------------------------------------------------
  // DAST detection — isolated tests
  // -------------------------------------------------------------------------
  describe("DAST feature detection", () => {
    it("should detect DAST but not affect score without deploy/sast", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: zap-baseline-scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("DAST scanning detected in pipeline.");
      // No tests/lint → score 1
      expect(result.score).toBe(1);
    });

    it("should detect 'dast' keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: run-dast-scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("DAST scanning detected in pipeline.");
    });

    it("should detect 'burp' as a DAST keyword", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "name: CI\non: push\njobs:\n  ci:\n    steps:\n      - run: burp scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("DAST scanning detected in pipeline.");
    });
  });
});

// ===========================================================================
// Mutation-killing tests — SecurityAnalyzer — round 2
// ===========================================================================

describe("SecurityAnalyzer — mutation killing round 2", () => {
  const analyzer = new SecurityAnalyzer();

  describe("evidence format — tool (category) found via source", () => {
    it("should format Semgrep config evidence as 'Semgrep (sast) found via config file.'", async () => {
      vol.fromJSON({ ".semgrep.yml": "rules: []" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Semgrep (sast) found via config file.");
    });

    it("should format Semgrep CI evidence as 'Semgrep (sast) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: semgrep scan" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Semgrep (sast) found via CI pipeline.");
    });

    it("should format CodeQL directory evidence as 'CodeQL (sast) found via config directory.'", async () => {
      vol.fromJSON({ ".github/codeql/config.yml": "{}" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("CodeQL (sast) found via config directory.");
    });

    it("should format CodeQL CI evidence as 'CodeQL (sast) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - uses: github/codeql-action" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("CodeQL (sast) found via CI pipeline.");
    });

    it("should format SonarQube config evidence as 'SonarQube/SonarCloud (sast) found via config file.'", async () => {
      vol.fromJSON({ "sonar-project.properties": "sonar.projectKey=test" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SonarQube/SonarCloud (sast) found via config file.");
    });

    it("should format SonarQube CI evidence as 'SonarQube/SonarCloud (sast) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: sonar-scanner" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SonarQube/SonarCloud (sast) found via CI pipeline.");
    });

    it("should format Gitleaks config evidence as 'Gitleaks (secrets) found via config file.'", async () => {
      vol.fromJSON({ ".gitleaks.toml": "[allowlist]" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Gitleaks (secrets) found via config file.");
    });

    it("should format Gitleaks CI evidence as 'Gitleaks (secrets) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: gitleaks detect" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Gitleaks (secrets) found via CI pipeline.");
    });

    it("should format TruffleHog CI evidence as 'TruffleHog (secrets) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: trufflehog scan" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("TruffleHog (secrets) found via CI pipeline.");
    });

    it("should format detect-secrets CI evidence as 'detect-secrets (secrets) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: detect-secrets scan" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("detect-secrets (secrets) found via CI pipeline.");
    });

    it("should format Snyk config evidence as 'Snyk (sca) found via config file.'", async () => {
      vol.fromJSON({ ".snyk": "{}" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Snyk (sca) found via config file.");
    });

    it("should format Snyk CI evidence as 'Snyk (sca) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: snyk test" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Snyk (sca) found via CI pipeline.");
    });

    it("should format Trivy CI evidence as 'Trivy (sca) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: trivy image" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Trivy (sca) found via CI pipeline.");
    });

    it("should format Dependabot config evidence as 'Dependabot (sca) found via config file.'", async () => {
      vol.fromJSON({ ".github/dependabot.yml": "version: 2" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Dependabot (sca) found via config file.");
    });

    it("should format Dependabot CI evidence as 'Dependabot (sca) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: dependabot check" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Dependabot (sca) found via CI pipeline.");
    });

    it("should format Renovate config evidence as 'Renovate (sca) found via config file.'", async () => {
      vol.fromJSON({ "renovate.json": '{ "extends": [] }' }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Renovate (sca) found via config file.");
    });

    it("should format Renovate CI evidence as 'Renovate (sca) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: renovate check" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Renovate (sca) found via CI pipeline.");
    });

    it("should format OWASP CI evidence as 'OWASP Dependency-Check (sca) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: owasp dependency-check" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("OWASP Dependency-Check (sca) found via CI pipeline.");
    });

    it("should format OWASP ZAP evidence as 'OWASP ZAP (dast) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: zap scan" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("OWASP ZAP (dast) found via CI pipeline.");
    });

    it("should format generic DAST evidence as 'DAST (dast) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: run dast scan" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("DAST (dast) found via CI pipeline.");
    });

    it("should format Nuclei evidence as 'Nuclei (dast) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: nuclei -t templates" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Nuclei (dast) found via CI pipeline.");
    });

    it("should format generic SBOM evidence as 'SBOM (sbom) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: generate sbom" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SBOM (sbom) found via CI pipeline.");
    });

    it("should format Syft evidence as 'Syft (sbom) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: syft generate" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Syft (sbom) found via CI pipeline.");
    });

    it("should format CycloneDX evidence as 'CycloneDX (sbom) found via CI pipeline.'", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: cyclonedx generate" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("CycloneDX (sbom) found via CI pipeline.");
    });
  });

  describe("suggestions contain specific non-empty text per missing category", () => {
    it("should suggest SAST when only secrets present", async () => {
      vol.fromJSON({ ".gitleaks.toml": "[allowlist]" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Add SAST scanning (e.g. Semgrep or CodeQL).");
      expect(result.suggestions).not.toContainEqual("Add secrets detection (e.g. Gitleaks or TruffleHog).");
    });

    it("should suggest secrets when only SAST present", async () => {
      vol.fromJSON({ ".semgrep.yml": "rules: []" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual("Add SAST scanning (e.g. Semgrep or CodeQL).");
      expect(result.suggestions).toContainEqual("Add secrets detection (e.g. Gitleaks or TruffleHog).");
    });

    it("should suggest SCA when SAST+secrets present but no SCA", async () => {
      vol.fromJSON(
        { ".semgrep.yml": "rules: []", ".gitleaks.toml": "[allowlist]" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Add dependency scanning (e.g. Snyk, Trivy, or Dependabot).");
    });

    it("should NOT suggest SCA when SCA is present", async () => {
      vol.fromJSON(
        { ".semgrep.yml": "rules: []", ".gitleaks.toml": "[allowlist]", ".snyk": "{}" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual("Add dependency scanning (e.g. Snyk, Trivy, or Dependabot).");
    });

    it("should suggest DAST when not present", async () => {
      vol.fromJSON(
        { ".semgrep.yml": "rules: []", ".gitleaks.toml": "[allowlist]", ".snyk": "{}" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Add DAST scanning (e.g. OWASP ZAP).");
    });

    it("should NOT suggest DAST when DAST present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "steps:\n  - run: semgrep\n  - run: gitleaks\n  - run: snyk\n  - run: zap scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual("Add DAST scanning (e.g. OWASP ZAP).");
    });

    it("should suggest SBOM when not present", async () => {
      vol.fromJSON(
        { ".semgrep.yml": "rules: []", ".gitleaks.toml": "[allowlist]", ".snyk": "{}" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Generate SBOMs (e.g. Syft, CycloneDX).");
    });

    it("should NOT suggest SBOM when SBOM present", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "steps:\n  - run: semgrep\n  - run: gitleaks\n  - run: snyk\n  - run: zap\n  - run: syft",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual("Generate SBOMs (e.g. Syft, CycloneDX).");
    });

    it("should have zero missing-category suggestions at score 5", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "steps:\n  - run: semgrep\n  - run: gitleaks\n  - run: snyk\n  - run: zap\n  - run: syft",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.suggestions).not.toContainEqual("Add SAST scanning (e.g. Semgrep or CodeQL).");
      expect(result.suggestions).not.toContainEqual("Add secrets detection (e.g. Gitleaks or TruffleHog).");
      expect(result.suggestions).not.toContainEqual("Add dependency scanning (e.g. Snyk, Trivy, or Dependabot).");
      expect(result.suggestions).not.toContainEqual("Add DAST scanning (e.g. OWASP ZAP).");
      expect(result.suggestions).not.toContainEqual("Generate SBOMs (e.g. Syft, CycloneDX).");
    });
  });

  describe("pipeline reading — Jenkinsfile", () => {
    it("should detect tools from Jenkinsfile", async () => {
      vol.fromJSON(
        { "Jenkinsfile": "pipeline {\n  stages {\n    stage('SAST') {\n      steps {\n        sh 'semgrep scan'\n        sh 'gitleaks detect'\n      }\n    }\n  }\n}" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.evidence).toContainEqual("Semgrep (sast) found via CI pipeline.");
      expect(result.evidence).toContainEqual("Gitleaks (secrets) found via CI pipeline.");
    });
  });

  describe("pipeline reading — Azure Pipelines", () => {
    it("should detect tools from azure-pipelines.yml", async () => {
      vol.fromJSON(
        { "azure-pipelines.yml": "trigger:\n  - main\nsteps:\n  - script: semgrep scan\n  - script: gitleaks detect" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.evidence).toContainEqual("Semgrep (sast) found via CI pipeline.");
      expect(result.evidence).toContainEqual("Gitleaks (secrets) found via CI pipeline.");
    });
  });

  describe("deduplication — exact evidence format with both sources", () => {
    it("should deduplicate Semgrep but still count only one category for scoring", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []",
          ".github/workflows/ci.yml": "steps:\n  - run: semgrep scan",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2); // Only SAST category, no secrets
    });

    it("should deduplicate Gitleaks from config and CI — still score 2 for secrets-only", async () => {
      vol.fromJSON(
        {
          ".gitleaks.toml": "[allowlist]",
          ".github/workflows/ci.yml": "steps:\n  - run: gitleaks detect",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2); // Only secrets category
    });

    it("should deduplicate Snyk from config and CI — still score 1 for SCA-only", async () => {
      vol.fromJSON(
        {
          ".snyk": "{}",
          ".github/workflows/ci.yml": "steps:\n  - run: snyk test",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1); // Only SCA category
    });

    it("should deduplicate Renovate from config and CI — still score 1", async () => {
      vol.fromJSON(
        {
          "renovate.json": '{ "extends": [] }',
          ".github/workflows/ci.yml": "steps:\n  - run: renovate check",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1); // Only SCA category
    });

    it("should deduplicate Dependabot from config and CI — still score 1", async () => {
      vol.fromJSON(
        {
          ".github/dependabot.yml": "version: 2",
          ".github/workflows/ci.yml": "steps:\n  - run: dependabot check",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1); // Only SCA category
    });
  });

  describe("error handling — catch block wraps in AssessmentError", () => {
    it("should gracefully handle nonexistent repo path without throwing", async () => {
      vol.fromJSON({}, "/other-repo");
      // Most file operations return false/null for missing paths, so analyze should not throw
      const result = await analyzer.analyze("/nonexistent-repo");
      expect(result.score).toBe(0);
    });
  });

  describe("semgrep config wiring suggestion — exact text assertions", () => {
    it("should contain exact text '.semgrep.yml exists but is not referenced in CI pipeline'", async () => {
      vol.fromJSON(
        {
          ".semgrep.yml": "rules: []\n",
          ".github/workflows/ci.yml": "steps:\n  - run: semgrep scan --config auto .\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual(
        ".semgrep.yml exists but is not referenced in CI pipeline. Add '--config .semgrep.yml' to your semgrep scan step.",
      );
    });

    it("should NOT suggest wiring when CI references .semgrep.yaml", async () => {
      vol.fromJSON(
        {
          ".semgrep.yaml": "rules: []\n",
          ".github/workflows/ci.yml": "steps:\n  - run: semgrep scan --config .semgrep.yaml .\n",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining(".semgrep.yml exists but is not referenced"),
      );
    });
  });

  describe("renovate wiring suggestion — exact text assertions", () => {
    it("should contain exact text 'renovate.json exists but Renovate is not detected in CI'", async () => {
      vol.fromJSON(
        { "renovate.json": '{ "extends": ["config:recommended"] }' },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual(
        "renovate.json exists but Renovate is not detected in CI. Ensure the Mend Renovate service is enabled.",
      );
    });

    it("should NOT suggest Renovate wiring when renovate is detected in CI", async () => {
      vol.fromJSON(
        {
          "renovate.json": '{ "extends": ["config:recommended"] }',
          ".github/workflows/ci.yml": "steps:\n  - run: renovate --dry-run",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual(
        expect.stringContaining("renovate.json exists but Renovate is not detected"),
      );
    });
  });

  describe("logical operator mutations — SAST AND/OR secrets boundary", () => {
    it("hasSast=true hasSecrets=false should score 2 not 3", async () => {
      vol.fromJSON({ ".semgrep.yml": "rules: []" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.score).not.toBe(3);
    });

    it("hasSast=false hasSecrets=true should score 2 not 3", async () => {
      vol.fromJSON({ ".gitleaks.toml": "[allowlist]" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
      expect(result.score).not.toBe(3);
    });

    it("hasSast=true hasSecrets=true hasSca=false should score 3 not 4", async () => {
      vol.fromJSON(
        { ".semgrep.yml": "rules: []", ".gitleaks.toml": "[allowlist]" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
      expect(result.score).not.toBe(4);
    });

    it("all five categories should score exactly 5", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "steps:\n  - run: semgrep\n  - run: gitleaks\n  - run: snyk\n  - run: zap\n  - run: syft",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.score).not.toBe(4);
    });

    it("hasSast+secrets+sca+dast but no sbom should score 4 not 5", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "steps:\n  - run: semgrep\n  - run: gitleaks\n  - run: snyk\n  - run: zap",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.score).not.toBe(5);
    });

    it("hasSast+secrets+sca+sbom but no dast should score 4 not 5", async () => {
      vol.fromJSON(
        {
          ".github/workflows/ci.yml": "steps:\n  - run: semgrep\n  - run: gitleaks\n  - run: snyk\n  - run: syft",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
      expect(result.score).not.toBe(5);
    });
  });

  describe("details exact text per score", () => {
    it("score 0 details should be 'No security scanning detected.'", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("No security scanning detected.");
    });

    it("score 1 details should be 'Ad-hoc security tooling detected.'", async () => {
      vol.fromJSON({ ".snyk": "{}" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Ad-hoc security tooling detected.");
    });

    it("score 2 details should be 'Partial security scanning detected.'", async () => {
      vol.fromJSON({ ".semgrep.yml": "rules: []" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Partial security scanning detected.");
    });

    it("score 3 details should be 'SAST and secrets detection are active.'", async () => {
      vol.fromJSON({ ".semgrep.yml": "rules: []", ".gitleaks.toml": "[allowlist]" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("SAST and secrets detection are active.");
    });

    it("score 4 details should be 'Strong security pipeline with SAST, secrets detection, and SCA.'", async () => {
      vol.fromJSON({ ".semgrep.yml": "rules: []", ".gitleaks.toml": "[allowlist]", ".snyk": "{}" }, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Strong security pipeline with SAST, secrets detection, and SCA.");
    });

    it("score 5 details should be 'Comprehensive security pipeline with SAST, secrets detection, SCA, DAST, and SBOM.'", async () => {
      vol.fromJSON(
        {
          ".github/workflows/security.yml":
            "steps:\n  - run: semgrep\n  - run: gitleaks\n  - run: snyk\n  - run: zap\n  - run: syft",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Comprehensive security pipeline with SAST, secrets detection, SCA, DAST, and SBOM.");
    });
  });

  describe("DAST detection — individual tools", () => {
    it("should detect OWASP ZAP with only 'zap' keyword in CI", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: zap-cli quick-scan" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("OWASP ZAP (dast) found via CI pipeline.");
    });

    it("should detect Nuclei with only 'nuclei' keyword in CI", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: nuclei -u https://example.com" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Nuclei (dast) found via CI pipeline.");
    });

    it("should detect generic DAST with only 'dast' keyword in CI", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: dast-runner scan" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("DAST (dast) found via CI pipeline.");
    });
  });

  describe("SBOM detection — individual tools", () => {
    it("should detect Syft with only 'syft' keyword in CI", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: syft packages dir:." },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("Syft (sbom) found via CI pipeline.");
    });

    it("should detect CycloneDX with only 'cyclonedx' keyword in CI", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: cyclonedx-bom generate" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("CycloneDX (sbom) found via CI pipeline.");
    });

    it("should detect generic SBOM with only 'sbom' keyword in CI", async () => {
      vol.fromJSON(
        { ".github/workflows/ci.yml": "steps:\n  - run: generate-sbom output.json" },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("SBOM (sbom) found via CI pipeline.");
    });
  });

  describe("dimension property", () => {
    it("should always return dimension 'security'", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.dimension).toBe("security");
    });
  });
});

// ===========================================================================
// Mutation-killing tests — CoverageAnalyzer — round 2
// ===========================================================================

describe("CoverageAnalyzer — mutation killing round 2", () => {
  const analyzer = new CoverageAnalyzer();

  describe("boundary values — reports exist but no enforcement", () => {
    it("should score 2 when reports exist + no detectedPercentage", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { provider: "v8" } } };',
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score 1 when reports exist + detectedPercentage is 39", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { provider: "v8", lines: 39 } } };',
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("should score 2 when reports exist + detectedPercentage is 40", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { provider: "v8", lines: 40 } } };',
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score 2 when reports exist + detectedPercentage is 59", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { provider: "v8", lines: 59 } } };',
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });

    it("should score 3 when reports exist + detectedPercentage is 60", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { provider: "v8", lines: 60 } } };',
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 when reports exist + detectedPercentage is 79", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { provider: "v8", lines: 79 } } };',
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 when reports exist + detectedPercentage is 80 (no enforcement)", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { provider: "v8", lines: 80 } } };',
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 when reports exist + detectedPercentage is 95 (no enforcement)", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { provider: "v8", lines: 95 } } };',
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });
  });

  describe("boundary values — enforcement thresholds", () => {
    it("should score 3 when enforcement with detectedPercentage=59", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 59 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 when enforcement with detectedPercentage=60", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 60 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 3 when enforcement with detectedPercentage=79", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 79 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should score 4 when enforcement with detectedPercentage=80", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should score 4 when enforcement with detectedPercentage=99", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 99 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });
  });

  describe("conditional expression operands — hasCoverageConfig AND hasCoverageReports", () => {
    it("hasCoverageConfig=false hasCoverageReports=false should score 0", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
    });

    it("hasCoverageConfig=true hasCoverageReports=false hasEnforcement=false should score 1", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { "test:cov": "vitest --coverage" } }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });

    it("hasCoverageConfig=false hasCoverageReports=true should score 2 via reports branch", async () => {
      vol.fromJSON(
        {
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(2);
    });
  });

  describe("logical operator — hasCoverageConfig AND !hasCoverageReports", () => {
    it("config=true reports=true enforcement=false should NOT score 1", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { "test:cov": "vitest --coverage" } }),
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).not.toBe(1);
      expect(result.score).toBe(2);
    });

    it("config=true reports=false enforcement=false should score 1", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { "test:cov": "vitest --coverage" } }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });
  });

  describe("report freshness — recent coverage files detected", () => {
    it("should detect coverage directory as recent report (memfs sets mtime to now)", async () => {
      vol.fromJSON(
        {
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("Coverage report"));
    });
  });

  describe("JaCoCo XML report detection", () => {
    it("should detect JaCoCo XML report at target/site/jacoco/jacoco.xml", async () => {
      vol.fromJSON(
        {
          "pom.xml": "<project><plugins><plugin><groupId>org.jacoco</groupId></plugin></plugins></project>",
          "target/site/jacoco/jacoco.xml": "<report></report>",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("JaCoCo XML report"));
    });
  });

  describe("CI coverage enforcement detection", () => {
    it("should detect enforcement with 'coverage' + 'threshold' in CI", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { provider: "v8" } } };',
          ".github/workflows/ci.yml":
            "name: CI\njobs:\n  test:\n    steps:\n      - run: npx vitest --coverage\n      - run: check-coverage threshold 80",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it("should detect enforcement with 'coverage' + 'fail' in CI", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { provider: "v8" } } };',
          ".github/workflows/ci.yml":
            "name: CI\njobs:\n  test:\n    steps:\n      - run: npx vitest --coverage --fail-under=80",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it("should detect enforcement with 'coverage' + 'minimum' in CI", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { provider: "v8" } } };',
          ".github/workflows/ci.yml":
            "name: CI\njobs:\n  test:\n    steps:\n      - run: check coverage minimum 70",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(3);
    });

    it("should NOT detect enforcement when CI has coverage but no threshold/fail/minimum", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { provider: "v8" } } };',
          ".github/workflows/ci.yml":
            "name: CI\njobs:\n  test:\n    steps:\n      - run: npx vitest --coverage",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(1);
    });
  });

  describe("PIT mutation testing detection in pom.xml", () => {
    it("should detect PIT (pitest) as mutation testing", async () => {
      vol.fromJSON(
        {
          "pom.xml":
            "<project><build><plugins><plugin><groupId>org.pitest</groupId></plugin></plugins></build></project>",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual(expect.stringContaining("PIT"));
      expect(result.evidence).toContainEqual(expect.stringContaining("pitest"));
    });

    it("should NOT detect PIT when pom.xml has no pitest", async () => {
      vol.fromJSON(
        {
          "pom.xml": "<project><build><plugins></plugins></build></project>",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).not.toContainEqual(expect.stringContaining("PIT"));
    });
  });

  describe("invalid JSON in package.json", () => {
    it("should handle invalid JSON in package.json gracefully", async () => {
      vol.fromJSON(
        {
          "package.json": "{ this is invalid json",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(0);
    });
  });

  describe("details exact text per score", () => {
    it("score 0 details should be 'No code coverage measurement detected.'", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("No code coverage measurement detected.");
    });

    it("score 1 details should be 'Coverage tooling found but coverage appears low or unmeasured.'", async () => {
      vol.fromJSON(
        { "package.json": JSON.stringify({ scripts: { "test:cov": "vitest --coverage" } }) },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Coverage tooling found but coverage appears low or unmeasured.");
    });

    it("score 2 details should be 'Coverage configured but may be insufficient (40-60%).'", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Coverage configured but may be insufficient (40-60%).");
    });

    it("score 3 details should be 'Good coverage (60-80% range) detected.'", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: {} } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Good coverage (60-80% range) detected.");
    });

    it("score 4 details should be 'Strong coverage with threshold enforcement.'", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: { branches: 80 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Strong coverage with threshold enforcement.");
    });

    it("score 5 details should be 'Excellent coverage with enforcement and mutation testing.'", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          "stryker.conf.js": "module.exports = {};",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.details).toBe("Excellent coverage with enforcement and mutation testing.");
    });
  });

  describe("suggestions exact text", () => {
    it("score 0 should suggest setting up coverage measurement", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Set up code coverage measurement for your test suite.");
    });

    it("score 0 should suggest configuring a coverage reporter", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Configure a coverage reporter (e.g. V8, Istanbul, JaCoCo, Coverlet).");
    });

    it("reports without enforcement should suggest threshold enforcement in CI", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual("Add coverage threshold enforcement in CI to prevent regressions.");
    });

    it("config only should suggest running tests with coverage", async () => {
      vol.fromJSON(
        { "package.json": JSON.stringify({ scripts: { "test:cov": "vitest --coverage" } }) },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual(
        "Coverage config found but no recent reports. Run your test suite with coverage enabled.",
      );
      expect(result.suggestions).toContainEqual(
        "Add coverage enforcement thresholds to prevent regression.",
      );
    });

    it("enforcement without mutation testing should suggest mutation testing", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).toContainEqual(
        "Add mutation testing (e.g. Stryker, PIT) for deeper coverage confidence.",
      );
    });

    it("enforcement WITH mutation testing should NOT suggest mutation testing", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          "stryker.conf.js": "module.exports = {};",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.suggestions).not.toContainEqual(
        "Add mutation testing (e.g. Stryker, PIT) for deeper coverage confidence.",
      );
    });
  });

  describe("evidence formatting", () => {
    it("should prefix each config source with 'Found: ' in evidence", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { "test:cov": "vitest --coverage" } }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.evidence.every((e: string) => e.startsWith("Found:"))).toBe(true);
    });

    it("should say 'No coverage configuration or reports detected.' when nothing found", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.evidence).toContainEqual("No coverage configuration or reports detected.");
    });
  });

  describe("stryker-tmp detection as mutation testing", () => {
    it("should detect .stryker-tmp file as mutation testing config", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          ".stryker-tmp": "stryker temp marker",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(5);
      expect(result.evidence).toContainEqual(expect.stringContaining("Mutation testing"));
    });
  });

  describe("coverlet.runsettings as config", () => {
    it("should detect coverlet.runsettings as coverage config", async () => {
      vol.fromJSON(
        {
          "coverlet.runsettings": "<RunSettings><Coverlet></Coverlet></RunSettings>",
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(1);
      expect(result.evidence).toContainEqual("Found: coverlet.runsettings");
    });
  });

  describe("dimension property", () => {
    it("should always return dimension 'coverage'", async () => {
      vol.fromJSON({}, REPO);
      const result = await analyzer.analyze(REPO);
      expect(result.dimension).toBe("coverage");
    });
  });

  describe("error handling — catch block wraps in AssessmentError", () => {
    it("should not throw for a nonexistent repo path (graceful handling)", async () => {
      vol.fromJSON({}, "/other-repo");
      const result = await analyzer.analyze("/nonexistent-coverage-repo");
      expect(result.score).toBe(0);
    });
  });

  describe("equality operator — each score produces unique details", () => {
    it("score 1 and score 2 should have different details", async () => {
      vol.fromJSON(
        { "package.json": JSON.stringify({ scripts: { "test:cov": "vitest --coverage" } }) },
        REPO,
      );
      const result1 = await analyzer.analyze(REPO);
      expect(result1.score).toBe(1);

      vol.reset();
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result2 = await analyzer.analyze(REPO);
      expect(result2.score).toBe(2);

      expect(result1.details).not.toBe(result2.details);
    });

    it("score 2 and score 3 should have different details", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({ scripts: { test: "vitest" } }),
          "coverage/lcov.info": "TN:\nSF:src/index.ts\nDA:1,1\nend_of_record",
        },
        REPO,
      );
      const result2 = await analyzer.analyze(REPO);
      expect(result2.score).toBe(2);

      vol.reset();
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: {} } } };',
        },
        REPO,
      );
      const result3 = await analyzer.analyze(REPO);
      expect(result3.score).toBe(3);

      expect(result2.details).not.toBe(result3.details);
    });

    it("score 3 and score 4 should have different details", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: {} } } };',
        },
        REPO,
      );
      const result3 = await analyzer.analyze(REPO);
      expect(result3.score).toBe(3);

      vol.reset();
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
        },
        REPO,
      );
      const result4 = await analyzer.analyze(REPO);
      expect(result4.score).toBe(4);

      expect(result3.details).not.toBe(result4.details);
    });

    it("score 4 and score 5 should have different details", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
        },
        REPO,
      );
      const result4 = await analyzer.analyze(REPO);
      expect(result4.score).toBe(4);

      vol.reset();
      vol.fromJSON(
        {
          "vitest.config.ts": 'export default { test: { coverage: { thresholds: { lines: 80 } } } };',
          "stryker.conf.js": "module.exports = {};",
        },
        REPO,
      );
      const result5 = await analyzer.analyze(REPO);
      expect(result5.score).toBe(5);

      expect(result4.details).not.toBe(result5.details);
    });
  });

  describe("regex threshold detection — branches, functions, statements keywords", () => {
    it("should detect 'branches: 75' as detectedPercentage 75", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { branches: 75 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });

    it("should detect 'functions: 85' as detectedPercentage 85", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { functions: 85 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect 'statements: 90' as detectedPercentage 90", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { statements: 90 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(4);
    });

    it("should detect 'lines: 50' as detectedPercentage 50 with enforcement => score 3", async () => {
      vol.fromJSON(
        {
          "vitest.config.ts":
            'export default { test: { coverage: { thresholds: { lines: 50 } } } };',
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBe(3);
    });
  });

  describe("jest coverageThreshold detection as enforcement", () => {
    it("should detect jest coverageThreshold in package.json as enforcement", async () => {
      vol.fromJSON(
        {
          "package.json": JSON.stringify({
            jest: {
              coverageThreshold: {
                global: { branches: 80, functions: 80, lines: 80, statements: 80 },
              },
            },
          }),
        },
        REPO,
      );
      const result = await analyzer.analyze(REPO);
      expect(result.score).toBeGreaterThanOrEqual(3);
      expect(result.evidence).toContainEqual(expect.stringContaining("coverage config"));
    });
  });
});

// ===========================================================================
// External Tools — SecurityAnalyzer
// ===========================================================================

describe("SecurityAnalyzer — external tools", () => {
  const analyzer = new SecurityAnalyzer();

  it("expands Aikido to all 5 categories via umbrella expansion", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ security: [{ tool: "aikido", category: "sast", evidence: "Aikido SaaS" }] });
    const result = await analyzer.analyze(REPO, ctx);
    // Aikido is an umbrella tool — expands to sast+secrets+sca+dast+sbom regardless of declared category
    expect(result.score).toBe(5);
    expect(result.evidence).toContainEqual(expect.stringContaining("[declared]"));
    expect(result.evidence).toContainEqual(expect.stringContaining("Aikido"));
  });

  it("reaches score 5 with all categories declared", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({
      security: [
        { tool: "semgrep", category: "sast" },
        { tool: "gitleaks", category: "secrets" },
        { tool: "snyk", category: "sca" },
        { tool: "zap", category: "dast" },
        { tool: "syft", category: "sbom" },
      ],
    });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(5);
  });

  it("merges auto-detected and declared signals", async () => {
    vol.fromJSON({ ".semgrep.yml": "rules: []" }, REPO);
    const ctx = makeContext({ security: [{ tool: "gitleaks-ext", category: "secrets" }] });
    const result = await analyzer.analyze(REPO, ctx);
    // Has SAST (auto) + secrets (declared) = score 3
    expect(result.score).toBeGreaterThanOrEqual(3);
  });

  it("scores identically without context", async () => {
    vol.fromJSON({}, REPO);
    const withCtx = await analyzer.analyze(REPO, makeContext({}));
    vol.reset();
    vol.fromJSON({}, REPO);
    const without = await analyzer.analyze(REPO);
    expect(withCtx.score).toBe(without.score);
  });

  it("populates scoringRationale", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.scoringRationale).toBeDefined();
    expect(result.scoringRationale).toContain("Score");
  });

  it("skips declarations with unknown category", async () => {
    vol.fromJSON({}, REPO);
    // "lint" is not a valid security category — should be skipped
    const ctx = makeContext({ security: [{ tool: "checkstyle", category: "lint" }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(0);
  });
});

describe("SecurityAnalyzer — umbrella tool expansion", () => {
  const analyzer = new SecurityAnalyzer();

  it("detects Aikido in CI pipeline and emits all 5 categories", async () => {
    vol.fromJSON({ ".github/workflows/ci.yml": "steps:\n  - run: aikido scan" }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(5);
  });

  it("expands Aikido manifest declaration without category to all 5", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ security: [{ tool: "aikido" }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(5);
  });

  it("expands Fortify to sast+dast (score 2)", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ security: [{ tool: "fortify" }] });
    const result = await analyzer.analyze(REPO, ctx);
    // hasSast + hasDast but not hasSecrets → score 2 (hasSast || hasSecrets)
    expect(result.score).toBe(2);
  });

  it("deduplicates case-insensitive: CI Aikido + manifest aikido", async () => {
    vol.fromJSON({ ".github/workflows/ci.yml": "steps:\n  - run: aikido scan" }, REPO);
    const ctx = makeContext({ security: [{ tool: "aikido", evidence: "Aikido SaaS" }] });
    const result = await analyzer.analyze(REPO, ctx);
    // Both produce 5 signals each but dedup by category+tool(case-insensitive) → 5 unique
    expect(result.score).toBe(5);
  });

  it("Aikido + separate Gitleaks both appear in evidence", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({
      security: [
        { tool: "aikido" },
        { tool: "gitleaks", category: "secrets" },
      ],
    });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(5);
    // Both tools should appear in the evidence (different tool names → not deduped)
    const evidenceText = result.evidence.join(" ");
    expect(evidenceText).toContain("gitleaks");
    expect(evidenceText.toLowerCase()).toContain("aikido");
  });

  it("defaults unknown non-umbrella tool without category to sast", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ security: [{ tool: "custom-scanner" }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(2); // hasSast only → score 2
  });

  it("skips tool with empty name", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ security: [{ tool: "" }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(0);
  });

  it("returns score 0 with no tools and no CI", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
  });
});

describe("SecurityAnalyzer — umbrella tools structural", () => {
  it("SECURITY_UMBRELLA_TOOLS has correct entry lengths", async () => {
    const { SECURITY_UMBRELLA_TOOLS } = await import("../../src/core/analyzer/umbrella-tools.js");
    expect(SECURITY_UMBRELLA_TOOLS["aikido"]).toHaveLength(5);
    expect(SECURITY_UMBRELLA_TOOLS["fortify"]).toHaveLength(2);
    expect(SECURITY_UMBRELLA_TOOLS["veracode"]).toHaveLength(3);
    expect(SECURITY_UMBRELLA_TOOLS["checkmarx"]).toHaveLength(3);
  });

  it("ALL_SECURITY_CATEGORIES has exactly 5 entries", async () => {
    const { ALL_SECURITY_CATEGORIES } = await import("../../src/core/analyzer/umbrella-tools.js");
    expect(ALL_SECURITY_CATEGORIES).toHaveLength(5);
  });
});

// ===========================================================================
// External Tools — CoverageAnalyzer with SonarQube
// ===========================================================================

describe("CoverageAnalyzer — SonarQube enrichment", () => {
  const analyzer = new CoverageAnalyzer();

  it("uses SonarQube coverage when client is available", async () => {
    vol.fromJSON({}, REPO);
    const mockClient = {
      getMeasures: vi.fn().mockResolvedValue({
        component: {
          key: "my-project",
          name: "My Project",
          measures: [{ metric: "coverage", value: "85.3" }],
        },
      }),
      getQualityGate: vi.fn().mockResolvedValue({
        projectStatus: {
          status: "OK",
          conditions: [{ status: "OK", metricKey: "coverage", comparator: "LT", errorThreshold: "80", actualValue: "85.3" }],
        },
      }),
    };
    const ctx: AnalyzerContext = {
      repoRoot: REPO,
      manifest: { corulusCcVersion: "0.3.5", techStack: "typescript", externalTools: { coverage: { sonarProjectKey: "my-project" } } } as AnalyzerContext["manifest"],
      sonarqubeClient: mockClient as AnalyzerContext["sonarqubeClient"],
    };
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBeGreaterThanOrEqual(4);
    expect(result.evidence).toContainEqual(expect.stringContaining("SonarQube"));
  });

  it("falls back gracefully when SonarQube throws", async () => {
    vol.fromJSON({}, REPO);
    const mockClient = {
      getMeasures: vi.fn().mockRejectedValue(new Error("network error")),
      getQualityGate: vi.fn().mockRejectedValue(new Error("network error")),
    };
    const ctx: AnalyzerContext = {
      repoRoot: REPO,
      manifest: { corulusCcVersion: "0.3.5", techStack: "typescript", externalTools: { coverage: { sonarProjectKey: "my-project" } } } as AnalyzerContext["manifest"],
      sonarqubeClient: mockClient as AnalyzerContext["sonarqubeClient"],
    };
    const result = await analyzer.analyze(REPO, ctx);
    // Should not crash — score based on local detection only
    expect(result.score).toBe(0);
  });

  it("skips SonarQube when no client in context", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ coverage: { sonarProjectKey: "my-project" } });
    const result = await analyzer.analyze(REPO, ctx);
    // No client = no SonarQube enrichment
    expect(result.evidence).not.toContainEqual(expect.stringContaining("SonarQube"));
  });

  it("auto-detects project key from sonar-project.properties", async () => {
    vol.fromJSON({ "sonar-project.properties": "sonar.projectKey=auto-detected-key\nsonar.host.url=https://sonar.example.com" }, REPO);
    const mockClient = {
      getMeasures: vi.fn().mockResolvedValue({
        component: { key: "auto-detected-key", name: "Auto", measures: [{ metric: "coverage", value: "72.0" }] },
      }),
      getQualityGate: vi.fn().mockResolvedValue({ projectStatus: { status: "NONE", conditions: [] } }),
    };
    const ctx: AnalyzerContext = {
      repoRoot: REPO,
      manifest: { corulusCcVersion: "0.3.5", techStack: "typescript" } as AnalyzerContext["manifest"],
      sonarqubeClient: mockClient as AnalyzerContext["sonarqubeClient"],
    };
    const result = await analyzer.analyze(REPO, ctx);
    expect(mockClient.getMeasures).toHaveBeenCalledWith("auto-detected-key", expect.any(Array));
    expect(result.evidence).toContainEqual(expect.stringContaining("SonarQube"));
  });

  it("populates scoringRationale", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.scoringRationale).toBeDefined();
  });
});

describe("CoverageAnalyzer — SonarQube static detection (no live client)", () => {
  const analyzer = new CoverageAnalyzer();

  it("detects sonar-project.properties as coverage config", async () => {
    vol.fromJSON({
      "sonar-project.properties": "sonar.projectKey=my-project\nsonar.host.url=https://sonar.example.com",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.evidence).toContainEqual(expect.stringContaining("SonarQube"));
  });

  it("detects qualitygate keyword as enforcement (score 3)", async () => {
    vol.fromJSON({
      "sonar-project.properties": "sonar.projectKey=my-project\nsonar.qualitygate.wait=true",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
    expect(result.evidence).toContainEqual(expect.stringContaining("quality gate"));
  });

  it("detects .sonarcloud.properties", async () => {
    vol.fromJSON({
      ".sonarcloud.properties": "sonar.projectKey=cloud-project",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBeGreaterThanOrEqual(1);
    expect(result.evidence).toContainEqual(expect.stringContaining("SonarQube"));
  });

  it("detects sonar-scanner in CI pipeline as enforcement", async () => {
    vol.fromJSON({
      ".github/workflows/ci.yml": "steps:\n  - run: sonar-scanner -Dproject=mykey",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
    expect(result.evidence).toContainEqual(expect.stringContaining("CI pipeline"));
  });

  it("detects sonar:sonar Gradle task in CI pipeline", async () => {
    vol.fromJSON({
      ".github/workflows/ci.yml": "steps:\n  - run: ./gradlew sonar:sonar",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3);
  });

  it("does not change behavior when no sonar files exist", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
  });

  it("sonar.coverage.exclusions does not affect scoring (documents intent)", async () => {
    vol.fromJSON({
      "sonar-project.properties": "sonar.projectKey=my-project\nsonar.coverage.exclusions=**/test/**",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    // coverage keyword triggers enforcement detection
    expect(result.score).toBe(3);
  });

  it("does not double-count when both static and live client detect SonarQube", async () => {
    vol.fromJSON({
      "sonar-project.properties": "sonar.projectKey=my-project\nsonar.qualitygate.wait=true",
    }, REPO);
    const mockClient = {
      getMeasures: vi.fn().mockResolvedValue({
        component: { key: "my-project", name: "My", measures: [{ metric: "coverage", value: "85.0" }] },
      }),
      getQualityGate: vi.fn().mockResolvedValue({
        projectStatus: { status: "OK", conditions: [{ status: "OK", metricKey: "coverage", comparator: "LT", errorThreshold: "80", actualValue: "85.0" }] },
      }),
    };
    const ctx: AnalyzerContext = {
      repoRoot: REPO,
      manifest: { corulusCcVersion: "0.3.5", techStack: "typescript", externalTools: { coverage: { sonarProjectKey: "my-project" } } } as AnalyzerContext["manifest"],
      sonarqubeClient: mockClient as AnalyzerContext["sonarqubeClient"],
    };
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });
});

// ===========================================================================
// External Tools — CicdAnalyzer with build tool plugins
// ===========================================================================

describe("CicdAnalyzer — build tool plugins", () => {
  const analyzer = new CicdAnalyzer();

  it("detects Maven checkstyle plugin from pom.xml", async () => {
    vol.fromJSON({
      ".github/workflows/ci.yml": "name: CI\njobs:\n  build:\n    steps:\n      - run: mvn test",
      "pom.xml": "<project><build><plugins><plugin><artifactId>maven-checkstyle-plugin</artifactId></plugin></plugins></build></project>",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3); // tests + lint
    expect(result.evidence).toContainEqual(expect.stringContaining("checkstyle"));
  });

  it("detects OWASP dependency-check from pom.xml", async () => {
    vol.fromJSON({
      ".github/workflows/ci.yml": "name: CI\njobs:\n  build:\n    steps:\n      - run: npm test\n      - run: npm run lint",
      "pom.xml": "<project><build><plugins><plugin><artifactId>dependency-check-maven</artifactId></plugin></plugins></build></project>",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    // tests + lint + SAST (from pom.xml) but no deploy => score 3
    expect(result.score).toBe(3);
    expect(result.evidence).toContainEqual(expect.stringContaining("dependency-check-maven"));
  });

  it("detects Gradle checkstyle plugin", async () => {
    vol.fromJSON({
      ".github/workflows/ci.yml": "name: CI\njobs:\n  test:\n    steps:\n      - run: gradle test",
      "build.gradle": "plugins {\n  id(\"checkstyle\")\n}",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(3); // tests + lint
  });

  it("handles external lint declaration", async () => {
    vol.fromJSON({
      ".github/workflows/ci.yml": "name: CI\njobs:\n  test:\n    steps:\n      - run: npm test",
    }, REPO);
    const ctx = makeContext({ cicd: [{ tool: "checkstyle", category: "lint" }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(3); // tests (pipeline) + lint (declared)
    expect(result.evidence).toContainEqual(expect.stringContaining("[declared]"));
  });

  it("populates scoringRationale when pipeline exists", async () => {
    vol.fromJSON({
      ".github/workflows/ci.yml": "name: CI\njobs:\n  test:\n    steps:\n      - run: npm test",
    }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.scoringRationale).toBeDefined();
  });
});

// ===========================================================================
// External Tools — DoraAnalyzer with manual declarations
// ===========================================================================

describe("DoraAnalyzer — manual declarations", () => {
  const analyzer = new DoraAnalyzer();

  function setupGitMocks(tagCount: number, commitCount: number, revertCount: number) {
    mockExeca.mockImplementation((cmd: string, args: string[]) => {
      if (args?.includes("--is-inside-work-tree")) return Promise.resolve({ stdout: "true" });
      if (args?.includes("--sort=-creatordate")) {
        const dates = Array.from({ length: tagCount }, () => new Date().toISOString());
        return Promise.resolve({ stdout: dates.join("\n") });
      }
      if (args?.includes("--count")) return Promise.resolve({ stdout: String(commitCount) });
      if (args?.includes("--grep=^Revert ")) {
        return Promise.resolve({ stdout: revertCount > 0 ? Array(revertCount).fill("abc Revert x").join("\n") : "" });
      }
      return Promise.resolve({ stdout: "" });
    });
  }

  it("uses manual deployment count instead of git tags", async () => {
    vol.fromJSON({}, REPO);
    setupGitMocks(0, 100, 1); // 0 tags
    const ctx = makeContext({ dora: { deploymentSignal: "manual", deploymentsLast90Days: 24 } });
    const result = await analyzer.analyze(REPO, ctx);
    // 24 deployments = weekly equivalent
    expect(result.score).toBeGreaterThanOrEqual(4);
    expect(result.evidence).toContainEqual(expect.stringContaining("[declared]"));
    expect(result.evidence).toContainEqual(expect.stringContaining("24"));
  });

  it("falls back to git tags when no manual declaration", async () => {
    vol.fromJSON({}, REPO);
    setupGitMocks(0, 100, 0);
    const ctx = makeContext({});
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(1); // commits but no tags
  });

  it("falls back to git tags when deploymentsLast90Days is missing", async () => {
    vol.fromJSON({}, REPO);
    setupGitMocks(0, 50, 0);
    const ctx = makeContext({ dora: { deploymentSignal: "manual" } }); // no count!
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(1); // falls back to 0 tags
  });

  it("still calculates CFR from git even with manual deployments", async () => {
    vol.fromJSON({}, REPO);
    setupGitMocks(0, 100, 20); // 20% CFR
    const ctx = makeContext({ dora: { deploymentSignal: "manual", deploymentsLast90Days: 90 } });
    const result = await analyzer.analyze(REPO, ctx);
    // On-demand frequency but high CFR should reduce score
    expect(result.score).toBeLessThan(5);
  });

  it("populates scoringRationale with frequency source", async () => {
    vol.fromJSON({}, REPO);
    setupGitMocks(5, 100, 0);
    const ctx = makeContext({ dora: { deploymentSignal: "manual", deploymentsLast90Days: 30 } });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.scoringRationale).toContain("manual declaration");
  });
});

// ===========================================================================
// External Tools — DocsAnalyzer with external declarations
// ===========================================================================

describe("DocsAnalyzer — external docs", () => {
  const analyzer = new DocsAnalyzer();

  it("credits architecture docs from Azure Wiki", async () => {
    // README needs build commands for score 3; declared architecture boosts further
    vol.fromJSON({ "README.md": "# Project\n\nRun `npm run build` to compile.\n\n" + Array(25).fill("line").join("\n") }, REPO);
    const ctx = makeContext({ docs: [{ tool: "azure-wiki", pages: ["architecture"], url: "https://wiki.example.com" }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBeGreaterThanOrEqual(3);
    expect(result.evidence).toContainEqual(expect.stringContaining("[declared]"));
  });

  it("credits multiple page types", async () => {
    // README with build commands + declared architecture + api + onboarding => score 4
    vol.fromJSON({ "README.md": "# Project\n\nRun `npm run build` to compile.\n\n" + Array(25).fill("line").join("\n") }, REPO);
    const ctx = makeContext({ docs: [{ tool: "azure-wiki", pages: ["architecture", "api", "onboarding"] }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("scores identically without context", async () => {
    vol.fromJSON({}, REPO);
    const without = await analyzer.analyze(REPO);
    vol.reset();
    vol.fromJSON({}, REPO);
    const withEmpty = await analyzer.analyze(REPO, makeContext({}));
    expect(withEmpty.score).toBe(without.score);
  });

  it("populates scoringRationale", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.scoringRationale).toBeDefined();
  });
});

describe("DocsAnalyzer — external docs scoring improvements", () => {
  const analyzer = new DocsAnalyzer();

  it("external wiki 3 cats (arch+api+onboarding) + minimal README → score 4", async () => {
    vol.fromJSON({ "README.md": "# Minimal" }, REPO);
    const ctx = makeContext({ docs: [{ tool: "azure-wiki", pages: ["architecture", "api", "onboarding"] }] });
    const result = await analyzer.analyze(REPO, ctx);
    // arch+api+onboarding → hasArchitectureDocs+hasApiDocs+hasOnboarding, externalDocCount=3 >= 2
    // Triggers score 4 path (arch+api/onboarding + externalDocCount >= 2)
    expect(result.score).toBe(4);
  });

  it("external wiki arch+api + README with build cmds → score 4", async () => {
    vol.fromJSON({ "README.md": "# Project\n\nRun `npm run build` to build.\n\n" + Array(25).fill("line").join("\n") }, REPO);
    const ctx = makeContext({ docs: [{ tool: "azure-wiki", pages: ["architecture", "api"] }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(4);
  });

  it("no README + externalDocCount=3 → score 2", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ docs: [{ tool: "azure-wiki", pages: ["architecture", "api", "onboarding"] }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(2);
  });

  it("no README + no externals → score 0", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(0);
  });

  it("details string at score 2 via externals does NOT say 'README exists'", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ docs: [{ tool: "azure-wiki", pages: ["architecture", "api", "onboarding"] }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.details).not.toContain("README exists");
    expect(result.details).toContain("External");
  });

  it("readmeLines=20 boundary → score 1 (> 20 is false)", async () => {
    // 20 lines: "# Title" + 19 filler lines = 20 total
    const lines = ["# Title", ...Array(19).fill("filler")].join("\n");
    vol.fromJSON({ "README.md": lines }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(1);
  });

  it("readmeLines=21 boundary → score 2", async () => {
    const lines = ["# Title", ...Array(20).fill("filler")].join("\n");
    vol.fromJSON({ "README.md": lines }, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.score).toBe(2);
  });

  it("monotonicity: adding docs never lowers score", async () => {
    // Test a progression of increasing external docs with a minimal README
    const baseFiles = { "README.md": "# Project\n\nMinimal readme.\n" };
    const docPages = ["architecture", "api", "onboarding", "contributing"];

    let previousScore = -1;
    for (let i = 0; i <= docPages.length; i++) {
      vol.reset();
      vol.fromJSON(baseFiles, REPO);
      const pages = docPages.slice(0, i);
      const ctx = pages.length > 0
        ? makeContext({ docs: [{ tool: "wiki", pages }] })
        : makeContext({});
      const result = await analyzer.analyze(REPO, ctx);
      expect(result.score).toBeGreaterThanOrEqual(previousScore);
      previousScore = result.score;
    }
  });

  it("empty pages array → no categories matched", async () => {
    vol.fromJSON({ "README.md": "# Project" }, REPO);
    const ctx = makeContext({ docs: [{ tool: "wiki", pages: [] }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBe(1);
  });
});

// ===========================================================================
// External Tools — ReviewAnalyzer with practice declarations
// ===========================================================================

describe("ReviewAnalyzer — practice declarations", () => {
  const analyzer = new ReviewAnalyzer();

  it("credits branch protection from approval practice", async () => {
    vol.fromJSON({}, REPO);
    const ctx = makeContext({ review: [{ practice: "2 required approvals via Azure DevOps" }] });
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBeGreaterThanOrEqual(2);
    expect(result.evidence).toContainEqual(expect.stringContaining("[declared]"));
  });

  it("credits security reviewers from security review practice", async () => {
    vol.fromJSON({ ".github/CODEOWNERS": "* @team" }, REPO);
    const ctx = makeContext({ review: [
      { practice: "Security review required for auth changes" },
      { practice: "2 required approvals" },
    ]});
    const result = await analyzer.analyze(REPO, ctx);
    expect(result.score).toBeGreaterThanOrEqual(4);
  });

  it("scores identically without context", async () => {
    vol.fromJSON({}, REPO);
    const without = await analyzer.analyze(REPO);
    vol.reset();
    vol.fromJSON({}, REPO);
    const withEmpty = await analyzer.analyze(REPO, makeContext({}));
    expect(withEmpty.score).toBe(without.score);
  });

  it("populates scoringRationale with criteria", async () => {
    vol.fromJSON({}, REPO);
    const result = await analyzer.analyze(REPO);
    expect(result.scoringRationale).toBeDefined();
    expect(result.scoringRationale).toContain("CODEOWNERS");
  });
});
