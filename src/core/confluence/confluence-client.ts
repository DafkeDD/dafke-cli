/**
 * Confluence client — wraps Atlassian MCP tool calls for testability.
 *
 * This is the mockable boundary for /dafke-doc. All Confluence interactions
 * go through this class, making the skill's logic unit-testable without
 * actual Confluence access.
 */

import { IntegrationError } from "../../utils/errors.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PageResult {
  id: string;
  title: string;
  webUrl: string;
}

export interface SearchResult {
  results: PageResult[];
  totalCount: number;
}

export interface PageContent {
  id: string;
  title: string;
  body: string;
}

export interface ConfluenceConfig {
  cloudId: string;
  spaceId: string;
  spaceKey: string;
  rootFolder: { name: string; pageId: string };
  changeLog: { name: string; pageId: string };
  featuresFolder: { name: string; pageId: string };
  bugsFolder: { name: string; pageId: string };
}

// ---------------------------------------------------------------------------
// Retry configuration
// ---------------------------------------------------------------------------

const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

// ---------------------------------------------------------------------------
// ConfluenceClient
// ---------------------------------------------------------------------------

export class ConfluenceClient {
  private readonly config: ConfluenceConfig;

  constructor(config: ConfluenceConfig) {
    this.config = config;
  }

  /**
   * Create a page in Confluence.
   * Retries with exponential backoff on transient failures.
   */
  async createPage(
    _parentId: string,
    _title: string,
    _content: string,
  ): Promise<PageResult> {
    return this.withRetry(async () => {
      // In production, this calls the Atlassian MCP:
      //   mcp__plugin_atlassian_atlassian__createConfluencePage
      // For now, this is a placeholder that will be called via skill orchestration.
      // The actual MCP call is made by the Claude Code skill, not by this TS code.
      throw new IntegrationError(
        "Direct Confluence API not available. Use /dafke-doc skill for MCP-based page creation.",
        "confluence",
        "Run /dafke-doc to create documentation via the Atlassian MCP server.",
      );
    });
  }

  /**
   * Update an existing Confluence page.
   */
  async updatePage(
    _pageId: string,
    _content: string,
  ): Promise<PageResult> {
    return this.withRetry(async () => {
      throw new IntegrationError(
        "Direct Confluence API not available. Use /dafke-doc skill for MCP-based page updates.",
        "confluence",
        "Run /dafke-doc to update documentation via the Atlassian MCP server.",
      );
    });
  }

  /**
   * Search for pages in the configured Confluence space.
   */
  async searchPages(
    _cql: string,
  ): Promise<SearchResult> {
    return this.withRetry(async () => {
      throw new IntegrationError(
        "Direct Confluence API not available. Use /dafke-doc skill for MCP-based search.",
        "confluence",
        "Run /dafke-doc to search documentation via the Atlassian MCP server.",
      );
    });
  }

  /**
   * Get a page by ID.
   */
  async getPage(
    _pageId: string,
  ): Promise<PageContent> {
    return this.withRetry(async () => {
      throw new IntegrationError(
        "Direct Confluence API not available. Use /dafke-doc skill for MCP-based page retrieval.",
        "confluence",
        "Run /dafke-doc to retrieve documentation via the Atlassian MCP server.",
      );
    });
  }

  /**
   * Get the configured space and folder information.
   */
  getConfig(): ConfluenceConfig {
    return { ...this.config };
  }

  // -----------------------------------------------------------------------
  // Private helpers
  // -----------------------------------------------------------------------

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Don't retry IntegrationErrors (they indicate a design issue, not transient failure)
        if (error instanceof IntegrationError) {
          throw error;
        }

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < MAX_RETRIES - 1) {
          const delay = BACKOFF_BASE_MS * Math.pow(2, attempt);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new Error("Retry exhausted");
  }
}

/**
 * Validate a ConfluenceConfig object. Returns error messages for invalid fields.
 */
export function validateConfluenceConfig(
  config: unknown,
): string[] {
  const errors: string[] = [];

  if (!config || typeof config !== "object") {
    return ["Confluence config must be an object"];
  }

  const c = config as Record<string, unknown>;

  if (!c["cloudId"] || typeof c["cloudId"] !== "string") {
    errors.push("Missing or invalid confluence.cloudId");
  }
  if (!c["spaceId"] || typeof c["spaceId"] !== "string") {
    errors.push("Missing or invalid confluence.spaceId");
  }
  if (!c["spaceKey"] || typeof c["spaceKey"] !== "string") {
    errors.push("Missing or invalid confluence.spaceKey");
  }

  const folders = ["rootFolder", "changeLog", "featuresFolder", "bugsFolder"];
  for (const folder of folders) {
    const f = c[folder] as Record<string, unknown> | undefined;
    if (!f || typeof f !== "object") {
      errors.push(`Missing confluence.${folder}`);
    } else {
      if (!f["name"] || typeof f["name"] !== "string") {
        errors.push(`Missing confluence.${folder}.name`);
      }
      if (!f["pageId"] || typeof f["pageId"] !== "string") {
        errors.push(`Missing confluence.${folder}.pageId`);
      }
    }
  }

  return errors;
}
