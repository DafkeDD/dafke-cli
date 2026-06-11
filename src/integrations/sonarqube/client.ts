import { BaseClient } from "../base-client.js";

export interface SonarQubeConfig {
  baseUrl: string; // e.g., https://sonarqube.example.com
  token: string;
}

interface SonarQubeQualityGateStatus {
  projectStatus: {
    status: "OK" | "WARN" | "ERROR" | "NONE";
    conditions: Array<{
      status: string;
      metricKey: string;
      comparator: string;
      errorThreshold: string;
      actualValue: string;
    }>;
  };
}

interface SonarQubeMeasure {
  metric: string;
  value: string;
}

interface SonarQubeMeasuresResponse {
  component: {
    key: string;
    name: string;
    measures: SonarQubeMeasure[];
  };
}

interface SonarQubeComponent {
  key: string;
  name: string;
  qualifier: string;
  project?: string;
}

interface SonarQubeComponentSearchResponse {
  paging: {
    pageIndex: number;
    pageSize: number;
    total: number;
  };
  components: SonarQubeComponent[];
}

interface SonarQubeSystemStatus {
  id: string;
  version: string;
  status: string;
}

export class SonarQubeClient extends BaseClient {
  private readonly token: string;

  constructor(config: SonarQubeConfig) {
    const baseUrl = config.baseUrl.replace(/\/$/, "");
    super(baseUrl, "SonarQube");
    this.token = config.token;
  }

  protected getAuthHeaders(): Record<string, string> {
    const encoded = Buffer.from(`${this.token}:`).toString("base64");
    return {
      Authorization: `Basic ${encoded}`,
    };
  }

  async getQualityGate(projectKey: string): Promise<SonarQubeQualityGateStatus> {
    return this.request<SonarQubeQualityGateStatus>(
      `/api/qualitygates/project_status?projectKey=${encodeURIComponent(projectKey)}`,
    );
  }

  async getMeasures(projectKey: string, metrics: string[]): Promise<SonarQubeMeasuresResponse> {
    const metricKeys = metrics.join(",");
    return this.request<SonarQubeMeasuresResponse>(
      `/api/measures/component?component=${encodeURIComponent(projectKey)}&metricKeys=${encodeURIComponent(metricKeys)}`,
    );
  }

  async searchProjects(query?: string): Promise<SonarQubeComponentSearchResponse> {
    const params = new URLSearchParams({ qualifiers: "TRK" });
    if (query) {
      params.set("q", query);
    }
    return this.request<SonarQubeComponentSearchResponse>(
      `/api/components/search?${params.toString()}`,
    );
  }

  async testConnection(): Promise<boolean> {
    try {
      const status = await this.request<SonarQubeSystemStatus>("/api/system/status");
      return status.status === "UP";
    } catch {
      return false;
    }
  }
}
