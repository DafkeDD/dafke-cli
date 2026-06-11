---
name: dafke-arch
description: Use when the user wants to generate architecture documentation, create diagrams, or document the codebase structure
category: docs
argument-hint: "[--skip gitnexus,graphify,typedoc,deps] [--update]"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Agent
---

# /dafke-arch

Generate a comprehensive architecture documentation forest for the project. This produces documentation optimized for both human developers and AI coding assistants, reducing search blasts and hallucinations during Claude Code sessions.

## What It Generates

```
docs/
  ARCHITECTURE.md          — Master document: Mermaid C4 diagrams, module map, data flows, risk assessment
  INDEX.md                 — Routing table: "question → file" lookup for instant navigation
  modules/*.md             — Per-module deep dives with API, dependencies, usage examples
  diagrams/*.mmd           — Mermaid source files (version-controlled, diffable)
  api/                     — TypeScript API reference (TypeDoc) — TS projects only
.gitnexus/wiki/            — GitNexus-generated module wiki pages
graphify-out/              — Interactive knowledge graph visualization
```

## Quick Start

```bash
# Full documentation generation (all layers)
dafke docs

# Preview what would be generated
dafke docs --dry-run

# Skip slow layers for faster refresh
dafke docs --skip graphify,typedoc

# Incremental update (only changed modules)
dafke docs --update

# JSON output for tooling
dafke docs --format json
```

## Documentation Pipeline (5 Layers)

### Layer 1: GitNexus — Code Intelligence Foundation
- Indexes the full codebase into a knowledge graph
- Generates per-module wiki pages (requires LLM API key)
- Provides: symbol count, relationship count, cluster count, execution flows

### Layer 2: Dependency Analysis
- Circular dependency detection via madge
- Dependency graph as Mermaid diagram
- Coupling metrics: fan-in, fan-out, instability per module
- Risk assessment based on coupling patterns

### Layer 3: Graphify — Knowledge Graph
- Builds interactive HTML visualization of codebase concepts
- Community detection for identifying module boundaries
- Generates `GRAPH_REPORT.md` audit report
- GraphRAG-ready JSON export

### Layer 4: API Reference
- TypeDoc for TypeScript projects
- XML docs for .NET projects
- Javadoc for Java projects

### Layer 5: Documentation Assembly
- Generates `ARCHITECTURE.md` with all findings + Mermaid diagrams
- Generates `INDEX.md` routing table for instant lookup
- Updates `CLAUDE.md` with documentation references
- Updates `README.md` with documentation links

## Agent Team

The documentation is produced by 4 specialized agents in the dafke-docs plugin:

| Agent | Role |
|-------|------|
| `doc-team-architect` | Architecture analysis, Mermaid C4 diagrams |
| `doc-team-module-documenter` | Per-module documentation from GitNexus clusters |
| `doc-team-dependency-mapper` | Dependency graphs, coupling metrics, risk |
| `doc-team-index-builder` | Routing table, CLAUDE.md/README updates |

## Keeping Docs Fresh

- **SessionStart hook**: warns if `ARCHITECTURE.md` is >7 days old
- **PostToolUse hook**: GitNexus auto-reindexes after `git commit`/`git merge`
- **Pre-PR**: include `dafke docs` in your CI pipeline
- **Periodic**: run `dafke docs --update` weekly or after major refactoring

## Why This Matters

Comprehensive architecture documentation is a **prerequisite for teams adopting AI-assisted development**:

1. **Reduces hallucinations** — Claude Code reads ARCHITECTURE.md before modifying code, understanding boundaries and patterns
2. **Eliminates search blasts** — INDEX.md routing table directs to the right file instantly
3. **Builds trust** — Teams can verify AI understands their architecture before granting autonomy
4. **Speeds up onboarding** — New developers (human or AI) productive in hours, not weeks
5. **Mermaid = token-efficient** — 3-6x fewer tokens than prose descriptions, better for LLM context windows
