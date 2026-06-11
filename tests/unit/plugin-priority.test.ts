import { describe, it, expect } from "vitest";
import {
  prioritizePlugins,
  getPluginReasons,
  RECOMMENDED_PLUGINS,
  type PluginRecommendation,
} from "../../src/core/wizard/steps/step-plugins.js";

describe("prioritizePlugins", () => {
  it("sorts essential before recommended before useful", () => {
    const plugins: PluginRecommendation[] = [
      { name: "useful-a", marketplace: "m", description: "d", priority: "useful" },
      { name: "essential-a", marketplace: "m", description: "d", priority: "essential" },
      { name: "recommended-a", marketplace: "m", description: "d", priority: "recommended" },
      { name: "essential-b", marketplace: "m", description: "d", priority: "essential" },
    ];
    const sorted = prioritizePlugins(plugins, undefined);

    expect(sorted[0]?.priority).toBe("essential");
    expect(sorted[1]?.priority).toBe("essential");
    expect(sorted[2]?.priority).toBe("recommended");
    expect(sorted[3]?.priority).toBe("useful");
  });

  it("preserves relative order within the same priority tier", () => {
    const plugins: PluginRecommendation[] = [
      { name: "c", marketplace: "m", description: "d", priority: "essential" },
      { name: "a", marketplace: "m", description: "d", priority: "essential" },
      { name: "b", marketplace: "m", description: "d", priority: "essential" },
    ];
    const sorted = prioritizePlugins(plugins, undefined);
    // Array.sort is not guaranteed stable in all engines, but Node 12+ is stable.
    expect(sorted.map((p) => p.name)).toEqual(["c", "a", "b"]);
  });

  it("returns empty array when given empty input", () => {
    const sorted = prioritizePlugins([], { review: 1 });
    expect(sorted).toEqual([]);
  });

  it("does not mutate the original array", () => {
    const plugins: PluginRecommendation[] = [
      { name: "b", marketplace: "m", description: "d", priority: "useful" },
      { name: "a", marketplace: "m", description: "d", priority: "essential" },
    ];
    const original = [...plugins];
    prioritizePlugins(plugins, undefined);
    expect(plugins).toEqual(original);
  });
});

describe("getPluginReasons", () => {
  it("returns matching reasons when score is below threshold", () => {
    const plugin: PluginRecommendation = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "recommended",
      relevanceRules: [
        { condition: "low-score", dimension: "review", threshold: 4, reason: "review is weak" },
        { condition: "low-score", dimension: "coverage", threshold: 3, reason: "coverage is low" },
      ],
    };
    const reasons = getPluginReasons(plugin, { review: 2, coverage: 1 });
    expect(reasons).toEqual(["review is weak", "coverage is low"]);
  });

  it("returns empty when all scores meet or exceed thresholds", () => {
    const plugin: PluginRecommendation = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "recommended",
      relevanceRules: [
        { condition: "low-score", dimension: "review", threshold: 3, reason: "review is weak" },
      ],
    };
    const reasons = getPluginReasons(plugin, { review: 3 });
    expect(reasons).toEqual([]);
  });

  it("returns empty when scores are undefined", () => {
    const plugin: PluginRecommendation = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "recommended",
      relevanceRules: [
        { condition: "low-score", dimension: "review", threshold: 3, reason: "review is weak" },
      ],
    };
    expect(getPluginReasons(plugin, undefined)).toEqual([]);
  });

  it("returns empty when plugin has no relevance rules", () => {
    const plugin: PluginRecommendation = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "useful",
    };
    expect(getPluginReasons(plugin, { review: 1 })).toEqual([]);
  });

  it("ignores rules for dimensions not present in scores", () => {
    const plugin: PluginRecommendation = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "recommended",
      relevanceRules: [
        { condition: "low-score", dimension: "nonexistent", threshold: 3, reason: "should not appear" },
      ],
    };
    const reasons = getPluginReasons(plugin, { review: 1 });
    expect(reasons).toEqual([]);
  });

  it("only returns reasons for rules that match, not all", () => {
    const plugin: PluginRecommendation = {
      name: "test",
      marketplace: "m",
      description: "d",
      priority: "recommended",
      relevanceRules: [
        { condition: "low-score", dimension: "review", threshold: 3, reason: "review weak" },
        { condition: "low-score", dimension: "coverage", threshold: 3, reason: "coverage weak" },
      ],
    };
    // review=5 exceeds threshold, coverage=1 is below
    const reasons = getPluginReasons(plugin, { review: 5, coverage: 1 });
    expect(reasons).toEqual(["coverage weak"]);
  });
});

describe("RECOMMENDED_PLUGINS catalogue", () => {
  it("contains 7 plugins with correct priority distribution", () => {
    expect(RECOMMENDED_PLUGINS).toHaveLength(7);
    const essential = RECOMMENDED_PLUGINS.filter((p) => p.priority === "essential");
    const recommended = RECOMMENDED_PLUGINS.filter((p) => p.priority === "recommended");
    const useful = RECOMMENDED_PLUGINS.filter((p) => p.priority === "useful");
    expect(essential).toHaveLength(3);
    expect(recommended).toHaveLength(2);
    expect(useful).toHaveLength(2);
  });
});
