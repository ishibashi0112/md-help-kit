// @vitest-environment node
import { describe, expect, it } from "vitest";

// 各入口が window や document のない環境でも読み込めること（SSRで import されても壊れないこと）を確かめる
describe("入口", () => {
  it("DOM のない環境で実行している", () => {
    expect(typeof window).toBe("undefined");
    expect(typeof document).toBe("undefined");
  });

  it.each([
    ["md-help-kit", () => import("./core/index.js")],
    ["md-help-kit/ui", () => import("./ui/index.js")],
    ["md-help-kit/mermaid", () => import("./mermaid/index.js")],
  ])("%s を読み込める", async (_name, load) => {
    await expect(load()).resolves.toBeDefined();
  });
});
