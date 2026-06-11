import { defineCommand } from "citty";
import chalk from "chalk";
import { existsSync, readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { execa } from "execa";
import { TemplateEngine } from "../../core/scaffold/template-engine.js";
import { createAdapterRegistry } from "../../adapters/adapter-registry.js";

// ---------------------------------------------------------------------------
// Tech stack detection
// ---------------------------------------------------------------------------

async function detectTechStack(repoRoot: string): Promise<string> {
  const registry = createAdapterRegistry();
  const detection = await registry.detect(repoRoot);
  return detection?.adapter.displayName ?? "Unknown";
}

// ---------------------------------------------------------------------------
// GitNexus layer — index + stats + wiki
// ---------------------------------------------------------------------------

interface GitNexusStats {
  symbols: number;
  edges: number;
  clusters: number;
  flows: number;
}

async function indexGitNexus(repoRoot: string): Promise<GitNexusStats | null> {
  try {
    console.log(chalk.dim("    Indexing codebase with GitNexus..."));
    await execa("npx", ["-y", "gitnexus", "analyze"], { cwd: repoRoot, timeout: 180_000 });
  } catch {
    return null;
  }

  try {
    const metaPath = join(repoRoot, ".gitnexus", "meta.json");
    if (existsSync(metaPath)) {
      const meta = JSON.parse(readFileSync(metaPath, "utf-8")) as Record<string, unknown>;
      const stats = meta["stats"] as Record<string, number> | undefined;
      return {
        symbols: stats?.["symbols"] ?? 0,
        edges: stats?.["edges"] ?? 0,
        clusters: stats?.["clusters"] ?? 0,
        flows: stats?.["flows"] ?? 0,
      };
    }
  } catch { /* ignore */ }
  return { symbols: 0, edges: 0, clusters: 0, flows: 0 };
}

async function generateWiki(repoRoot: string): Promise<string[]> {
  try {
    console.log(chalk.dim("    Generating wiki pages from knowledge graph..."));
    await execa("npx", ["-y", "gitnexus", "wiki"], { cwd: repoRoot, timeout: 300_000 });
    const wikiDir = join(repoRoot, ".gitnexus", "wiki");
    if (existsSync(wikiDir)) {
      return readdirSync(wikiDir).filter((f) => f.endsWith(".md"));
    }
  } catch { /* wiki generation needs LLM API key */ }
  return [];
}

// ---------------------------------------------------------------------------
// Dependency analysis layer
// ---------------------------------------------------------------------------

async function analyzeDependencies(repoRoot: string): Promise<{ diagram: string; circular: string[]; metrics: string }> {
  let diagram = "";
  let circular: string[] = [];
  let metrics = "";

  // Try madge for circular deps
  try {
    console.log(chalk.dim("    Detecting circular dependencies..."));
    const result = await execa("npx", ["-y", "madge", "--circular", "--json", "src"], {
      cwd: repoRoot,
      timeout: 60_000,
    });
    const output = result.stdout.trim();
    if (output && !output.includes("placeholder published")) {
      try {
        const parsed = JSON.parse(output) as string[][];
        circular = parsed.map((cycle) => cycle.join(" → "));
      } catch { /* non-JSON output */ }
    }
  } catch { /* madge not available */ }

  // Try madge for dependency graph
  try {
    console.log(chalk.dim("    Building dependency graph..."));
    const result = await execa("npx", ["-y", "madge", "--json", "src"], {
      cwd: repoRoot,
      timeout: 60_000,
    });
    const output = result.stdout.trim();
    if (output && !output.includes("placeholder published")) {
      try {
        const graph = JSON.parse(output) as Record<string, string[]>;
        // Build Mermaid from dependency graph
        const lines = ["```mermaid", "flowchart TD"];
        const entries = Object.entries(graph);
        // Group by directory for subgraphs
        const dirs = new Map<string, string[]>();
        for (const [file] of entries) {
          const dir = file.includes("/") ? (file.split("/")[0] ?? "root") : "root";
          if (!dirs.has(dir)) dirs.set(dir, []);
          dirs.get(dir)?.push(file);
        }
        // Add subgraphs
        for (const [dir, files] of dirs) {
          if (files.length > 1) {
            lines.push(`  subgraph ${dir}`);
            for (const f of files.slice(0, 10)) {
              const id = f.replace(/[/.]/g, "_");
              const label = f.split("/").pop()?.replace(".ts", "") ?? f;
              lines.push(`    ${id}["${label}"]`);
            }
            if (files.length > 10) lines.push(`    ${dir}_more["... +${files.length - 10} more"]`);
            lines.push("  end");
          }
        }
        // Add edges (limit to 50 for readability)
        let edgeCount = 0;
        for (const [file, deps] of entries) {
          if (edgeCount > 50) break;
          const fromId = file.replace(/[/.]/g, "_");
          for (const dep of deps) {
            if (edgeCount > 50) break;
            const toId = dep.replace(/[/.]/g, "_");
            lines.push(`  ${fromId} --> ${toId}`);
            edgeCount++;
          }
        }
        lines.push("```");
        diagram = lines.join("\n");

        // Compute coupling metrics
        const fanIn = new Map<string, number>();
        const fanOut = new Map<string, number>();
        for (const [file, deps] of entries) {
          fanOut.set(file, deps.length);
          for (const dep of deps) {
            fanIn.set(dep, (fanIn.get(dep) ?? 0) + 1);
          }
        }
        // Top 10 most depended-on modules
        const top = [...fanIn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
        if (top.length > 0) {
          const rows = top.map(([file, fi]) => {
            const fo = fanOut.get(file) ?? 0;
            const instability = fi + fo > 0 ? (fo / (fi + fo)).toFixed(2) : "0.00";
            const risk = fi > 15 ? "High" : fi > 8 ? "Medium" : "Low";
            return `| ${file.split("/").pop()} | ${fi} | ${fo} | ${instability} | ${risk} |`;
          });
          metrics = "| Module | Fan-In | Fan-Out | Instability | Risk |\n|--------|--------|---------|-------------|------|\n" + rows.join("\n");
        }
      } catch { /* non-JSON output */ }
    }
  } catch { /* madge not available */ }

  return { diagram, circular, metrics };
}

// ---------------------------------------------------------------------------
// API reference layer (TypeDoc for TS)
// ---------------------------------------------------------------------------

async function generateApiReference(repoRoot: string, outputDir: string): Promise<boolean> {
  if (!existsSync(join(repoRoot, "tsconfig.json"))) return false;

  try {
    console.log(chalk.dim("    Generating TypeScript API reference..."));
    // Ensure typedoc is available
    try {
      await execa("npx", ["-y", "typedoc", "--version"], { cwd: repoRoot, timeout: 30_000 });
    } catch {
      console.log(chalk.dim("    Installing typedoc..."));
      await execa("npm", ["install", "--no-save", "typedoc"], { cwd: repoRoot, timeout: 60_000 });
    }
    const apiDir = join(outputDir, "api");
    await execa("npx", ["typedoc", "--out", apiDir, "--entryPointStrategy", "expand", "src"], {
      cwd: repoRoot,
      timeout: 120_000,
    });
    return existsSync(apiDir);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Graphify layer
// ---------------------------------------------------------------------------

async function runGraphify(repoRoot: string): Promise<boolean> {
  try {
    console.log(chalk.dim("    Building knowledge graph with Graphify..."));
    // Try npx first (Node.js graphify), then pip (Python graphify-ai)
    try {
      await execa("npx", ["-y", "graphify", ".", "--mode", "deep"], { cwd: repoRoot, timeout: 300_000 });
    } catch {
      // Fallback: try Python graphify
      try {
        await execa("pip", ["install", "-q", "graphify-ai"], { timeout: 60_000 });
      } catch { /* pip not available */ }
      await execa("graphify", [".", "--mode", "deep"], { cwd: repoRoot, timeout: 300_000 });
    }
    return existsSync(join(repoRoot, "graphify-out", "GRAPH_REPORT.md"));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// C4 context diagram generation
// ---------------------------------------------------------------------------

function generateC4ContextDiagram(repoRoot: string): string {
  const pkgPath = join(repoRoot, "package.json");
  let projectName = repoRoot.split("/").pop() ?? "System";
  let description = "Software system";

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8")) as Record<string, string>;
      projectName = pkg["name"] ?? projectName;
      description = pkg["description"] ?? description;
    } catch { /* ignore */ }
  }

  const actors: string[] = [];
  const relations: string[] = [];

  // Check for configured integrations
  const manifestPath = join(repoRoot, ".dafke", "manifest.yaml");
  if (existsSync(manifestPath)) {
    const content = readFileSync(manifestPath, "utf-8");
    if (content.includes("azure-devops") || content.includes("azureDevOps")) {
      actors.push(`    System_Ext(ado, "Azure DevOps", "CI/CD, repos, work items")`);
      relations.push(`    Rel(system, ado, "Pipelines, PRs, builds")`);
    }
    if (content.includes("jira")) {
      actors.push(`    System_Ext(jira, "Jira", "Issue tracking")`);
      relations.push(`    Rel(system, jira, "Issues, sprints")`);
    }
    if (content.includes("confluence")) {
      actors.push(`    System_Ext(confluence, "Confluence", "Wiki, documentation")`);
      relations.push(`    Rel(system, confluence, "Documentation sync")`);
    }
  }

  // Check for MCP servers
  const mcpPath = join(repoRoot, ".claude", "mcp.json");
  if (existsSync(mcpPath)) {
    try {
      const mcp = JSON.parse(readFileSync(mcpPath, "utf-8")) as Record<string, unknown>;
      const servers = mcp["mcpServers"] as Record<string, unknown> | undefined;
      if (servers) {
        if (servers["gitnexus"]) {
          actors.push(`    System_Ext(gitnexus, "GitNexus", "Code intelligence graph")`);
          relations.push(`    Rel(system, gitnexus, "Symbol analysis, impact")`);
        }
        if (servers["context7"]) {
          actors.push(`    System_Ext(context7, "Context7", "Library documentation")`);
          relations.push(`    Rel(system, context7, "API docs lookup")`);
        }
      }
    } catch { /* ignore */ }
  }

  // Always add developer actor
  actors.unshift(`    Person(dev, "Developer", "Uses AI-assisted development")`);
  relations.unshift(`    Rel(dev, system, "Develops with Claude Code")`);

  const lines = [
    "```mermaid",
    "C4Context",
    `    title System Context — ${projectName}`,
    "",
    `    System(system, "${projectName}", "${description}")`,
    "",
    ...actors,
    "",
    ...relations,
    "```",
  ];

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Per-module documentation
// ---------------------------------------------------------------------------

function generateModuleDocs(repoRoot: string, outputDir: string, wikiPages: string[]): string[] {
  const engine = new TemplateEngine();
  const projectName = repoRoot.split("/").pop() ?? "Project";
  const generated: string[] = [];

  if (wikiPages.length > 0) {
    // Generate from GitNexus wiki pages
    const wikiDir = join(repoRoot, ".gitnexus", "wiki");
    for (const page of wikiPages) {
      const name = page.replace(".md", "");
      const wikiContent = existsSync(join(wikiDir, page))
        ? readFileSync(join(wikiDir, page), "utf-8")
        : "";

      let content: string;
      try {
        content = engine.render("gendoc/module.md", {
          moduleName: name,
          projectName,
          purpose: wikiContent || `Module ${name} — see source code for details.`,
          fileTable: "",
          publicApi: "",
          dependencyDiagram: "",
          usageExamples: "",
          designDecisions: "",
        });
      } catch {
        // Template not found — inline fallback
        content = `# ${name}\n\n> Part of [${projectName}](../ARCHITECTURE.md) architecture documentation.\n\n## Purpose\n\n${wikiContent || `Module ${name}`}\n`;
      }

      writeFileSync(join(outputDir, "modules", `${name}.md`), content, "utf-8");
      generated.push(`${name}.md`);
    }
  } else {
    // Fallback: scan src/ top-level directories
    const srcDir = join(repoRoot, "src");
    if (existsSync(srcDir)) {
      try {
        const entries = readdirSync(srcDir, { withFileTypes: true });
        for (const entry of entries) {
          if (!entry.isDirectory()) continue;
          const name = entry.name;
          const files = readdirSync(join(srcDir, name)).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
          const fileTable = files.length > 0
            ? "| File | Description |\n|------|-------------|\n" + files.slice(0, 20).map((f) => `| \`${f}\` | |`).join("\n")
            : "";

          let content: string;
          try {
            content = engine.render("gendoc/module.md", {
              moduleName: name,
              projectName,
              purpose: `Module \`${name}\` — ${files.length} source file(s).`,
              fileTable,
              publicApi: "",
              dependencyDiagram: "",
              usageExamples: "",
              designDecisions: "",
            });
          } catch {
            content = `# ${name}\n\n> Part of [${projectName}](../ARCHITECTURE.md) architecture documentation.\n\n## Purpose\n\nModule \`${name}\` — ${files.length} source file(s).\n\n## Key Files\n\n${fileTable}\n`;
          }

          writeFileSync(join(outputDir, "modules", `${name}.md`), content, "utf-8");
          generated.push(`${name}.md`);
        }
      } catch { /* src not readable */ }
    }
  }

  return generated;
}

// ---------------------------------------------------------------------------
// Incremental update
// ---------------------------------------------------------------------------

async function getChangedModules(repoRoot: string): Promise<string[] | null> {
  try {
    const result = await execa("git", ["diff", "--name-only", "HEAD~5"], {
      cwd: repoRoot,
      timeout: 10_000,
    });
    const files = result.stdout.trim().split("\n").filter(Boolean);
    const modules = new Set<string>();
    for (const file of files) {
      if (file.startsWith("src/")) {
        const parts = file.split("/");
        if (parts[1]) modules.add(parts[1]);
      }
    }
    return [...modules];
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// CLAUDE.md and README.md integration
// ---------------------------------------------------------------------------

function updateClaudeMd(repoRoot: string): void {
  const claudePath = join(repoRoot, "CLAUDE.md");
  if (!existsSync(claudePath)) return;

  const content = readFileSync(claudePath, "utf-8");
  const docSection = `\n## Documentation\n
Architecture documentation is generated by \`dafke docs\` and kept in \`docs/\`.

| Document | Purpose |
|----------|---------|
| \`docs/ARCHITECTURE.md\` | Architecture overview with Mermaid diagrams |
| \`docs/INDEX.md\` | Question → file routing table |
| \`docs/modules/*.md\` | Per-module documentation |
| \`docs/diagrams/*.mmd\` | Mermaid diagram sources |

**Before modifying architecture-critical code**, read ARCHITECTURE.md first.
**Regenerate**: \`dafke docs\` or \`/dafke-arch\` in Claude Code.\n`;

  if (content.includes("## Documentation")) {
    // Already has a Documentation section — skip to avoid duplication
    return;
  }

  // Insert before the first GitNexus section or at end
  const insertPoint = content.indexOf("# GitNexus");
  if (insertPoint > 0) {
    const updated = content.slice(0, insertPoint) + docSection + "\n" + content.slice(insertPoint);
    writeFileSync(claudePath, updated, "utf-8");
  } else {
    writeFileSync(claudePath, content + "\n" + docSection, "utf-8");
  }
}

function updateReadme(repoRoot: string): void {
  const readmePath = join(repoRoot, "README.md");
  if (!existsSync(readmePath)) return;

  const content = readFileSync(readmePath, "utf-8");
  if (content.includes("## Documentation") || content.includes("docs/ARCHITECTURE.md")) return;

  const docSection = `\n## Documentation\n
Comprehensive architecture documentation is available in \`docs/\`:

- **[Architecture Overview](docs/ARCHITECTURE.md)** — System design, Mermaid diagrams, module map
- **[Documentation Index](docs/INDEX.md)** — Quick lookup for common questions
- **Module Docs** — Per-module documentation in \`docs/modules/\`

Regenerate with: \`dafke docs\`\n`;

  writeFileSync(readmePath, content + docSection, "utf-8");
}

// ---------------------------------------------------------------------------
// INDEX.md generation
// ---------------------------------------------------------------------------

function generateIndex(repoRoot: string, outputDir: string, modules: string[]): void {
  const projectName = repoRoot.split("/").pop() ?? "Project";
  const date = new Date().toISOString().split("T")[0];

  const archQuestions = [
    '| "What\'s the high-level architecture?" | [ARCHITECTURE.md](ARCHITECTURE.md) |',
    '| "What are the main modules?" | [ARCHITECTURE.md](ARCHITECTURE.md#module-map) |',
    '| "How do components interact?" | [ARCHITECTURE.md](ARCHITECTURE.md#data-flows) |',
    '| "What design decisions were made?" | [ARCHITECTURE.md](ARCHITECTURE.md#design-decisions) |',
    '| "What are the integration points?" | [ARCHITECTURE.md](ARCHITECTURE.md#integration-points) |',
  ].join("\n");

  const moduleQuestions = modules.map((m) => {
    const name = m.replace(".md", "");
    return `| "How does ${name} work?" | [modules/${m}](modules/${m}) |`;
  }).join("\n") || '| "No module docs generated yet" | Run `dafke docs` with GitNexus wiki |';

  const depQuestions = [
    '| "What depends on this module?" | [ARCHITECTURE.md](ARCHITECTURE.md#dependencies) |',
    '| "Are there circular dependencies?" | [ARCHITECTURE.md](ARCHITECTURE.md#risk-assessment) |',
    '| "What\'s the coupling risk?" | [ARCHITECTURE.md](ARCHITECTURE.md#coupling-metrics) |',
  ].join("\n");

  const apiQuestions = existsSync(join(outputDir, "api"))
    ? '| "What\'s the public API?" | [api/index.html](api/index.html) |'
    : '| "API reference not yet generated" | Run `dafke docs` with TypeDoc installed |';

  const engine = new TemplateEngine();
  let indexContent: string;
  try {
    indexContent = engine.render("gendoc/index.md", {
      projectName,
      date,
      architectureQuestions: archQuestions,
      moduleQuestions,
      dependencyQuestions: depQuestions,
      apiQuestions,
    });
  } catch {
    // Template not found — generate inline
    indexContent = `# ${projectName} — Documentation Index\n\n> Generated on ${date}\n\n## Architecture\n\n${archQuestions}\n\n## Modules\n\n${moduleQuestions}\n`;
  }

  writeFileSync(join(outputDir, "INDEX.md"), indexContent, "utf-8");
}

// ---------------------------------------------------------------------------
// ARCHITECTURE.md generation (template-based)
// ---------------------------------------------------------------------------

async function generateArchitecture(
  repoRoot: string,
  outputDir: string,
  stats: GitNexusStats | null,
  deps: { diagram: string; circular: string[]; metrics: string },
  wikiPages: string[],
  moduleDocs: string[],
  hasApi: boolean,
  hasGraphify: boolean,
  c4Diagram: string,
): Promise<void> {
  const projectName = repoRoot.split("/").pop() ?? "Project";
  const techStack = await detectTechStack(repoRoot);
  const date = new Date().toISOString().split("T")[0];

  // Build template variables
  const statsLine = stats
    ? `${stats.symbols.toLocaleString()} symbols, ${stats.edges.toLocaleString()} relationships, ${stats.clusters} clusters, ${stats.flows} execution flows`
    : "";

  // Module map from wiki pages or module docs
  let moduleTable = "";
  if (wikiPages.length > 0) {
    const rows = wikiPages.slice(0, 30).map((page) => {
      const name = page.replace(".md", "");
      return `| [${name}](.gitnexus/wiki/${page}) | |`;
    });
    moduleTable = "| Module | Description |\n|--------|-------------|\n" + rows.join("\n");
  }

  // Module doc links
  let moduleDocLinks = "";
  if (moduleDocs.length > 0) {
    moduleDocLinks = `${moduleDocs.length} module(s) documented:\n\n` + moduleDocs.map((m) => {
      const name = m.replace(".md", "");
      return `- [${name}](modules/${m})`;
    }).join("\n");

    // Include overview from wiki if available
    const overviewPath = join(repoRoot, ".gitnexus", "wiki", "overview.md");
    const indexPath = join(repoRoot, ".gitnexus", "wiki", "index.md");
    const mainPage = existsSync(overviewPath) ? overviewPath : existsSync(indexPath) ? indexPath : null;
    if (mainPage) {
      const content = readFileSync(mainPage, "utf-8");
      if (content.length > 100) {
        moduleDocLinks += "\n\n### Architecture Overview\n\n" + content.slice(0, 8000);
        if (content.length > 8000) moduleDocLinks += "\n\n_... see full wiki in `.gitnexus/wiki/`_";
      }
    }
  }

  // Circular deps
  let circularDeps = "";
  if (deps.circular.length > 0) {
    circularDeps = `Found ${deps.circular.length} circular dependency chain(s):\n\n` +
      deps.circular.map((cycle) => `- \`${cycle}\``).join("\n");
  }

  // API reference
  const apiReference = hasApi
    ? "Full TypeScript API documentation generated in `docs/api/`.\nOpen `docs/api/index.html` in a browser to browse."
    : "";

  // Knowledge graph
  let knowledgeGraph = "";
  if (hasGraphify) {
    knowledgeGraph = "Interactive knowledge graph generated by Graphify:\n" +
      "- **Visualization**: `graphify-out/index.html`\n" +
      "- **Graph data**: `graphify-out/graph.json` (GraphRAG-ready)\n" +
      "- **Audit report**: `graphify-out/GRAPH_REPORT.md`";
    const reportPath = join(repoRoot, "graphify-out", "GRAPH_REPORT.md");
    if (existsSync(reportPath)) {
      const report = readFileSync(reportPath, "utf-8");
      knowledgeGraph += "\n\n" + report.slice(0, 5000);
      if (report.length > 5000) knowledgeGraph += "\n\n_... see full report in `graphify-out/GRAPH_REPORT.md`_";
    }
  }

  // Risk assessment
  const riskLines: string[] = [];
  if (deps.circular.length > 0) {
    riskLines.push(`- **Circular dependencies**: ${deps.circular.length} chain(s) detected — requires refactoring`);
  } else {
    riskLines.push("- **Circular dependencies**: None detected");
  }
  if (stats) {
    const ratio = stats.edges / Math.max(stats.symbols, 1);
    riskLines.push(`- **Coupling ratio**: ${ratio.toFixed(1)} relationships per symbol (${ratio < 3 ? "healthy" : ratio < 6 ? "moderate" : "high"})`);
  }
  const riskAssessment = riskLines.join("\n");

  const engine = new TemplateEngine();
  let archContent: string;
  try {
    archContent = engine.render("gendoc/architecture.md", {
      projectName,
      techStack,
      date,
      statsLine,
      contextDiagram: c4Diagram,
      moduleTable,
      moduleDocLinks,
      dependencyDiagram: deps.diagram,
      circularDeps,
      couplingTable: deps.metrics,
      apiReference,
      knowledgeGraph,
      riskAssessment,
    });
  } catch {
    // Template not found — inline fallback (same as original)
    const sections: string[] = [
      `# ${projectName} — Architecture Documentation\n`,
      `> Generated by \`dafke docs\` on ${date}.\n`,
      `**Tech Stack:** ${techStack}`,
      statsLine ? `**Codebase:** ${statsLine}` : "",
      "\n---\n",
    ];
    if (c4Diagram) sections.push(`## System Context (C4)\n\n${c4Diagram}\n`);
    if (deps.diagram) sections.push(`## Dependencies\n\n${deps.diagram}\n`);
    if (deps.metrics) sections.push(`## Coupling Metrics\n\n${deps.metrics}\n`);
    sections.push(`## Risk Assessment\n\n${riskAssessment}\n`);
    sections.push(`---\n_Generated by dafke docs on ${date}._\n`);
    archContent = sections.filter(Boolean).join("\n");
  }

  writeFileSync(join(outputDir, "ARCHITECTURE.md"), archContent, "utf-8");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: {
    name: "docs",
    description: "Scaffold baseline docs (stubs, diagrams, index). For AI-powered docs: dafke plugin install dafke-docs",
  },
  args: {
    output: {
      type: "string",
      description: "Output directory",
      default: "docs",
    },
    skip: {
      type: "string",
      description: "Skip layers: gitnexus, graphify, typedoc, deps",
    },
    "dry-run": {
      type: "boolean",
      description: "Preview without writing files",
      default: false,
    },
    update: {
      type: "boolean",
      description: "Incremental — only changed modules since last 5 commits",
      default: false,
    },
    format: {
      type: "string",
      description: "Output format (markdown, json)",
      default: "markdown",
    },
  },
  async run({ args }) {
    const repoRoot = process.cwd();
    const outputDir = join(repoRoot, args.output as string);
    const dryRun = args["dry-run"] as boolean;
    const format = args.format as string;
    const isUpdate = args.update as boolean;
    const skipSet = new Set(
      ((args.skip as string) ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    );

    // Check if dafke-docs plugin is installed (look for crew agents)
    const hasDocsPlugin = existsSync(join(repoRoot, ".claude", "agents", "docs-code-analyst.md"));

    console.log();
    console.log(chalk.bold.hex("#6366f1")("  Architecture Documentation Scaffolding"));
    console.log(chalk.dim("  " + "─".repeat(50)));
    console.log(chalk.dim("  Scaffolds baseline docs from code analysis tools."));
    console.log(chalk.dim("  Module stubs and diagrams — not AI-verified content."));
    if (!hasDocsPlugin) {
      console.log();
      console.log(chalk.yellow("  For AI-powered, source-code-verified documentation:"));
      console.log(chalk.bold("  dafke plugin install dafke-docs"));
      console.log(chalk.dim("  Then invoke /dafke-docs-generate in Claude Code"));
    } else {
      console.log();
      console.log(chalk.green("  dafke-docs plugin detected") + chalk.dim(" — use /dafke-docs-generate for AI-powered docs"));
    }
    console.log();

    const techStack = await detectTechStack(repoRoot);
    const hasTs = existsSync(join(repoRoot, "tsconfig.json"));

    if (dryRun) {
      console.log(chalk.cyan("  [DRY RUN] Would scaffold documentation using:"));
      console.log(`  Tech Stack: ${techStack}`);
      console.log();
      if (!skipSet.has("gitnexus")) console.log("    1. GitNexus — code intelligence index + wiki pages");
      if (!skipSet.has("deps")) console.log("    2. Dependency Analysis — circular deps, coupling metrics, Mermaid graph");
      if (!skipSet.has("graphify")) console.log("    3. Graphify — knowledge graph + community detection");
      if (!skipSet.has("typedoc") && hasTs) console.log("    4. TypeDoc — TypeScript API reference");
      console.log("    5. Documentation Assembly — ARCHITECTURE.md (template), per-module stubs, C4 diagram");
      console.log("    6. Index Builder — routing table, CLAUDE.md/README.md updates");
      console.log();
      console.log(`  Output: ${outputDir}/`);
      console.log(`    ├── ARCHITECTURE.md (template-rendered with Mermaid diagrams)`);
      console.log(`    ├── INDEX.md (question → file routing table)`);
      console.log(`    ├── modules/*.md (per-module documentation stubs)`);
      console.log(`    └── diagrams/*.mmd (Mermaid source files — C4, dependencies)`);
      console.log();
      console.log(chalk.dim("  For AI-powered documentation: install dafke-docs plugin, then /dafke-docs-generate"));
      console.log();
      return;
    }

    // Incremental update: only regenerate changed modules
    if (isUpdate && existsSync(join(outputDir, "ARCHITECTURE.md"))) {
      console.log(chalk.cyan("  [UPDATE] Incremental documentation update"));
      const changedModules = await getChangedModules(repoRoot);
      if (changedModules && changedModules.length > 0) {
        console.log(chalk.dim(`    Changed modules: ${changedModules.join(", ")}`));
        mkdirSync(join(outputDir, "modules"), { recursive: true });

        // Regenerate only changed module docs
        const engine = new TemplateEngine();
        const projectName = repoRoot.split("/").pop() ?? "Project";
        const srcDir = join(repoRoot, "src");
        for (const mod of changedModules) {
          const modDir = join(srcDir, mod);
          if (!existsSync(modDir)) continue;
          const files = readdirSync(modDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"));
          const fileTable = files.length > 0
            ? "| File | Description |\n|------|-------------|\n" + files.slice(0, 20).map((f) => `| \`${f}\` | |`).join("\n")
            : "";
          let content: string;
          try {
            content = engine.render("gendoc/module.md", {
              moduleName: mod,
              projectName,
              purpose: `Module \`${mod}\` — ${files.length} source file(s).`,
              fileTable,
              publicApi: "",
              dependencyDiagram: "",
              usageExamples: "",
              designDecisions: "",
            });
          } catch {
            content = `# ${mod}\n\n> Part of [${projectName}](../ARCHITECTURE.md).\n\n## Purpose\n\nModule \`${mod}\` — ${files.length} source file(s).\n`;
          }
          writeFileSync(join(outputDir, "modules", `${mod}.md`), content, "utf-8");
          console.log(chalk.dim(`    Updated docs/modules/${mod}.md`));
        }

        // Refresh INDEX.md with all module docs
        const allModuleDocs = existsSync(join(outputDir, "modules"))
          ? readdirSync(join(outputDir, "modules")).filter((f) => f.endsWith(".md"))
          : [];
        generateIndex(repoRoot, outputDir, allModuleDocs);
        console.log(chalk.dim("    Refreshed INDEX.md"));
        console.log();
        return;
      } else {
        console.log(chalk.dim("    No changed modules detected — running full generation"));
      }
    }

    mkdirSync(outputDir, { recursive: true });
    mkdirSync(join(outputDir, "modules"), { recursive: true });
    mkdirSync(join(outputDir, "diagrams"), { recursive: true });

    // Layer 1: GitNexus
    let stats: GitNexusStats | null = null;
    let wikiPages: string[] = [];
    if (!skipSet.has("gitnexus")) {
      console.log(chalk.bold(`  [1/6] GitNexus — Code Intelligence`));
      stats = await indexGitNexus(repoRoot);
      if (stats) {
        console.log(chalk.dim(`    ${stats.symbols.toLocaleString()} symbols, ${stats.edges.toLocaleString()} relationships, ${stats.clusters} clusters`));
        wikiPages = await generateWiki(repoRoot);
        if (wikiPages.length > 0) {
          console.log(chalk.dim(`    ${wikiPages.length} wiki page(s) generated`));
        }
      } else {
        console.log(chalk.dim("    GitNexus not available"));
      }
    }

    // Layer 2: Dependency analysis
    let deps = { diagram: "", circular: [] as string[], metrics: "" };
    if (!skipSet.has("deps")) {
      console.log(chalk.bold(`  [2/6] Dependency Analysis`));
      deps = await analyzeDependencies(repoRoot);
      if (deps.diagram) {
        // Save Mermaid source
        writeFileSync(join(outputDir, "diagrams", "dependencies.mmd"), deps.diagram, "utf-8");
        console.log(chalk.dim(`    Dependency graph saved to docs/diagrams/dependencies.mmd`));
      }
      if (deps.circular.length > 0) {
        console.log(chalk.yellow(`    ⚠ ${deps.circular.length} circular dependency chain(s) detected`));
      }
    }

    // Layer 3: Graphify
    let hasGraphify = false;
    if (!skipSet.has("graphify")) {
      console.log(chalk.bold(`  [3/6] Graphify — Knowledge Graph`));
      hasGraphify = await runGraphify(repoRoot);
      if (hasGraphify) {
        console.log(chalk.dim("    Knowledge graph generated in graphify-out/"));
      } else {
        console.log(chalk.dim("    Graphify not available (install: pip install graphify-ai)"));
      }
    }

    // Layer 4: API reference
    let hasApi = false;
    if (!skipSet.has("typedoc")) {
      console.log(chalk.bold(`  [4/6] API Reference`));
      hasApi = await generateApiReference(repoRoot, outputDir);
      if (hasApi) {
        console.log(chalk.dim("    TypeScript API reference generated in docs/api/"));
      } else if (hasTs) {
        console.log(chalk.dim("    TypeDoc not available (install: npm i -D typedoc)"));
      } else {
        console.log(chalk.dim("    Skipped (not a TypeScript project)"));
      }
    }

    // Layer 5: Generate docs — ARCHITECTURE.md, per-module docs, C4 diagram
    console.log(chalk.bold(`  [5/6] Documentation Assembly`));

    // C4 context diagram
    const c4Diagram = generateC4ContextDiagram(repoRoot);
    writeFileSync(join(outputDir, "diagrams", "c4-context.mmd"), c4Diagram, "utf-8");
    console.log(chalk.dim("    Generated C4 context diagram"));

    // Per-module docs
    const moduleDocs = generateModuleDocs(repoRoot, outputDir, wikiPages);
    if (moduleDocs.length > 0) {
      console.log(chalk.dim(`    Generated ${moduleDocs.length} module doc(s)`));
    }

    await generateArchitecture(repoRoot, outputDir, stats, deps, wikiPages, moduleDocs, hasApi, hasGraphify, c4Diagram);
    console.log(chalk.dim("    Generated ARCHITECTURE.md (template-rendered)"));

    // Layer 6: Index + CLAUDE.md/README updates
    console.log(chalk.bold(`  [6/6] Index & Integration`));

    generateIndex(repoRoot, outputDir, moduleDocs.length > 0 ? moduleDocs : wikiPages);
    console.log(chalk.dim("    Generated INDEX.md routing table"));

    updateClaudeMd(repoRoot);
    console.log(chalk.dim("    Updated CLAUDE.md with documentation references"));

    updateReadme(repoRoot);
    console.log(chalk.dim("    Updated README.md with documentation links"));

    if (format === "json") {
      const archPath = join(outputDir, "ARCHITECTURE.md");
      const archContent = existsSync(archPath) ? readFileSync(archPath, "utf-8") : "";
      console.log(JSON.stringify({
        outputDir,
        techStack,
        stats,
        wikiPages: wikiPages.length,
        moduleDocs: moduleDocs.length,
        circularDeps: deps.circular.length,
        hasApi,
        hasGraphify,
        archLines: archContent.split("\n").length,
      }, null, 2));
      return;
    }

    // Summary
    const archPath = join(outputDir, "ARCHITECTURE.md");
    const archContent = readFileSync(archPath, "utf-8");
    console.log();
    console.log(chalk.bold("  Scaffolded:"));
    console.log(chalk.green(`  ✓ ${archPath}`));
    console.log(chalk.dim(`    ${archContent.split("\n").length} lines, ${(archContent.length / 1024).toFixed(1)} KB`));
    console.log(chalk.green(`  ✓ ${join(outputDir, "INDEX.md")}`));
    if (moduleDocs.length > 0) console.log(chalk.green(`  ✓ ${moduleDocs.length} module stub(s) in ${join(outputDir, "modules/")}`));
    console.log(chalk.green(`  ✓ ${join(outputDir, "diagrams", "c4-context.mmd")}`));
    if (deps.diagram) console.log(chalk.green(`  ✓ ${join(outputDir, "diagrams", "dependencies.mmd")}`));
    console.log();
    console.log(chalk.dim("  These are baseline stubs from static analysis — not AI-verified content."));
    console.log(chalk.dim("  Rescan:      ") + chalk.bold("dafke docs"));
    console.log(chalk.dim("  Incremental: ") + chalk.bold("dafke docs --update"));
    console.log();
    if (hasDocsPlugin) {
      console.log(chalk.bold.hex("#6366f1")("  Next step: ") + chalk.bold("/dafke-docs-generate") + chalk.dim(" in Claude Code"));
      console.log(chalk.dim("  The AI crew will replace these stubs with source-code-verified documentation."));
    } else {
      console.log(chalk.bold.hex("#6366f1")("  Want AI-powered documentation?"));
      console.log(chalk.bold("  dafke plugin install dafke-docs"));
      console.log(chalk.dim("  Then run /dafke-docs-generate in Claude Code to produce"));
      console.log(chalk.dim("  source-code-verified, quality-reviewed documentation."));
    }
    console.log();
  },
});
