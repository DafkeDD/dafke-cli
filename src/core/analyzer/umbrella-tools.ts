/**
 * Umbrella security tools — platforms that cover multiple security categories
 * from a single product. Used by the SecurityAnalyzer to expand declarations
 * and by the wizard to generate accurate manifest entries.
 */

/** Security categories that a tool can cover. */
export type SecurityCategory = "sast" | "secrets" | "sca" | "dast" | "sbom";

/** All valid security categories, for iteration and validation. */
export const ALL_SECURITY_CATEGORIES: readonly SecurityCategory[] = [
  "sast",
  "secrets",
  "sca",
  "dast",
  "sbom",
] as const;

/**
 * Maps umbrella tool names (lowercase) to the security categories they cover.
 * Used to expand a single tool declaration into multiple category signals.
 *
 * Note: Aikido and similar platforms sell modules separately. The wizard asks
 * users which modules are active — this map defines the maximum coverage.
 */
export const SECURITY_UMBRELLA_TOOLS: Readonly<Record<string, readonly SecurityCategory[]>> = {
  aikido: ["sast", "secrets", "sca", "dast", "sbom"],
  fortify: ["sast", "dast"],
  veracode: ["sast", "sca", "dast"],
  checkmarx: ["sast", "sca", "dast"],
};
