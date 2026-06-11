/**
 * WizardRunner - Main orchestrator for the 13-step init wizard.
 *
 * Executes steps in order, supports checkpoint-resume via StateManager,
 * and allows skipping individual steps. Each step module is lazy-loaded
 * to keep startup time minimal.
 */

import * as p from "@clack/prompts";
import { StateManager } from "../state/state-manager.js";
import {
  WIZARD_STEPS,
  STEP_LABELS,
  type WizardStepId,
  type WizardStepContext,
  type WizardStepResult,
} from "./wizard-steps.js";
import { printBanner } from "../../utils/banner.js";
import { VERSION } from "../../version.js";

type StepModule = { execute: (ctx: WizardStepContext) => Promise<WizardStepResult> };
type StepLoader = () => Promise<StepModule>;

export interface WizardRunnerOptions {
  resume?: boolean;
  skip?: string;
  nonInteractive?: boolean;
  verbose?: boolean;
  techStack?: string;
}

export class WizardRunner {
  private readonly stateManager: StateManager;
  private readonly repoRoot: string;
  private readonly stepLoaders: Map<WizardStepId, StepLoader>;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.stateManager = new StateManager(repoRoot);

    // Lazy-load step executors so unused steps never get imported
    this.stepLoaders = new Map<WizardStepId, StepLoader>([
      ["auth", () => import("./steps/step-auth.js")],
      ["detect", () => import("./steps/step-detect.js")],
      ["assess", () => import("./steps/step-assess.js")],
      ["external_tools", () => import("./steps/step-external-tools.js")],
      ["claude_md", () => import("./steps/step-claude-md.js")],
      ["rules", () => import("./steps/step-rules.js")],
      ["hooks", () => import("./steps/step-hooks.js")],
      ["plugins", () => import("./steps/step-plugins.js")],
      ["ci", () => import("./steps/step-ci.js")],
      ["coverage", () => import("./steps/step-coverage.js")],
      ["arch", () => import("./steps/step-arch.js")],
      ["connect", () => import("./steps/step-connect.js")],
      ["verify", () => import("./steps/step-verify.js")],
    ]);
  }

  async run(options: WizardRunnerOptions = {}): Promise<void> {
    printBanner(VERSION);
    p.intro("Initializing AI-assisted development");

    // Load or create state
    let state = options.resume ? this.stateManager.load() : null;

    if (state && options.resume) {
      p.log.info(`Resuming from checkpoint (${state.completedSteps.length}/${WIZARD_STEPS.length} steps done)`);
    }

    if (!state) {
      state = this.stateManager.createFreshState(VERSION);
      this.stateManager.save(state);
    }

    const skipSteps = new Set(
      (options.skip ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );

    const ctx: WizardStepContext = {
      repoRoot: this.repoRoot,
      verbose: options.verbose ?? false,
      nonInteractive: options.nonInteractive ?? false,
      answers: state.answers ?? {},
      scores: state.scores ? { ...state.scores } : undefined,
      degradedFeatures: [],
    };

    // Pre-fill tech stack if provided via CLI
    if (options.techStack) {
      ctx.answers["techStack"] = options.techStack;
    }

    // Execute steps in order
    for (const stepId of WIZARD_STEPS) {
      const label = STEP_LABELS[stepId] ?? stepId;
      const stepNum = WIZARD_STEPS.indexOf(stepId) + 1;
      const prefix = `[${stepNum}/${WIZARD_STEPS.length}]`;

      // Skip already-completed steps
      if (state.completedSteps.includes(stepId)) {
        p.log.info(`${prefix} ${label}: already completed, skipping`);
        continue;
      }

      // Skip user-specified steps
      if (skipSteps.has(stepId)) {
        p.log.warn(`${prefix} ${label}: skipped by user`);
        continue;
      }

      const loader = this.stepLoaders.get(stepId);
      if (!loader) {
        p.log.error(`${prefix} ${label}: unknown step, skipping`);
        continue;
      }

      const s = p.spinner();
      s.start(`${prefix} ${label}`);

      try {
        const stepModule = await loader();
        s.stop(`${prefix} ${label}`);

        const result = await stepModule.execute(ctx);

        if (result.success) {
          // Merge step data into context
          if (result.data) {
            Object.assign(ctx.answers, result.data);
          }

          // Persist progress
          state.answers = { ...ctx.answers };
          this.stateManager.save(state);
          this.stateManager.completeStep(stepId);

          // Reload state after completeStep modified it
          const reloaded = this.stateManager.load();
          if (reloaded) state = reloaded;

          p.log.success(`${prefix} ${label}: done`);
        } else {
          p.log.warn(`${prefix} ${label}: ${result.message ?? "failed"}`);

          if (!ctx.nonInteractive) {
            const action = await p.select({
              message: "What would you like to do?",
              options: [
                { value: "retry", label: "Retry this step" },
                { value: "skip", label: "Skip and continue" },
                { value: "abort", label: "Stop wizard (progress is saved)" },
              ],
            });

            if (p.isCancel(action) || action === "abort") {
              p.log.info("Progress saved. Resume with: dafke init --resume");
              return;
            }

            if (action === "retry") {
              // Re-execute the same step by decrementing the loop
              // We use a simple recursive call pattern here
              const retryModule = await loader();
              const retryResult = await retryModule.execute(ctx);
              if (retryResult.success) {
                if (retryResult.data) Object.assign(ctx.answers, retryResult.data);
                state.answers = { ...ctx.answers };
                this.stateManager.save(state);
                this.stateManager.completeStep(stepId);
                const retryReloaded = this.stateManager.load();
                if (retryReloaded) state = retryReloaded;
                p.log.success(`${prefix} ${label}: done (retry)`);
              } else {
                p.log.warn(`${prefix} ${label}: retry also failed, continuing`);
              }
            }
            // "skip" falls through naturally
          }
        }
      } catch (error) {
        s.stop(`${prefix} ${label}: error`);
        p.log.error(`${prefix} ${label}: ${error instanceof Error ? error.message : String(error)}`);

        if (!ctx.nonInteractive) {
          const shouldContinue = await p.confirm({ message: "Continue with remaining steps?" });
          if (p.isCancel(shouldContinue) || !shouldContinue) {
            p.log.info("Progress saved. Resume with: dafke init --resume");
            return;
          }
        }
      }
    }

    p.outro("Setup complete! Run `dafke audit` to check readiness, or `/dafke-help` in Claude Code.");
  }
}
