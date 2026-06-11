import type { TechStack } from "../core/config/config-schema.js";
import type { TechnologyAdapter, DetectionResult } from "./adapter-interface.js";
import { TypeScriptAdapter } from "./typescript/adapter.js";

// ---------------------------------------------------------------------------
// AdapterRegistry
// ---------------------------------------------------------------------------

export class AdapterRegistry {
  private adapters: Map<TechStack, TechnologyAdapter> = new Map();

  /** Register an adapter for a given tech stack. */
  register(adapter: TechnologyAdapter): void {
    this.adapters.set(adapter.name, adapter);
  }

  /**
   * Run all adapters' detect() in parallel and return the one with the
   * highest confidence. Returns `null` when no adapter detects anything.
   */
  async detect(
    repoRoot: string,
  ): Promise<{ adapter: TechnologyAdapter; result: DetectionResult } | null> {
    const entries = Array.from(this.adapters.values());

    const results = await Promise.all(
      entries.map(async (adapter) => ({
        adapter,
        result: await adapter.detect(repoRoot),
      })),
    );

    // Filter to detected-only, then pick highest confidence
    const detected = results.filter((r) => r.result.detected);

    if (detected.length === 0) {
      return null;
    }

    detected.sort((a, b) => b.result.confidence - a.result.confidence);
    return detected[0] ?? null;
  }

  /** Get a specific adapter by tech stack name. */
  get(techStack: TechStack): TechnologyAdapter | undefined {
    return this.adapters.get(techStack);
  }

  /** Return all registered adapters. */
  getAll(): TechnologyAdapter[] {
    return Array.from(this.adapters.values());
  }
}

// ---------------------------------------------------------------------------
// Factory — creates a registry pre-loaded with all built-in adapters
// ---------------------------------------------------------------------------

export function createAdapterRegistry(): AdapterRegistry {
  const registry = new AdapterRegistry();
  registry.register(new TypeScriptAdapter());

  return registry;
}
