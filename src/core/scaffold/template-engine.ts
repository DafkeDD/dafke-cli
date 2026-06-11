import { readFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// ---------------------------------------------------------------------------
// TemplateEngine — lightweight Handlebars-style template renderer
// ---------------------------------------------------------------------------

export class TemplateEngine {
  private readonly templatesDir: string;

  constructor(templatesDir?: string) {
    this.templatesDir = templatesDir ?? this.findTemplatesDir();
  }

  /**
   * Render a template by name with variable substitution.
   *
   * Supports:
   *   - `{{variable}}` — simple substitution
   *   - `{{#if variable}}...{{/if}}` — conditional blocks
   *   - `{{#each items}}...{{/each}}` — iteration (item accessible as `{{this}}`)
   */
  render(templateName: string, variables: Record<string, unknown>): string {
    const template = this.getTemplate(templateName);
    return this.renderString(template, variables);
  }

  /**
   * Render a raw template string with variable substitution.
   */
  renderString(template: string, variables: Record<string, unknown>): string {
    let output = template;

    // Process {{#each items}}...{{/each}} blocks
    output = this.processEachBlocks(output, variables);

    // Process {{#if variable}}...{{/if}} blocks
    output = this.processIfBlocks(output, variables);

    // Process {{variable}} substitutions
    output = this.processVariables(output, variables);

    return output;
  }

  /**
   * Load a template file from the templates directory.
   *
   * Override resolution order:
   *   1. `$DAFKE_TEMPLATES_DIR/<name>` — env var override
   *   2. `.dafke/templates/<name>`     — repo-level override
   *   3. Built-in templates directory    — default fallback
   *
   * Throws if the template does not exist in any location.
   */
  getTemplate(name: string): string {
    // Check override locations first
    const envTemplatesDir = process.env["DAFKE_TEMPLATES_DIR"];
    const repoTemplatesDir = join(process.cwd(), ".dafke", "templates");

    const overrideLocations = [
      envTemplatesDir ? { base: envTemplatesDir, path: join(envTemplatesDir, name) } : null,
      { base: repoTemplatesDir, path: join(repoTemplatesDir, name) },
    ].filter((loc): loc is { base: string; path: string } => loc !== null);

    for (const { base, path: overridePath } of overrideLocations) {
      try {
        const resolvedOverride = resolve(overridePath);
        const resolvedBase = resolve(base);
        // Prevent path traversal within each override directory
        if (!resolvedOverride.startsWith(resolvedBase)) {
          continue;
        }
        if (existsSync(resolvedOverride)) {
          return readFileSync(resolvedOverride, "utf-8");
        }
      } catch {
        // Override not found or unreadable, continue to next location
      }
    }

    // Fall through to built-in templates
    const filePath = join(this.templatesDir, name);

    // Prevent path traversal attacks (e.g. name = "../../etc/passwd")
    const resolvedPath = resolve(filePath);
    const resolvedBase = resolve(this.templatesDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error(`Template path traversal detected: ${name}`);
    }

    if (!existsSync(filePath)) {
      throw new Error(`Template not found: ${name} (looked in ${this.templatesDir})`);
    }

    return readFileSync(filePath, "utf-8");
  }

  /**
   * Check if a template exists.
   */
  hasTemplate(name: string): boolean {
    return existsSync(join(this.templatesDir, name));
  }

  // -----------------------------------------------------------------------
  // Private rendering methods
  // -----------------------------------------------------------------------

  private processEachBlocks(
    template: string,
    variables: Record<string, unknown>,
  ): string {
    const eachRegex = /\{\{#each\s+(\w+)\}\}([\s\S]*?)\{\{\/each\}\}/g;

    return template.replace(eachRegex, (_match, key: string, body: string) => {
      const items = variables[key];

      if (!Array.isArray(items) || items.length === 0) {
        return "";
      }

      return items
        .map((item) => {
          if (typeof item === "object" && item !== null) {
            // For object items, merge with parent variables
            const itemVars = { ...variables, ...item as Record<string, unknown>, this: item };
            return this.renderString(body, itemVars);
          }
          // For primitive items, {{this}} substitution
          return body.replace(/\{\{this\}\}/g, String(item));
        })
        .join("");
    });
  }

  private processIfBlocks(
    template: string,
    variables: Record<string, unknown>,
  ): string {
    // Handle {{#if (eq key "value")}}...{{else}}...{{/if}} — equality helper
    const eqIfElseRegex = /\{\{#if\s+\(eq\s+(\w+)\s+"([^"]+)"\)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    let output = template.replace(eqIfElseRegex, (_match, key: string, expected: string, ifBody: string, elseBody: string) => {
      return String(variables[key]) === expected ? ifBody : elseBody;
    });

    // Handle {{#if (eq key "value")}}...{{/if}} — without else
    const eqIfRegex = /\{\{#if\s+\(eq\s+(\w+)\s+"([^"]+)"\)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    output = output.replace(eqIfRegex, (_match, key: string, expected: string, body: string) => {
      return String(variables[key]) === expected ? body : "";
    });

    // Handle {{#if variable}}...{{else}}...{{/if}}
    const ifElseRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{else\}\}([\s\S]*?)\{\{\/if\}\}/g;
    output = output.replace(ifElseRegex, (_match, key: string, ifBody: string, elseBody: string) => {
      const value = variables[key];
      return this.isTruthy(value) ? ifBody : elseBody;
    });

    // Handle {{#if variable}}...{{/if}} (without else)
    const ifRegex = /\{\{#if\s+(\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g;
    output = output.replace(ifRegex, (_match, key: string, body: string) => {
      const value = variables[key];
      return this.isTruthy(value) ? body : "";
    });

    return output;
  }

  private processVariables(
    template: string,
    variables: Record<string, unknown>,
  ): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      const value = variables[key];
      if (value === undefined || value === null) return "";
      return String(value);
    });
  }

  private isTruthy(value: unknown): boolean {
    if (value === undefined || value === null || value === false) return false;
    if (value === 0 || value === "") return false;
    if (Array.isArray(value) && value.length === 0) return false;
    return true;
  }

  private findTemplatesDir(): string {
    // Walk up from the current module to find the templates/ directory.
    // Works for both source (src/core/scaffold/) and bundled (dist/) layouts.
    // We verify the candidate contains known subdirs to avoid matching empty dirs.
    let dir = dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6; i++) {
      const candidate = join(dir, "templates");
      if (existsSync(candidate) && existsSync(join(candidate, "ci"))) {
        return candidate;
      }
      dir = dirname(dir);
    }

    // Fallback: check cwd and node_modules
    const cwdTemplates = join(process.cwd(), "templates");
    if (existsSync(cwdTemplates)) return cwdTemplates;

    const nmTemplates = join(process.cwd(), "node_modules", "dafke", "templates");
    if (existsSync(nmTemplates)) return nmTemplates;

    // Last resort
    return cwdTemplates;
  }
}
