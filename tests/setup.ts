import { beforeEach, afterEach, vi } from "vitest";

// Deterministic output for test assertions
process.env["FORCE_COLOR"] = "0";
process.env["NODE_ENV"] = "test";

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});
