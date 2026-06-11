export class DafkeError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = true,
    public readonly suggestion?: string,
  ) {
    super(message);
    this.name = "DafkeError";
  }
}

export class ConfigError extends DafkeError {
  constructor(message: string, suggestion?: string) {
    super(message, "CONFIG_ERROR", true, suggestion);
    this.name = "ConfigError";
  }
}

export class StateError extends DafkeError {
  constructor(message: string, suggestion?: string) {
    super(message, "STATE_ERROR", true, suggestion);
    this.name = "StateError";
  }
}

export class IntegrationError extends DafkeError {
  constructor(message: string, service: string, suggestion?: string) {
    super(message, `INTEGRATION_ERROR_${service.toUpperCase()}`, true, suggestion);
    this.name = "IntegrationError";
  }
}

export class AdapterError extends DafkeError {
  constructor(message: string, adapter: string, suggestion?: string) {
    super(message, `ADAPTER_ERROR_${adapter.toUpperCase()}`, true, suggestion);
    this.name = "AdapterError";
  }
}

export class AssessmentError extends DafkeError {
  constructor(message: string, dimension?: string) {
    super(message, `ASSESSMENT_ERROR${dimension ? `_${dimension.toUpperCase()}` : ""}`, true);
    this.name = "AssessmentError";
  }
}

export class ResolveError extends DafkeError {
  constructor(message: string, dimension?: string) {
    super(
      message,
      `RESOLVE_ERROR${dimension ? `_${dimension.toUpperCase()}` : ""}`,
      true,
      dimension ? `Try resolving with --dimension ${dimension} to isolate the issue.` : undefined,
    );
    this.name = "ResolveError";
  }
}
