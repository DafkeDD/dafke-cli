import { BaseClient } from "../base-client.js";

export interface GitHubConfig {
  token: string;
  baseUrl?: string; // For GitHub Enterprise, defaults to https://api.github.com
}

interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  default_branch: string;
  clone_url: string;
  html_url: string;
  private: boolean;
  owner: {
    login: string;
  };
}

interface GitHubUser {
  login: string;
  id: number;
  name: string | null;
}

interface GitHubWorkflow {
  id: number;
  name: string;
  path: string;
  state: string;
}

interface GitHubWorkflowsResponse {
  total_count: number;
  workflows: GitHubWorkflow[];
}

interface GitHubBranchProtection {
  required_status_checks: {
    strict: boolean;
    contexts: string[];
  } | null;
  enforce_admins: {
    enabled: boolean;
  };
  required_pull_request_reviews: {
    required_approving_review_count: number;
  } | null;
}

export class GitHubClient extends BaseClient {
  private readonly token: string;

  constructor(config: GitHubConfig) {
    const baseUrl = (config.baseUrl ?? "https://api.github.com").replace(/\/$/, "");
    super(baseUrl, "GitHub");
    this.token = config.token;
  }

  protected getAuthHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async listRepositories(): Promise<GitHubRepository[]> {
    return this.request<GitHubRepository[]>("/user/repos?per_page=100&sort=updated");
  }

  async listOrgRepositories(org: string): Promise<GitHubRepository[]> {
    return this.request<GitHubRepository[]>(
      `/orgs/${encodeURIComponent(org)}/repos?per_page=100&sort=updated`,
    );
  }

  async getRepository(owner: string, repo: string): Promise<GitHubRepository> {
    return this.request<GitHubRepository>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
    );
  }

  async getWorkflows(owner: string, repo: string): Promise<GitHubWorkflow[]> {
    const response = await this.request<GitHubWorkflowsResponse>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows`,
    );
    return response.workflows;
  }

  async getBranchProtection(
    owner: string,
    repo: string,
    branch: string,
  ): Promise<GitHubBranchProtection> {
    return this.request<GitHubBranchProtection>(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches/${encodeURIComponent(branch)}/protection`,
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request<GitHubUser>("/user");
      return true;
    } catch {
      return false;
    }
  }
}
