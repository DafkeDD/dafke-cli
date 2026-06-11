import { describe, it, expect, vi, beforeEach } from "vitest";
import { AzureDevOpsClient } from "../../src/integrations/azure-devops/client.js";
import { GitHubClient } from "../../src/integrations/github/client.js";
import { JiraClient } from "../../src/integrations/jira/client.js";
import { ConfluenceClient } from "../../src/integrations/confluence/client.js";
import { SonarQubeClient } from "../../src/integrations/sonarqube/client.js";
import { createRepositoryProvider } from "../../src/integrations/repository-provider.js";

// Helper to mock global fetch with a successful JSON response
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

// Helper to mock a failed fetch (network error)
function mockFetchError(message = "Connection refused") {
  return vi.fn().mockRejectedValue(new Error(message));
}

describe("AzureDevOpsClient", () => {
  let client: AzureDevOpsClient;

  beforeEach(() => {
    client = new AzureDevOpsClient({
      organizationUrl: "https://dev.azure.com/myorg",
      pat: "test-pat-token",
    });
  });

  it("listProjects returns projects", async () => {
    const projects = [
      { id: "1", name: "Project1", state: "wellFormed" },
      { id: "2", name: "Project2", state: "wellFormed" },
    ];
    vi.stubGlobal("fetch", mockFetch({ count: 2, value: projects }));

    const result = await client.listProjects();

    expect(result).toEqual(projects);
    expect(fetch).toHaveBeenCalledWith(
      "https://dev.azure.com/myorg/_apis/projects?api-version=7.1",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("listRepositories returns repos for a project", async () => {
    const repos = [
      {
        id: "repo-1",
        name: "MyRepo",
        defaultBranch: "refs/heads/main",
        remoteUrl: "https://dev.azure.com/myorg/Project1/_git/MyRepo",
        webUrl: "https://dev.azure.com/myorg/Project1/_git/MyRepo",
        project: { id: "1", name: "Project1" },
      },
    ];
    vi.stubGlobal("fetch", mockFetch({ count: 1, value: repos }));

    const result = await client.listRepositories("Project1");

    expect(result).toEqual(repos);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/Project1/_apis/git/repositories"),
      expect.any(Object),
    );
  });

  it("listRepositories without project returns all repos", async () => {
    vi.stubGlobal("fetch", mockFetch({ count: 0, value: [] }));

    await client.listRepositories();

    expect(fetch).toHaveBeenCalledWith(
      "https://dev.azure.com/myorg/_apis/git/repositories?api-version=7.1",
      expect.any(Object),
    );
  });

  it("queryWorkItems sends WIQL POST", async () => {
    const wiqlResponse = { workItems: [{ id: 42, url: "..." }] };
    vi.stubGlobal("fetch", mockFetch(wiqlResponse));

    const result = await client.queryWorkItems("Project1", "SELECT [System.Id] FROM WorkItems");

    expect(result).toEqual(wiqlResponse);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/Project1/_apis/wit/wiql"),
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("testConnection returns true on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ count: 0, value: [] }));

    const result = await client.testConnection();
    expect(result).toBe(true);
  });

  it("testConnection returns false on failure", async () => {
    vi.stubGlobal("fetch", mockFetchError());

    const result = await client.testConnection();
    expect(result).toBe(false);
  });

  it("uses Basic auth with PAT", async () => {
    vi.stubGlobal("fetch", mockFetch({ count: 0, value: [] }));

    await client.listProjects();

    const expectedAuth = `Basic ${Buffer.from(":test-pat-token").toString("base64")}`;
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expectedAuth,
        }),
      }),
    );
  });
});

