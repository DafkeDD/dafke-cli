import { BaseClient } from "../base-client.js";

export interface JiraConfig {
  baseUrl: string; // e.g., https://your-domain.atlassian.net
  email: string;
  apiToken: string;
}

interface JiraIssue {
  id: string;
  key: string;
  self: string;
  fields: Record<string, unknown>;
}

interface JiraSearchResponse {
  startAt: number;
  maxResults: number;
  total: number;
  issues: JiraIssue[];
}

interface JiraTransition {
  id: string;
  name: string;
}

interface JiraTransitionsResponse {
  transitions: JiraTransition[];
}

interface JiraUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
  active: boolean;
}

export class JiraClient extends BaseClient {
  private readonly email: string;
  private readonly apiToken: string;

  constructor(config: JiraConfig) {
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    super(baseUrl, "Jira");
    this.email = config.email;
    this.apiToken = config.apiToken;
  }

  protected getAuthHeaders(): Record<string, string> {
    const encoded = Buffer.from(`${this.email}:${this.apiToken}`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  async searchIssues(jql: string, fields?: string[]): Promise<JiraSearchResponse> {
    return this.request<JiraSearchResponse>("/rest/api/3/search", {
      method: "POST",
      body: {
        jql,
        maxResults: 50,
        fields: fields ?? ["summary", "status", "assignee", "priority", "issuetype"],
      },
    });
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    return this.request<JiraIssue>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}`,
    );
  }

  async getTransitions(issueKey: string): Promise<JiraTransition[]> {
    const response = await this.request<JiraTransitionsResponse>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
    );
    return response.transitions;
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    await this.request<unknown>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/transitions`,
      {
        method: "POST",
        body: {
          transition: { id: transitionId },
        },
      },
    );
  }

  async addComment(issueKey: string, body: string): Promise<void> {
    await this.request<unknown>(
      `/rest/api/3/issue/${encodeURIComponent(issueKey)}/comment`,
      {
        method: "POST",
        body: {
          body: {
            type: "doc",
            version: 1,
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: body }],
              },
            ],
          },
        },
      },
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request<JiraUser>("/rest/api/3/myself");
      return true;
    } catch {
      return false;
    }
  }
}
