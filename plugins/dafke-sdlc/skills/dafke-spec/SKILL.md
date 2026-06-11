---
name: dafke-spec
description: Use when the user wants to generate a specification from a user story, create formal requirements, or document acceptance criteria
category: sdlc
argument-hint: "<story-id>"
allowed-tools:
  - Bash
  - Read
  - Write
  - Grep
  - Glob
  - Skill
---

# /dafke-spec

Generate a formal specification from a user story using the spec-kit methodology.

## Steps

1. **Validate argument** — Story ID is required. If missing, ask and stop.

2. **Fetch the story** — Use `/dafke-story <ID>` to get title, description, and acceptance criteria.

3. **Analyze the domain** — Explore the codebase for context:
   - Existing specs in `docs/specs/` or `.dafke/specs/`.
   - Related code modules and their current behavior.
   - Existing tests that define current behavior.
   - API contracts (OpenAPI, GraphQL schema, etc.).

4. **Generate specification** — Write to `.dafke/specs/<story-id>.md`:
   ```markdown
   # Spec: <STORY-ID> — <Title>
   Generated: <date> | Source: <provider> <story-id>

   ## Context
   <Why this change is needed, business justification>

   ## Requirements
   ### Functional
   - FR1: <requirement derived from AC>
   - FR2: ...

   ### Non-Functional
   - NFR1: Performance — response time < Xms
   - NFR2: Security — input validation on all fields

   ## Behavior Specification
   ### Scenario 1: <Happy path>
   - Given: <precondition>
   - When: <action>
   - Then: <expected outcome>

   ### Scenario 2: <Error case>
   - Given: <precondition>
   - When: <invalid action>
   - Then: <error handling>

   ## API Contract (if applicable)
   <endpoint, request/response schema>

   ## Data Model Changes (if applicable)
   <new fields, migrations>

   ## Dependencies
   - Upstream: <services/modules this depends on>
   - Downstream: <services/modules that depend on this>

   ## Out of Scope
   <explicitly excluded items>

   ## Open Questions
   - <anything that needs clarification>
   ```

5. **Cross-reference** — Verify spec covers all acceptance criteria from the story.
   - Map each AC to at least one scenario.
   - Flag any AC not covered.
   - Flag any scenario not traceable to an AC (scope creep risk).

6. **Present** — Display the spec and ask for review/approval.

## Error Handling

- Story has vague ACs: generate spec with best effort, flag open questions prominently.
- Conflicting requirements detected: list conflicts explicitly in Open Questions.