describe("GitHubClient", () => {
  let client: GitHubClient;

  beforeEach(() => {
    client = new GitHubClient({ token: "ghp_test123" });
  });

  it("listRepositories returns user repos", async () => {
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
    vi.stubGlobal("fetch", mockFetch(repos));

    const result = await client.listRepositories();

    expect(result).toEqual(repos);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/user/repos"),
      expect.any(Object),
    );
  });

  it("listOrgRepositories fetches org repos", async () => {
    vi.stubGlobal("fetch", mockFetch([]));

    await client.listOrgRepositories("my-org");

    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/orgs/my-org/repos"),
      expect.any(Object),
    );
  });

  it("getRepository fetches a specific repo", async () => {
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
    vi.stubGlobal("fetch", mockFetch(repo));

    const result = await client.getRepository("user", "my-repo");

    expect(result).toEqual(repo);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.github.com/repos/user/my-repo",
      expect.any(Object),
    );
  });

  it("testConnection returns true on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ login: "user", id: 1, name: "Test User" }));

    const result = await client.testConnection();
    expect(result).toBe(true);
  });

  it("testConnection returns false on failure", async () => {
    vi.stubGlobal("fetch", mockFetchError());

    const result = await client.testConnection();
    expect(result).toBe(false);
  });

  it("uses Bearer auth with token and GitHub headers", async () => {
    vi.stubGlobal("fetch", mockFetch([]));

    await client.listRepositories();

    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer ghp_test123",
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        }),
      }),
    );
  });
});

describe("JiraClient", () => {
  let client: JiraClient;

  beforeEach(() => {
    client = new JiraClient({
      baseUrl: "https://mycompany.atlassian.net",
      email: "user@example.com",
      apiToken: "jira-api-token",
    });
  });

  it("searchIssues sends POST with JQL", async () => {
    const searchResponse = {
      startAt: 0,
      maxResults: 50,
      total: 1,
      issues: [
        { id: "10001", key: "PROJ-1", self: "...", fields: { summary: "Test issue" } },
      ],
    };
    vi.stubGlobal("fetch", mockFetch(searchResponse));

    const result = await client.searchIssues('project = PROJ AND status = "To Do"');

    expect(result).toEqual(searchResponse);
    expect(fetch).toHaveBeenCalledWith(
      "https://mycompany.atlassian.net/rest/api/3/search",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("getIssue fetches a single issue", async () => {
    const issue = { id: "10001", key: "PROJ-1", self: "...", fields: {} };
    vi.stubGlobal("fetch", mockFetch(issue));

    const result = await client.getIssue("PROJ-1");

    expect(result).toEqual(issue);
    expect(fetch).toHaveBeenCalledWith(
      "https://mycompany.atlassian.net/rest/api/3/issue/PROJ-1",
      expect.any(Object),
    );
  });

  it("addComment sends ADF format body", async () => {
    vi.stubGlobal("fetch", mockFetch({}));

    await client.addComment("PROJ-1", "This is a comment");

    expect(fetch).toHaveBeenCalledWith(
      "https://mycompany.atlassian.net/rest/api/3/issue/PROJ-1/comment",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("This is a comment"),
      }),
    );
  });

  it("transitionIssue sends transition POST", async () => {
    vi.stubGlobal("fetch", mockFetch({}));

    await client.transitionIssue("PROJ-1", "31");

    expect(fetch).toHaveBeenCalledWith(
      "https://mycompany.atlassian.net/rest/api/3/issue/PROJ-1/transitions",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"id":"31"'),
      }),
    );
  });

  it("testConnection returns true on success", async () => {
    vi.stubGlobal(
      "fetch",
      mockFetch({ accountId: "123", displayName: "User", emailAddress: "user@example.com", active: true }),
    );

    const result = await client.testConnection();
    expect(result).toBe(true);
  });

  it("testConnection returns false on failure", async () => {
    vi.stubGlobal("fetch", mockFetchError());

    const result = await client.testConnection();
    expect(result).toBe(false);
  });

  it("uses Basic auth with email:token", async () => {
    vi.stubGlobal("fetch", mockFetch({ startAt: 0, maxResults: 50, total: 0, issues: [] }));

    await client.searchIssues("project = TEST");

    const expectedAuth = `Basic ${Buffer.from("user@example.com:jira-api-token").toString("base64")}`;
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expectedAuth,
        }),
      }),
    );
  });
});

