import { IntegrationError } from "../utils/errors.js";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
}

/** Maximum response body size (10 MB) — prevents OOM from malicious API responses. */
const MAX_RESPONSE_SIZE = 10 * 1024 * 1024;

export abstract class BaseClient {
  constructor(
    protected readonly baseUrl: string,
    protected readonly serviceName: string,
  ) {}

  protected abstract getAuthHeaders(): Record<string, string>;

  protected async request<T>(path: string, options: RequestOptions = {}, retryCount = 0): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), options.timeout ?? 30000);

    try {
      const response = await fetch(url, {
        method: options.method ?? "GET",
        headers: {
          "Content-Type": "application/json",
          ...this.getAuthHeaders(),
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      if (response.status === 429 && retryCount < 2) {
        const retryAfter = Math.min(parseInt(response.headers.get("Retry-After") ?? "5", 10), 60);
        await new Promise((r) => setTimeout(r, retryAfter * 1000));
        return this.request<T>(path, options, retryCount + 1);
      }

      if (!response.ok) {
        const text = await response.text().catch(() => "Unknown error");
        throw new IntegrationError(
          `${this.serviceName} API error: ${response.status} ${response.statusText} - ${text}`,
          this.serviceName,
          `Check your ${this.serviceName} authentication and permissions`,
        );
      }

      // Guard against oversized responses (OOM protection for healthcare systems)
      const contentLength = response.headers.get("Content-Length");
      if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
        throw new IntegrationError(
          `${this.serviceName} response too large: ${contentLength} bytes (max ${MAX_RESPONSE_SIZE})`,
          this.serviceName,
          `The API returned an unexpectedly large response. Contact your ${this.serviceName} administrator.`,
        );
      }

      return (await response.json()) as T;
    } catch (error) {
      if (error instanceof IntegrationError) throw error;
      throw new IntegrationError(
        `Failed to connect to ${this.serviceName}: ${error instanceof Error ? error.message : String(error)}`,
        this.serviceName,
        `Verify your network connection and ${this.serviceName} server URL`,
      );
    } finally {
      clearTimeout(timeoutId);
    }
  }

  abstract testConnection(): Promise<boolean>;
}
