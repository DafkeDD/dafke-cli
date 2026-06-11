import { describe, it, expect, vi, beforeEach } from "vitest";
import { IntegrationError } from "../../src/utils/errors.js";
import { BaseClient } from "../../src/integrations/base-client.js";

// Concrete implementation for testing
class TestClient extends BaseClient {
  constructor(baseUrl = "https://api.example.com") {
    super(baseUrl, "TestService");
  }

  protected getAuthHeaders(): Record<string, string> {
    return { Authorization: "Bearer test-token" };
  }

  // Expose protected request method for testing
  async doRequest<T>(path: string, options = {}): Promise<T> {
    return this.request<T>(path, options);
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.request("/health");
      return true;
    } catch {
      return false;
    }
  }
}

function mockFetchResponse(data: unknown, status = 200, headers?: Record<string, string>) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : status === 429 ? "Too Many Requests" : "Error",
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
    headers: new Headers(headers ?? {}),
  });
}

describe("BaseClient", () => {
  let client: TestClient;

  beforeEach(() => {
    client = new TestClient();
  });

  it("makes a successful GET request", async () => {
    const responseData = { id: 1, name: "test" };
    const fetchMock = mockFetchResponse(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.doRequest("/items/1");

    expect(result).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/items/1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
        }),
      }),
    );
  });

  it("makes a successful POST request with body", async () => {
    const requestBody = { name: "new item" };
    const responseData = { id: 2, name: "new item" };
    const fetchMock = mockFetchResponse(responseData);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.doRequest("/items", {
      method: "POST",
      body: requestBody,
    });

    expect(result).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/items",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify(requestBody),
      }),
    );
  });

  it("retries on 429 rate limit response", async () => {
    const responseData = { id: 1 };

    // First call returns 429, second returns 200
    const rateLimitResponse = {
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue("Rate limited"),
      headers: new Headers({ "Retry-After": "0" }), // 0 seconds for fast test
    };
    const successResponse = {
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue(responseData),
      text: vi.fn().mockResolvedValue(JSON.stringify(responseData)),
      headers: new Headers(),
    };

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(rateLimitResponse)
      .mockResolvedValueOnce(successResponse);
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.doRequest("/items");

    expect(result).toEqual(responseData);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("handles network errors", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.doRequest("/items")).rejects.toThrow(IntegrationError);
    await expect(client.doRequest("/items")).rejects.toThrow("Failed to connect to TestService");
  });

  it("handles timeout via AbortController", async () => {
    const abortError = new DOMException("The operation was aborted", "AbortError");
    const fetchMock = vi.fn().mockRejectedValue(abortError);
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.doRequest("/items", { timeout: 100 })).rejects.toThrow(IntegrationError);
    await expect(client.doRequest("/items", { timeout: 100 })).rejects.toThrow(
      "Failed to connect to TestService",
    );
  });

  it("throws IntegrationError on non-200 response", async () => {
    const fetchMock = mockFetchResponse({ error: "Not Found" }, 404);
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.doRequest("/items/999")).rejects.toThrow(IntegrationError);
    await expect(client.doRequest("/items/999")).rejects.toThrow("TestService API error: 404");
  });

  it("merges custom headers with auth and content-type headers", async () => {
    const responseData = { ok: true };
    const fetchMock = mockFetchResponse(responseData);
    vi.stubGlobal("fetch", fetchMock);

    await client.doRequest("/items", {
      headers: { "X-Custom": "value" },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.example.com/items",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          Authorization: "Bearer test-token",
          "X-Custom": "value",
        }),
      }),
    );
  });

  it("rejects responses exceeding size limit", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue({}),
      text: vi.fn().mockResolvedValue(""),
      headers: new Headers({ "Content-Length": "20000000" }), // 20MB > 10MB limit
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(client.doRequest("/huge")).rejects.toThrow(IntegrationError);
    await expect(client.doRequest("/huge")).rejects.toThrow("response too large");
  });

  it("allows responses within size limit", async () => {
    const responseData = { ok: true };
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: vi.fn().mockResolvedValue(responseData),
      text: vi.fn().mockResolvedValue(JSON.stringify(responseData)),
      headers: new Headers({ "Content-Length": "1000" }), // 1KB < 10MB limit
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.doRequest("/small");
    expect(result).toEqual(responseData);
  });

  it("includes auth headers in every request", async () => {
    const fetchMock = mockFetchResponse({ ok: true });
    vi.stubGlobal("fetch", fetchMock);

    await client.doRequest("/first");
    await client.doRequest("/second");

    const calls = fetchMock.mock.calls;
    expect(calls).toHaveLength(2);
    for (const call of calls) {
      expect(call[1].headers).toHaveProperty("Authorization", "Bearer test-token");
    }
  });

  it("testConnection returns true on success", async () => {
    const fetchMock = mockFetchResponse({ status: "ok" });
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.testConnection();
    expect(result).toBe(true);
  });

  it("testConnection returns false on failure", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("connection refused"));
    vi.stubGlobal("fetch", fetchMock);

    const result = await client.testConnection();
    expect(result).toBe(false);
  });
});
