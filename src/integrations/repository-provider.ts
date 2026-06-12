import { GitHubClient, type GitHubConfig } from "./github/client.js";
import { IntegrationError } from "../utils/errors.js";

export interface Repository {
  id: string;
  name: string;
  fullName: string;
  defaultBranch: string;
  cloneUrl: string;
  provider: "github";
}

export interface RepositoryProvider {
  listRepositories(): Promise<Repository[]>;
  getRepository(id: string): Promise<Repository>;
  hasCIPipeline(repoId: string): Promise<boolean>;
  hasBranchProtection(repoId: string, branch: string): Promise<boolean>;
}

export class GitHubRepositoryProvider implements RepositoryProvider {
  private readonly client: GitHubClient;
  private readonly owner?: string;

  constructor(config: GitHubConfig, owner?: string) {
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

export type RepositoryProviderType = "github";

export interface GitHubProviderConfig {
  type: "github";
  config: GitHubConfig;
  owner?: string;
}

export type RepositoryProviderFactoryConfig = GitHubProviderConfig;

export function createRepositoryProvider(options: RepositoryProviderFactoryConfig): RepositoryProvider {
  if (options.type === "github") {
    return new GitHubRepositoryProvider(options.config, options.owner);
  }
  throw new IntegrationError(
    `Unknown repository provider type: ${String((options as { type?: string }).type)}`,
    "RepositoryProvider",
    "Supported types are: github",
  );
}
