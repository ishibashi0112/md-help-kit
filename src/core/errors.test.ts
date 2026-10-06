import { describe, expect, it } from "vitest";
import { HelpLoadError, HelpNotFoundError } from "./errors.js";

describe("HelpNotFoundError", () => {
  it("ページIDと文言を持つ", () => {
    const error = new HelpNotFoundError("stock/colors");
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("HelpNotFoundError");
    expect(error.pageId).toBe("stock/colors");
    expect(error.message).toBe('Help page "stock/colors" was not found.');
  });

  it("目次のときは _index.md と書く", () => {
    expect(new HelpNotFoundError("_index").message).toBe(
      "The help index (_index.md) was not found.",
    );
  });
});

describe("HelpLoadError", () => {
  it("ページID、HTTP のステータス、元のエラーを持つ", () => {
    const cause = new TypeError("Failed to fetch");
    const error = new HelpLoadError("orders", { status: 500, cause });
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe("HelpLoadError");
    expect(error.pageId).toBe("orders");
    expect(error.status).toBe(500);
    expect(error.cause).toBe(cause);
    expect(error.message).toBe('Failed to load help page "orders" (HTTP 500).');
  });

  it("ステータスがなければ undefined で、文言にも書かない", () => {
    const error = new HelpLoadError("_index");
    expect(error.status).toBeUndefined();
    expect(error.message).toBe("Failed to load the help index (_index.md).");
  });

  it("理由や対処の案内を文言の末尾に付けられる", () => {
    expect(new HelpLoadError("orders", { detail: "check the path" }).message).toBe(
      'Failed to load help page "orders": check the path',
    );
  });
});