describe("ConfluenceClient", () => {
  let client: ConfluenceClient;

  beforeEach(() => {
    client = new ConfluenceClient({
      baseUrl: "https://mycompany.atlassian.net",
      email: "user@example.com",
      apiToken: "confluence-api-token",
    });
  });

  it("searchPages sends CQL query", async () => {
    const searchResponse = {
      results: [
        {
          content: { id: "123", title: "Test Page", status: "current", spaceId: "SPACE1" },
          title: "Test Page",
          excerpt: "Some content",
        },
      ],
      totalSize: 1,
    };
    vi.stubGlobal("fetch", mockFetch(searchResponse));

    const result = await client.searchPages('type = "page" AND space = "DEV"');

    expect(result).toEqual(searchResponse);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/wiki/api/v2/search?cql="),
      expect.any(Object),
    );
  });

  it("getPage fetches a specific page", async () => {
    const page = { id: "123", title: "Test Page", status: "current", spaceId: "SPACE1" };
    vi.stubGlobal("fetch", mockFetch(page));

    const result = await client.getPage("123");

    expect(result).toEqual(page);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/wiki/api/v2/pages/123"),
      expect.any(Object),
    );
  });

  it("createPage sends POST with body", async () => {
    const newPage = { id: "456", title: "New Page", status: "current", spaceId: "SPACE1" };
    vi.stubGlobal("fetch", mockFetch(newPage));

    const result = await client.createPage("SPACE1", "New Page", "<p>Hello</p>");

    expect(result).toEqual(newPage);
    expect(fetch).toHaveBeenCalledWith(
      "https://mycompany.atlassian.net/wiki/api/v2/pages",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("updatePage sends PUT with version", async () => {
    const updatedPage = {
      id: "123",
      title: "Updated Page",
      status: "current",
      spaceId: "SPACE1",
      version: { number: 3 },
    };
    vi.stubGlobal("fetch", mockFetch(updatedPage));

    const result = await client.updatePage("123", "Updated Page", "<p>Updated</p>", 3);

    expect(result).toEqual(updatedPage);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/wiki/api/v2/pages/123"),
      expect.objectContaining({ method: "PUT" }),
    );
  });

  it("testConnection returns true on success", async () => {
    vi.stubGlobal("fetch", mockFetch({ results: [] }));

    const result = await client.testConnection();
    expect(result).toBe(true);
  });

  it("testConnection returns false on failure", async () => {
    vi.stubGlobal("fetch", mockFetchError());

    const result = await client.testConnection();
    expect(result).toBe(false);
  });
});

describe("SonarQubeClient", () => {
  let client: SonarQubeClient;

  beforeEach(() => {
    client = new SonarQubeClient({
      baseUrl: "https://sonar.example.com",
      token: "sqp_test-token",
    });
  });

  it("getQualityGate returns project status", async () => {
    const gateStatus = {
      projectStatus: {
        status: "OK",
        conditions: [
          {
            status: "OK",
            metricKey: "coverage",
            comparator: "LT",
            errorThreshold: "80",
            actualValue: "85.5",
          },
        ],
      },
    };
    vi.stubGlobal("fetch", mockFetch(gateStatus));

    const result = await client.getQualityGate("my-project");

    expect(result).toEqual(gateStatus);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/qualitygates/project_status?projectKey=my-project"),
      expect.any(Object),
    );
  });

  it("getMeasures returns component measures", async () => {
    const measures = {
      component: {
        key: "my-project",
        name: "My Project",
        measures: [
          { metric: "coverage", value: "85.5" },
          { metric: "bugs", value: "0" },
        ],
      },
    };
    vi.stubGlobal("fetch", mockFetch(measures));

    const result = await client.getMeasures("my-project", ["coverage", "bugs"]);

    expect(result).toEqual(measures);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/measures/component"),
      expect.any(Object),
    );
  });

  it("searchProjects returns matching components", async () => {
    const searchResult = {
      paging: { pageIndex: 1, pageSize: 100, total: 1 },
      components: [{ key: "my-project", name: "My Project", qualifier: "TRK" }],
    };
    vi.stubGlobal("fetch", mockFetch(searchResult));

    const result = await client.searchProjects("my");

    expect(result).toEqual(searchResult);
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/components/search"),
      expect.any(Object),
    );
  });

  it("testConnection returns true when status is UP", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "sonar-1", version: "10.0", status: "UP" }));

    const result = await client.testConnection();
    expect(result).toBe(true);
  });

  it("testConnection returns false when status is not UP", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "sonar-1", version: "10.0", status: "DOWN" }));

    const result = await client.testConnection();
    expect(result).toBe(false);
  });

  it("testConnection returns false on network error", async () => {
    vi.stubGlobal("fetch", mockFetchError());

    const result = await client.testConnection();
    expect(result).toBe(false);
  });

  it("uses Basic auth with token:empty", async () => {
    vi.stubGlobal("fetch", mockFetch({ id: "1", version: "10.0", status: "UP" }));

    await client.testConnection();

    const expectedAuth = `Basic ${Buffer.from("sqp_test-token:").toString("base64")}`;
    expect(fetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expectedAuth,
        }),
      }),
    );
  });
});

