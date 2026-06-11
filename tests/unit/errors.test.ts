import { describe, it, expect } from "vitest";
import {
  DafkeError,
  ConfigError,
  StateError,
  IntegrationError,
  AdapterError,
  AssessmentError,
  ResolveError,
} from "../../src/utils/errors.js";

describe("DafkeError", () => {
  it("has correct code, recoverable, and suggestion", () => {
    const err = new DafkeError("something broke", "TEST_CODE", false, "try again");

    expect(err.message).toBe("something broke");
    expect(err.code).toBe("TEST_CODE");
    expect(err.recoverable).toBe(false);
    expect(err.suggestion).toBe("try again");
    expect(err.name).toBe("DafkeError");
  });

  it("defaults recoverable to true", () => {
    const err = new DafkeError("oops", "CODE");
    expect(err.recoverable).toBe(true);
  });

  it("is an instance of Error", () => {
    const err = new DafkeError("msg", "CODE");
    expect(err).toBeInstanceOf(Error);
  });
});

describe("ConfigError", () => {
  it("has correct name and code", () => {
    const err = new ConfigError("bad config", "check your yaml");

    expect(err.name).toBe("ConfigError");
    expect(err.code).toBe("CONFIG_ERROR");
    expect(err.recoverable).toBe(true);
    expect(err.suggestion).toBe("check your yaml");
  });

  it("is an instance of DafkeError and Error", () => {
    const err = new ConfigError("bad config");
    expect(err).toBeInstanceOf(DafkeError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("StateError", () => {
  it("has correct name and code", () => {
    const err = new StateError("corrupted state", "re-run init");

    expect(err.name).toBe("StateError");
    expect(err.code).toBe("STATE_ERROR");
    expect(err.recoverable).toBe(true);
    expect(err.suggestion).toBe("re-run init");
  });

  it("is an instance of DafkeError and Error", () => {
    const err = new StateError("bad state");
    expect(err).toBeInstanceOf(DafkeError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("IntegrationError", () => {
  it("includes service name in code", () => {
    const err = new IntegrationError("API failed", "sonarqube", "check token");

    expect(err.name).toBe("IntegrationError");
    expect(err.code).toBe("INTEGRATION_ERROR_SONARQUBE");
    expect(err.recoverable).toBe(true);
    expect(err.suggestion).toBe("check token");
  });

  it("uppercases service name in code", () => {
    const err = new IntegrationError("fail", "azure-devops");
    expect(err.code).toBe("INTEGRATION_ERROR_AZURE-DEVOPS");
  });

  it("is an instance of DafkeError and Error", () => {
    const err = new IntegrationError("fail", "github");
    expect(err).toBeInstanceOf(DafkeError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("AdapterError", () => {
  it("includes adapter name in code", () => {
    const err = new AdapterError("adapter failed", "delphi", "install delphi plugin");

    expect(err.name).toBe("AdapterError");
    expect(err.code).toBe("ADAPTER_ERROR_DELPHI");
    expect(err.recoverable).toBe(true);
    expect(err.suggestion).toBe("install delphi plugin");
  });

  it("uppercases adapter name in code", () => {
    const err = new AdapterError("fail", "foxpro");
    expect(err.code).toBe("ADAPTER_ERROR_FOXPRO");
  });

  it("is an instance of DafkeError and Error", () => {
    const err = new AdapterError("fail", "java");
    expect(err).toBeInstanceOf(DafkeError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("AssessmentError", () => {
  it("includes dimension in code when provided", () => {
    const err = new AssessmentError("score invalid", "cicd");

    expect(err.name).toBe("AssessmentError");
    expect(err.code).toBe("ASSESSMENT_ERROR_CICD");
    expect(err.recoverable).toBe(true);
  });

  it("omits dimension from code when not provided", () => {
    const err = new AssessmentError("general failure");
    expect(err.code).toBe("ASSESSMENT_ERROR");
  });

  it("is an instance of DafkeError and Error", () => {
    const err = new AssessmentError("fail");
    expect(err).toBeInstanceOf(DafkeError);
    expect(err).toBeInstanceOf(Error);
  });
});

describe("ResolveError", () => {
  it("has correct name", () => {
    const err = new ResolveError("resolve failed");
    expect(err.name).toBe("ResolveError");
  });

  it("includes dimension in code when provided", () => {
    const err = new ResolveError("resolve failed", "cicd");
    expect(err.code).toBe("RESOLVE_ERROR_CICD");
  });

  it("omits dimension from code when not provided", () => {
    const err = new ResolveError("general failure");
    expect(err.code).toBe("RESOLVE_ERROR");
  });

  it("has suggestion when dimension is provided", () => {
    const err = new ResolveError("resolve failed", "cicd");
    expect(err.suggestion).toBe("Try resolving with --dimension cicd to isolate the issue.");
  });

  it("has no suggestion when dimension is not provided", () => {
    const err = new ResolveError("general failure");
    expect(err.suggestion).toBeUndefined();
  });

  it("is an instance of DafkeError and Error", () => {
    const err = new ResolveError("fail");
    expect(err).toBeInstanceOf(DafkeError);
    expect(err).toBeInstanceOf(Error);
  });
});
