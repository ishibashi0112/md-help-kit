import { afterEach, describe, expect, it, vi } from "vitest";
import { devWarn } from "./warn.js";

describe("devWarn", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("開発時は接頭辞を付けて console.warn を出す", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "development");
    devWarn("message");
    expect(warn).toHaveBeenCalledWith("[md-help-kit] message");
  });

  it("本番（NODE_ENV=production）では何も出さない", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "production");
    devWarn("message");
    expect(warn).not.toHaveBeenCalled();
  });
});
