import { AzureDevOpsClient, type AzureDevOpsConfig } from "./azure-devops/client.js";
import { GitHubClient, type GitHubConfig } from "./github/client.js";
import { IntegrationError } from "../utils/errors.js";

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  cloneUrl: string;
  provider: "azure-devops" | "github";
  project?: string; // Azure DevOps project
}

export interface RepositoryProvider {
  listRepositories(): Promise<Repository[]>;
  getRepository(id: string): Promise<Repository>;
  hasCIPipeline(repoId: string): Promise<boolean>;
  hasBranchProtection(repoId: string, branch: string): Promise<boolean>;
}

export class AzureDevOpsRepositoryProvider implements RepositoryProvider {
  private readonly client: AzureDevOpsClient;
  private readonly defaultProject?: string;

  constructor(
    config: AzureDevOpsConfig,
    private readonly project?: string,
  ) {
    this.client = new AzureDevOpsClient(config);
    this.defaultProject = project;
  }

  async listRepositories(): Promise<Repository[]> {
    const repos = await this.client.listRepositories(this.defaultProject);
    return repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: `${repo.project.name}/${repo.name}`,
      defaultBranch: (repo.defaultBranch ?? "refs/heads/main").replace("refs/heads/", ""),
      cloneUrl: repo.remoteUrl,
      provider: "azure-devops" as const,
      project: repo.project.name,
    }));
  }

  async getRepository(id: string): Promise<Repository> {
    if (!this.defaultProject) {
      throw new IntegrationError(
        "Azure DevOps project is required to get a single repository",
        "Azure DevOps",
        "Provide a project name in the configuration",
      );
    }
    const repo = await this.client.getRepository(this.defaultProject, id);
    return {
      id: repo.id,
      name: repo.name,
      fullName: `${repo.project.name}/${repo.name}`,
      defaultBranch: (repo.defaultBranch ?? "refs/heads/main").replace("refs/heads/", ""),
      cloneUrl: repo.remoteUrl,
      provider: "azure-devops",
      project: repo.project.name,
    };
  }

  async hasCIPipeline(_repoId: string): Promise<boolean> {
    if (!this.defaultProject) return false;
    try {
      const pipelines = await this.client.getPipelines(this.defaultProject);
      return pipelines.length > 0;
    } catch {
      return false;
    }
  }

  async hasBranchProtection(_repoId: string, _branch: string): Promise<boolean> {
    if (!this.defaultProject) return false;
    try {
      const policies = await this.client.getBranchPolicies(this.defaultProject);
      return policies.some((p) => p.isEnabled);
    } catch {
      return false;
    }
  }
}

export class GitHubRepositoryProvider implements RepositoryProvider {
  private readonly client: GitHubClient;
  private readonly owner?: string;

  constructor(
    config: GitHubConfig,
    owner?: string,
  ) {
    this.client = new GitHubClient(config);
    this.owner = owner;
  }

  async listRepositories(): Promise<Repository[]> {
    const repos = this.owner
      ? await this.client.listOrgRepositories(this.owner)
      : await this.client.listRepositories();

    return repos.map((repo) => ({
      id: String(repo.id),
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      cloneUrl: repo.clone_url,
      provider: "github" as const,
    }));
  }

  async getRepository(id: string): Promise<Repository> {
    // id is expected as "owner/repo" format
    const parts = id.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      throw new IntegrationError(
        `Invalid GitHub repository ID: "${id}". Expected "owner/repo" format.`,
        "GitHub",
        'Use the format "owner/repo" for GitHub repository IDs',
      );
    }
    const owner = parts[0] as string;
    const repoName = parts[1] as string;
    const repo = await this.client.getRepository(owner, repoName);
    return {
      id: String(repo.id),
      name: repo.name,
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      cloneUrl: repo.clone_url,
      provider: "github",
    };
  }

  async hasCIPipeline(repoId: string): Promise<boolean> {
    const parts = repoId.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    try {
      const workflows = await this.client.getWorkflows(parts[0], parts[1]);
      return workflows.length > 0;
    } catch {
      return false;
    }
  }

  async hasBranchProtection(repoId: string, branch: string): Promise<boolean> {
    const parts = repoId.split("/");
    if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
    try {
      await this.client.getBranchProtection(parts[0], parts[1], branch);
      return true;
    } catch {
      return false;
    }
  }
}

export type RepositoryProviderType = "azure-devops" | "github";

export interface AzureDevOpsProviderConfig {
  type: "azure-devops";
  config: AzureDevOpsConfig;
  project?: string;
}

export interface GitHubProviderConfig {
  type: "github";
  config: GitHubConfig;
  owner?: string;
}

export type RepositoryProviderFactoryConfig = AzureDevOpsProviderConfig | GitHubProviderConfig;

export function createRepositoryProvider(options: RepositoryProviderFactoryConfig): RepositoryProvider {
  switch (options.type) {
    case "azure-devops":
      return new AzureDevOpsRepositoryProvider(options.config, options.project);
    case "github":
      return new GitHubRepositoryProvider(options.config, options.owner);
    default: {
      const _exhaustive: never = options;
      throw new IntegrationError(
        `Unknown repository provider type: ${String((_exhaustive as RepositoryProviderFactoryConfig).type)}`,
        "RepositoryProvider",
        "Supported types are: azure-devops, github",
      );
    }
  }
}
