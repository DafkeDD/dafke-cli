import { BaseClient } from "../base-client.js";

export interface ConfluenceConfig {
  baseUrl: string; // e.g., https://your-domain.atlassian.net
  email: string;
  apiToken: string;
}

interface ConfluencePage {
  id: string;
  title: string;
  status: string;
  spaceId: string;
  version?: {
    number: number;
    message?: string;
  };
  body?: {
    storage?: {
      value: string;
      representation: string;
    };
  };
  _links?: {
    webui?: string;
  };
}

interface ConfluenceSearchResponse {
  results: Array<{
    content: ConfluencePage;
    title: string;
    excerpt: string;
  }>;
  totalSize: number;
}

interface ConfluenceSpace {
  id: string;
  key: string;
  name: string;
  type: string;
  status: string;
}

interface ConfluenceSpacesResponse {
  results: ConfluenceSpace[];
}

export class ConfluenceClient extends BaseClient {
  private readonly email: string;
  private readonly apiToken: string;

  constructor(config: ConfluenceConfig) {
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    super(baseUrl, "Confluence");
    this.email = config.email;
    this.apiToken = config.apiToken;
  }

  protected getAuthHeaders(): Record<string, string> {
    const encoded = Buffer.from(`${this.email}:${this.apiToken}`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  async searchPages(cql: string): Promise<ConfluenceSearchResponse> {
    const encodedCql = encodeURIComponent(cql);
    return this.request<ConfluenceSearchResponse>(
      `/wiki/api/v2/search?cql=${encodedCql}&limit=25`,
    );
  }

  async getPage(pageId: string): Promise<ConfluencePage> {
    return this.request<ConfluencePage>(
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}?body-format=storage`,
    );
  }

  async createPage(
    spaceId: string,
    title: string,
    body: string,
    parentId?: string,
  ): Promise<ConfluencePage> {
    const payload: Record<string, unknown> = {
      spaceId,
      title,
      status: "current",
      body: {
        representation: "storage",
        value: body,
      },
    };
    if (parentId) {
      payload["parentId"] = parentId;
    }
    return this.request<ConfluencePage>("/wiki/api/v2/pages", {
      method: "POST",
      body: payload,
    });
  }

  async updatePage(
    pageId: string,
    title: string,
    body: string,
    version: number,
  ): Promise<ConfluencePage> {
    return this.request<ConfluencePage>(
      `/wiki/api/v2/pages/${encodeURIComponent(pageId)}`,
      {
        method: "PUT",
        body: {
          id: pageId,
          title,
          status: "current",
          body: {
            representation: "storage",
            value: body,
          },
          version: {
            number: version,
          },
        },
      },
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request<ConfluenceSpacesResponse>("/wiki/api/v2/spaces?limit=1");
      return true;
    } catch {
      return false;
    }
  }
}
