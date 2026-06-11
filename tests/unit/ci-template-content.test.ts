import { describe, it, expect } from "vitest";
import { TemplateEngine } from "../../src/core/scaffold/template-engine.js";

describe("CI template content — security tool wiring", () => {
  const engine = new TemplateEngine();
  const vars = {
    version: "test",
    techStack: "typescript",
    coverageThreshold: "80",
    prSizeLimit: "400",
    curlyOpen: "{",
    curlyClose: "}",
  };

  it("Azure DevOps template references .semgrep.yml in semgrep step", () => {
    const content = engine.render("ci/azure-devops/quality-gates.yml", vars);
    expect(content).toContain(".semgrep.yml");
  });

  it("GitHub Actions template references .semgrep.yml in semgrep step", () => {
    const content = engine.render("ci/github-actions/quality-gates.yml", vars);
    expect(content).toContain(".semgrep.yml");
  });

  it("Azure DevOps template still uses --config auto for registry rules", () => {
    const content = engine.render("ci/azure-devops/quality-gates.yml", vars);
    expect(content).toContain("--config auto");
  });

  it("GitHub Actions template still uses --config auto for registry rules", () => {
    const content = engine.render("ci/github-actions/quality-gates.yml", vars);
    expect(content).toContain("--config auto");
  });
});

describe("Semgrep template content", () => {
  const engine = new TemplateEngine();

  it("has meaningful exclusions (not just empty rules)", () => {
    const content = engine.render("resolve/security/semgrep.yml", { version: "test" });
    expect(content).toContain("exclude");
    expect(content).toContain("node_modules");
    expect(content).toContain("dist");
  });

  it("still includes rules section for custom rules", () => {
    const content = engine.render("resolve/security/semgrep.yml", { version: "test" });
    expect(content).toContain("rules:");
  });
});
