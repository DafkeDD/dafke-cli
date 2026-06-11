---
name: dafke-docs-generate
description: AI-powered documentation generation using a crew of 6 specialized agents with iterative quality review
category: docs
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - TodoWrite
  - Agent
---

# /dafke-docs-generate

Generate comprehensive, source-code-verified documentation using a crew of specialized AI agents.

Inspired by [claude-code-documentation-crew](https://github.com/ssmirnovpro/claude-code-documentation-crew).

## Prerequisites

Run `dafke docs` first to scaffold baseline documentation (`docs/ARCHITECTURE.md`, module stubs, C4 diagrams). This workflow enriches and replaces those stubs with AI-verified content.

## Phase 1 — Workspace Setup

Create the workspace directory structure:

```
.ccdocs/{project-name}/
  analysis/       # Agent analysis outputs
  drafts/         # Document drafts
  diagrams/       # Generated diagrams
  agent-handoffs/ # Agent configuration files
```

## Phase 2 — Code Analysis (Foundation)

Dispatch the `docs-code-analyst` agent to perform C4-enhanced analysis:

```
Agent(subagent_type: "docs-code-analyst", prompt: "Analyze the codebase at {project-path}. Write your analysis to .ccdocs/analysis/code-analysis.md. Include the Implementation Detection Summary with exact field names.")
```

## Phase 3 — Specialist Selection

Read `.ccdocs/analysis/code-analysis.md` and check the Implementation Detection Summary:

- **API Specialist**: Launch if `ENDPOINTS_IMPLEMENTED > 0` OR `API_FRAMEWORKS_DETECTED` is non-empty
- **Security Reviewer**: Launch if `AUTHENTICATION_IMPLEMENTED == true` OR `AUTHORIZATION_LOGIC_FOUND == true`

Launch applicable specialists in parallel.

## Phase 4 — Documentation Draft

Dispatch the `docs-technical-writer` agent:

```
Agent(subagent_type: "docs-technical-writer", prompt: "Read the analysis in .ccdocs/analysis/ and write documentation drafts to .ccdocs/drafts/. Include [DIAGRAM: description] placeholders where visual diagrams would help.")
```

## Phase 5 — Quality Review (Iterative)

Dispatch the `docs-critical-reader` agent to review:

```
Agent(subagent_type: "docs-critical-reader", prompt: "Review the documentation in .ccdocs/drafts/ against the code analysis in .ccdocs/analysis/. Write your review to .ccdocs/analysis/document-review-report.md.")
```

If REQUIRES_CORRECTION: send feedback to technical-writer, re-review. Maximum 2 cycles.

## Phase 6 — Visual Enhancement

If diagrams are needed, dispatch the `docs-doc-diagrammer` agent:

```
Agent(subagent_type: "docs-doc-diagrammer", prompt: "Read .ccdocs/drafts/ and replace all [DIAGRAM: description] placeholders with Mermaid diagrams. Validate syntax before writing.")
```

## Phase 7 — Final Assembly

Copy approved documents from `.ccdocs/drafts/` to `docs/`:
- `ARCHITECTURE.md` — Main architecture document
- `modules/*.md` — Per-module documentation
- `INDEX.md` — Question routing table

## Phase 8 — README Integration

After copying docs to `docs/`, ensure they are discoverable from the repo root:

1. Read `README.md`
2. If it does not contain a `## Documentation` section, append one listing all generated files:
   - Link to `docs/ARCHITECTURE.md`
   - Link to `docs/INDEX.md`
   - Link to `docs/modules/` directory
3. If the section already exists, verify the links are still accurate and update if needed

## Phase 9 — Completion Report

Output a structured summary:
- Documents created (count and paths)
- Specialist agents activated (with rationale)
- Quality review status (approved/cycles needed)
- Diagram count
- README.md updated (yes/no)