describe("createRepositoryProvider", () => {
  it("creates AzureDevOpsRepositoryProvider for azure-devops type", () => {
    const provider = createRepositoryProvider({
      type: "azure-devops",
      config: { organizationUrl: "https://dev.azure.com/myorg", pat: "token" },
      project: "MyProject",
    });

    expect(provider).toBeDefined();
    expect(provider.listRepositories).toBeTypeOf("function");
    expect(provider.getRepository).toBeTypeOf("function");
    expect(provider.hasCIPipeline).toBeTypeOf("function");
    expect(provider.hasBranchProtection).toBeTypeOf("function");
  });

  it("creates GitHubRepositoryProvider for github type", () => {
    const provider = createRepositoryProvider({
      type: "github",
      config: { token: "ghp_test" },
      owner: "my-org",
    });

    expect(provider).toBeDefined();
    expect(provider.listRepositories).toBeTypeOf("function");
    expect(provider.getRepository).toBeTypeOf("function");
    expect(provider.hasCIPipeline).toBeTypeOf("function");
    expect(provider.hasBranchProtection).toBeTypeOf("function");
  });

  it("AzureDevOps provider maps repos correctly", async () => {
    const repos = [
      {
        id: "repo-1",
        name: "MyRepo",
        defaultBranch: "refs/heads/main",
        remoteUrl: "https://dev.azure.com/myorg/Project1/_git/MyRepo",
        webUrl: "https://dev.azure.com/myorg/Project1/_git/MyRepo",
        project: { id: "1", name: "Project1" },
      },
    ];
    vi.stubGlobal("fetch", mockFetch({ count: 1, value: repos }));

    const provider = createRepositoryProvider({
      type: "azure-devops",
      config: { organizationUrl: "https://dev.azure.com/myorg", pat: "token" },
      project: "Project1",
    });

    const result = await provider.listRepositories();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "repo-1",
      name: "MyRepo",
      fullName: "Project1/MyRepo",
      defaultBranch: "main",
      cloneUrl: "https://dev.azure.com/myorg/Project1/_git/MyRepo",
      provider: "azure-devops",
      project: "Project1",
    });
  });

  it("GitHub provider maps repos correctly", async () => {
    const repos = [
      {
        id: 123,
        name: "my-repo",
        full_name: "user/my-repo",
        default_branch: "main",
        clone_url: "https://github.com/user/my-repo.git",
        html_url: "https://github.com/user/my-repo",
        private: false,
        owner: { login: "user" },
      },
    ];
    vi.stubGlobal("fetch", mockFetch(repos));

    const provider = createRepositoryProvider({
      type: "github",
      config: { token: "ghp_test" },
    });

    const result = await provider.listRepositories();

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      id: "123",
      name: "my-repo",
      fullName: "user/my-repo",
      defaultBranch: "main",
      cloneUrl: "https://github.com/user/my-repo.git",
      provider: "github",
    });
  });
});
