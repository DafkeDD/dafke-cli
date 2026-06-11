import { BaseClient } from "../base-client.js";

export interface AzureDevOpsConfig {
  organizationUrl: string;
  pat: string;
}

interface AzureProject {
  id: string;
  name: string;
  description?: string;
  state: string;
}

interface AzureRepository {
  id: string;
  name: string;
  defaultBranch?: string;
  remoteUrl: string;
  webUrl: string;
  project: {
    id: string;
    name: string;
  };
}

interface AzurePipeline {
  id: number;
  name: string;
  path: string;
  type: string;
}

interface AzureBranchPolicy {
  id: number;
  type: {
    id: string;
    displayName: string;
  };
  isEnabled: boolean;
  isBlocking: boolean;
}

interface AzureWorkItem {
  id: number;
  fields: Record<string, unknown>;
  url: string;
}

interface AzureListResponse<T> {
  count: number;
  value: T[];
}

interface AzureWiqlResponse {
  workItems: Array<{ id: number; url: string }>;
}

export class AzureDevOpsClient extends BaseClient {
  private readonly pat: string;

  constructor(config: AzureDevOpsConfig) {
    const baseUrl = config.organizationUrl.replace(/\/$/, "");
    super(baseUrl, "Azure DevOps");
    this.pat = config.pat;
  }

  protected getAuthHeaders(): Record<string, string> {
    const encoded = Buffer.from(`:${this.pat}`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  async listProjects(): Promise<AzureProject[]> {
    const response = await this.request<AzureListResponse<AzureProject>>(
      "/_apis/projects?api-version=7.1",
    );
    return response.value;
  }

  async listRepositories(project?: string): Promise<AzureRepository[]> {
    const path = project
      ? `/${encodeURIComponent(project)}/_apis/git/repositories?api-version=7.1`
      : "/_apis/git/repositories?api-version=7.1";
    const response = await this.request<AzureListResponse<AzureRepository>>(path);
    return response.value;
  }

  async getRepository(project: string, repoId: string): Promise<AzureRepository> {
    return this.request<AzureRepository>(
      `/${encodeURIComponent(project)}/_apis/git/repositories/${encodeURIComponent(repoId)}?api-version=7.1`,
    );
  }

  async getPipelines(project: string): Promise<AzurePipeline[]> {
    const response = await this.request<AzureListResponse<AzurePipeline>>(
      `/${encodeURIComponent(project)}/_apis/build/definitions?api-version=7.1`,
    );
    return response.value;
  }

  async getBranchPolicies(project: string): Promise<AzureBranchPolicy[]> {
    const response = await this.request<AzureListResponse<AzureBranchPolicy>>(
      `/${encodeURIComponent(project)}/_apis/policy/configurations?api-version=7.1`,
    );
    return response.value;
  }

  async queryWorkItems(project: string, wiql: string): Promise<AzureWiqlResponse> {
    return this.request<AzureWiqlResponse>(
      `/${encodeURIComponent(project)}/_apis/wit/wiql?api-version=7.1`,
      {
        method: "POST",
        body: { query: wiql },
      },
    );
  }

  async getWorkItem(project: string, id: number): Promise<AzureWorkItem> {
    return this.request<AzureWorkItem>(
      `/${encodeURIComponent(project)}/_apis/wit/workitems/${id}?api-version=7.1`,
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.listProjects();
      return true;
    } catch {
      return false;
    }
  }
}
