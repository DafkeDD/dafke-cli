export { ConfigManager } from "./core/config/config-manager.js";
export { StateManager } from "./core/state/state-manager.js";
export { AdapterRegistry, createAdapterRegistry } from "./adapters/adapter-registry.js";
export { AssessmentEngine } from "./core/analyzer/assessment-engine.js";
export { WizardRunner } from "./core/wizard/wizard-runner.js";
export { printBanner, printCompactBanner } from "./utils/banner.js";
export { VERSION } from "./version.js";

// Types
export type { GlobalConfig, RepoManifest, WizardState, TechStack, Wave, ReadinessScores } from "./core/config/config-schema.js";
export type { TechnologyAdapter, DetectionResult, AnalysisResult } from "./adapters/adapter-interface.js";
export type { AssessmentResult, ImprovementAction } from "./core/analyzer/assessment-engine.js";
export type { DimensionResult } from "./core/analyzer/dimension-analyzer.js";
