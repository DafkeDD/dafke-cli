import { writeFileSync, readFileSync, mkdirSync, renameSync, existsSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
// tmpdir removed — write temp files in same dir to avoid EXDEV
import { randomUUID } from "node:crypto";
import { WizardStateSchema, type WizardState, type WizardStep } from "../config/config-schema.js";

export class StateManager {
  private readonly statePath: string;

  constructor(repoRoot: string = process.cwd()) {
    this.statePath = join(repoRoot, ".dafke", "state.json");
  }

  load(): WizardState | null {
    if (!existsSync(this.statePath)) return null;
    const raw = readFileSync(this.statePath, "utf-8");
    const parsed = JSON.parse(raw);
    return WizardStateSchema.parse(parsed);
  }

  save(state: WizardState): void {
    const validated = WizardStateSchema.parse(state);
    const dir = dirname(this.statePath);
    mkdirSync(dir, { recursive: true });
    // Atomic write: temp in same dir to avoid EXDEV cross-device rename
    const tempPath = join(dir, `.tmp-state-${randomUUID()}.json`);
    writeFileSync(tempPath, JSON.stringify(validated, null, 2), "utf-8");
    renameSync(tempPath, this.statePath);
  }

  completeStep(step: WizardStep): void {
    const state = this.load();
    if (!state) throw new Error("No wizard state found. Run 'dafke init' first.");
    if (!state.completedSteps.includes(step)) {
      state.completedSteps.push(step);
    }
    state.lastStep = step;
    this.save(state);
  }

  isStepCompleted(step: WizardStep): boolean {
    const state = this.load();
    return state?.completedSteps.includes(step) ?? false;
  }

  getNextStep(allSteps: readonly WizardStep[]): WizardStep | null {
    const state = this.load();
    const completed = new Set(state?.completedSteps ?? []);
    return allSteps.find((s) => !completed.has(s)) ?? null;
  }

  createFreshState(version: string): WizardState {
    return {
      wizardVersion: version,
      startedAt: new Date().toISOString(),
      completedSteps: [],
      answers: {},
    };
  }

  reset(): void {
    if (existsSync(this.statePath)) unlinkSync(this.statePath);
  }
}
