import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  AzureDevOpsRepositoryProvider,
  GitHubRepositoryProvider,
  createRepositoryProvider,
} from "../../src/integrations/repository-provider.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers(),
  });
}

function mockFetchError(message = "Connection refused") {
  return vi.fn().mockRejectedValue(new Error(message));
}

// ===========================================================================
// AzureDevOpsRepositoryProvider
// ===========================================================================

describe("AzureDevOpsRepositoryProvider", () => {
  const config = { organizationUrl: "https://dev.azure.com/myorg", pat: "test-pat" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("listRepositories", () => {
    it("returns mapped repositories", async () => {
      const repos = [
        {
          id: "repo-1",
          name: "api-service",
          defaultBranch: "refs/heads/main",
          remoteUrl: "https://dev.azure.com/myorg/project/_git/api-service",
          webUrl: "https://dev.azure.com/myorg/project/_git/api-service",
          project: { id: "proj-1", name: "MyProject" },
        },
        {
          id: "repo-2",
          name: "web-app",
          defaultBranch: "refs/heads/develop",
          remoteUrl: "https://dev.azure.com/myorg/project/_git/web-app",
          webUrl: "https://dev.azure.com/myorg/project/_git/web-app",
          project: { id: "proj-1", name: "MyProject" },
        },
      ];

      global.fetch = mockFetch({ value: repos, count: 2 });

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.listRepositories();

      expect(result).toHaveLength(2);
      expect(result[0]?.id).toBe("repo-1");
      expect(result[0]?.name).toBe("api-service");
      expect(result[0]?.fullName).toBe("MyProject/api-service");
      expect(result[0]?.defaultBranch).toBe("main");
      expect(result[0]?.provider).toBe("azure-devops");
      expect(result[0]?.project).toBe("MyProject");
      expect(result[1]?.defaultBranch).toBe("develop");
    });

    it("handles missing defaultBranch", async () => {
      const repos = [
        {
          id: "repo-1",
          name: "new-repo",
          remoteUrl: "https://dev.azure.com/myorg/project/_git/new-repo",
          webUrl: "https://dev.azure.com/myorg/project/_git/new-repo",
          project: { id: "proj-1", name: "MyProject" },
        },
      ];

      global.fetch = mockFetch({ value: repos, count: 1 });

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.listRepositories();

      expect(result[0]?.defaultBranch).toBe("main"); // default
    });
  });

  describe("getRepository", () => {
    it("throws when no project is specified", async () => {
      const provider = new AzureDevOpsRepositoryProvider(config);

      await expect(provider.getRepository("repo-1")).rejects.toThrow(
        "Azure DevOps project is required",
      );
    });

    it("returns a single repository", async () => {
      const repo = {
        id: "repo-1",
        name: "api-service",
        defaultBranch: "refs/heads/main",
        remoteUrl: "https://dev.azure.com/myorg/project/_git/api-service",
        webUrl: "https://dev.azure.com/myorg/project/_git/api-service",
        project: { id: "proj-1", name: "MyProject" },
      };

      global.fetch = mockFetch(repo);

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.getRepository("repo-1");

      expect(result.id).toBe("repo-1");
      expect(result.provider).toBe("azure-devops");
    });
  });

  describe("hasCIPipeline", () => {
    it("returns true when pipelines exist", async () => {
      global.fetch = mockFetch({ value: [{ id: 1, name: "CI", path: "/", type: "build" }], count: 1 });

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.hasCIPipeline("repo-1");

      expect(result).toBe(true);
    });

    it("returns false when no pipelines exist", async () => {
      global.fetch = mockFetch({ value: [], count: 0 });

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.hasCIPipeline("repo-1");

      expect(result).toBe(false);
    });

    it("returns false when no project specified", async () => {
      const provider = new AzureDevOpsRepositoryProvider(config);
      const result = await provider.hasCIPipeline("repo-1");

      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      global.fetch = mockFetchError();

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.hasCIPipeline("repo-1");

      expect(result).toBe(false);
    });
  });

  describe("hasBranchProtection", () => {
    it("returns true when enabled policies exist", async () => {
      const policies = [
        { id: 1, type: { id: "t1", displayName: "Min reviewers" }, isEnabled: true, isBlocking: true },
      ];

      global.fetch = mockFetch({ value: policies, count: 1 });

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.hasBranchProtection("repo-1", "main");

      expect(result).toBe(true);
    });

    it("returns false when no policies are enabled", async () => {
      const policies = [
        { id: 1, type: { id: "t1", displayName: "Policy" }, isEnabled: false, isBlocking: false },
      ];

      global.fetch = mockFetch({ value: policies, count: 1 });

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.hasBranchProtection("repo-1", "main");

      expect(result).toBe(false);
    });

    it("returns false when no project specified", async () => {
      const provider = new AzureDevOpsRepositoryProvider(config);
      const result = await provider.hasBranchProtection("repo-1", "main");

      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      global.fetch = mockFetchError();

      const provider = new AzureDevOpsRepositoryProvider(config, "MyProject");
      const result = await provider.hasBranchProtection("repo-1", "main");

      expect(result).toBe(false);
    });
  });
});

// ===========================================================================
// GitHubRepositoryProvider
// ===========================================================================

describe("GitHubRepositoryProvider", () => {
  const config = { token: "ghp_test-token" };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("listRepositories", () => {
    it("returns user repositories when no owner specified", async () => {
      const repos = [
        {
          id: 1,
          name: "my-repo",
          full_name: "user/my-repo",
          default_branch: "main",
          clone_url: "https://github.com/user/my-repo.git",
          html_url: "https://github.com/user/my-repo",
          private: false,
          owner: { login: "user" },
        },
      ];

      global.fetch = mockFetch(repos);

      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.listRepositories();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("1");
      expect(result[0]?.name).toBe("my-repo");
      expect(result[0]?.fullName).toBe("user/my-repo");
      expect(result[0]?.defaultBranch).toBe("main");
      expect(result[0]?.provider).toBe("github");
    });

    it("returns org repositories when owner specified", async () => {
      const repos = [
        {
          id: 10,
          name: "org-repo",
          full_name: "myorg/org-repo",
          default_branch: "develop",
          clone_url: "https://github.com/myorg/org-repo.git",
          html_url: "https://github.com/myorg/org-repo",
          private: true,
          owner: { login: "myorg" },
        },
      ];

      global.fetch = mockFetch(repos);

      const provider = new GitHubRepositoryProvider(config, "myorg");
      const result = await provider.listRepositories();

      expect(result).toHaveLength(1);
      expect(result[0]?.fullName).toBe("myorg/org-repo");
      expect(result[0]?.defaultBranch).toBe("develop");
    });
  });

  describe("getRepository", () => {
    it("returns a single repository", async () => {
      const repo = {
        id: 1,
        name: "my-repo",
        full_name: "user/my-repo",
        default_branch: "main",
        clone_url: "https://github.com/user/my-repo.git",
        html_url: "https://github.com/user/my-repo",
        private: false,
        owner: { login: "user" },
      };

      global.fetch = mockFetch(repo);

      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.getRepository("user/my-repo");

      expect(result.id).toBe("1");
      expect(result.provider).toBe("github");
    });

    it("throws for invalid repository ID format", async () => {
      const provider = new GitHubRepositoryProvider(config);

      await expect(provider.getRepository("invalid-format")).rejects.toThrow(
        'Invalid GitHub repository ID: "invalid-format"',
      );
    });

    it("throws for empty owner in repo ID", async () => {
      const provider = new GitHubRepositoryProvider(config);

      await expect(provider.getRepository("/my-repo")).rejects.toThrow(
        "Invalid GitHub repository ID",
      );
    });

    it("throws for empty repo name in repo ID", async () => {
      const provider = new GitHubRepositoryProvider(config);

      await expect(provider.getRepository("owner/")).rejects.toThrow(
        "Invalid GitHub repository ID",
      );
    });
  });

  describe("hasCIPipeline", () => {
    it("returns true when workflows exist", async () => {
      global.fetch = mockFetch({
        total_count: 1,
        workflows: [{ id: 1, name: "CI", path: ".github/workflows/ci.yml", state: "active" }],
      });

      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.hasCIPipeline("user/my-repo");

      expect(result).toBe(true);
    });

    it("returns false when no workflows exist", async () => {
      global.fetch = mockFetch({ total_count: 0, workflows: [] });

      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.hasCIPipeline("user/my-repo");

      expect(result).toBe(false);
    });

    it("returns false for invalid repo ID", async () => {
      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.hasCIPipeline("invalid");

      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      global.fetch = mockFetchError();

      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.hasCIPipeline("user/my-repo");

      expect(result).toBe(false);
    });
  });

  describe("hasBranchProtection", () => {
    it("returns true when protection is configured", async () => {
      global.fetch = mockFetch({
        required_status_checks: { strict: true, contexts: ["ci"] },
        enforce_admins: { enabled: true },
        required_pull_request_reviews: { required_approving_review_count: 1 },
      });

      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.hasBranchProtection("user/my-repo", "main");

      expect(result).toBe(true);
    });

    it("returns false when protection is not configured", async () => {
      global.fetch = mockFetch({}, 404);

      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.hasBranchProtection("user/my-repo", "main");

      // When fetch returns 404, the client throws, which is caught and returns false
      expect(result).toBe(false);
    });

    it("returns false for invalid repo ID", async () => {
      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.hasBranchProtection("invalid", "main");

      expect(result).toBe(false);
    });

    it("returns false on error", async () => {
      global.fetch = mockFetchError();

      const provider = new GitHubRepositoryProvider(config);
      const result = await provider.hasBranchProtection("user/my-repo", "main");

      expect(result).toBe(false);
    });
  });
});

// ===========================================================================
// createRepositoryProvider factory
// ===========================================================================

describe("createRepositoryProvider", () => {
  it("creates AzureDevOpsRepositoryProvider", () => {
    const provider = createRepositoryProvider({
      type: "azure-devops",
      config: { organizationUrl: "https://dev.azure.com/org", pat: "token" },
      project: "MyProject",
    });

    expect(provider).toBeInstanceOf(AzureDevOpsRepositoryProvider);
  });

  it("creates GitHubRepositoryProvider", () => {
    const provider = createRepositoryProvider({
      type: "github",
      config: { token: "ghp_token" },
      owner: "myorg",
    });

    expect(provider).toBeInstanceOf(GitHubRepositoryProvider);
  });

  it("creates AzureDevOpsRepositoryProvider without project", () => {
    const provider = createRepositoryProvider({
      type: "azure-devops",
      config: { organizationUrl: "https://dev.azure.com/org", pat: "token" },
    });

    expect(provider).toBeInstanceOf(AzureDevOpsRepositoryProvider);
  });

  it("creates GitHubRepositoryProvider without owner", () => {
    const provider = createRepositoryProvider({
      type: "github",
      config: { token: "ghp_token" },
    });

    expect(provider).toBeInstanceOf(GitHubRepositoryProvider);
  });

  it("throws for unknown provider type", () => {
    expect(() =>
      // @ts-expect-error - testing invalid type
      createRepositoryProvider({ type: "gitlab", config: {} }),
    ).toThrow("Unknown repository provider type");
  });
});
