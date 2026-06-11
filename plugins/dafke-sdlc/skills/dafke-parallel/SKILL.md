---
name: dafke-parallel
description: Use when the user wants to execute multiple independent tasks in parallel using git worktrees
category: sdlc
argument-hint: "<plan-file> | --tasks task1,task2,task3"
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Grep
  - Glob
  - Skill
  - Agent
---

# /dafke-parallel

Execute independent tasks in parallel using git worktrees for isolation. Each task runs in its own worktree branch, preventing conflicts between parallel implementations.

## When to Use

- Implementation plan has multiple **independent** steps (no shared state between them)
- Feature development with separate components (e.g., API + UI + tests)
- Multi-file refactoring where changes don't overlap
- Running `dafke resolve` across multiple dimensions simultaneously

## Steps

1. **Load the plan** — Read the specified plan file or accept `--tasks` with comma-separated task descriptions.

2. **Identify independent tasks** — Analyze the plan and group tasks into:
   - **Independent**: Can run in parallel (different files, no shared imports)
   - **Dependent**: Must run sequentially (one task's output is another's input)

3. **Create worktrees** — For each independent task group:
   ```bash
   git worktree add .worktrees/<task-id> -b dafke/<task-id>
   ```
   Each worktree gets a clean copy of the repo on its own branch.

4. **Dispatch agents** — Launch one Agent per independent task:
   - Use `isolation: "worktree"` when available
   - Otherwise, dispatch agents to the worktree directories
   - Each agent works in its isolated worktree
   - Provide full context: task description, relevant file paths, coding standards

5. **Monitor progress** — Track which agents have completed:
   - Update `.dafke/state/parallel-progress.json`
   - Report completion status

6. **Merge results** — Once all parallel tasks complete:
   ```bash
   # For each completed worktree branch:
   git merge dafke/<task-id> --no-ff -m "feat: <task description>"
   ```
   - Resolve any merge conflicts (rare if tasks are truly independent)
   - Run full test suite after merge

7. **Cleanup** — Remove worktrees:
   ```bash
   git worktree remove .worktrees/<task-id>
   git branch -d dafke/<task-id>
   ```

## Example

```
/dafke-parallel .dafke/plans/PROJ-123.md
```

This reads the plan, identifies independent tasks, creates worktrees, dispatches parallel agents, then merges results back.

## Safeguards

- **Never parallelize tasks that modify the same files** — Check file lists before dispatching
- **Always run tests after merge** — Catch integration issues early
- **Limit parallel tasks to 3** — More than 3 concurrent worktrees can strain system resources
- **Cleanup on failure** — If any agent fails, preserve its worktree for debugging but cleanup others

## Progress Tracking

State is persisted in `.dafke/state/parallel-progress.json`:
```json
{
  "planFile": ".dafke/plans/PROJ-123.md",
  "tasks": [
    { "id": "task-1", "branch": "dafke/task-1", "status": "completed", "worktree": ".worktrees/task-1" },
    { "id": "task-2", "branch": "dafke/task-2", "status": "in-progress", "worktree": ".worktrees/task-2" },
    { "id": "task-3", "branch": "dafke/task-3", "status": "pending" }
  ],
  "mergedTasks": ["task-1"],
  "status": "in-progress"
}
```
