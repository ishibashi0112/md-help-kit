import { describe, expect, it } from "vitest";
import { classifyLink, isValidPageId } from "./links.js";

describe("isValidPageId", () => {
  it.each(["orders", "stock/colors", "設定/画面 一覧", "_index", "a.b"])("%j は使える", (id) => {
    expect(isValidPageId(id)).toBe(true);
  });

  it.each(["", "/orders", "orders/", "stock//colors", ".", "./orders", "..", "../secret", "stock/../x"])(
    "%j は使えない",
    (id) => {
      expect(isValidPageId(id)).toBe(false);
    },
  );
});

describe("classifyLink", () => {
  describe("ページへのリンク", () => {
    it("現在のページのディレクトリからの相対パスで解決する", () => {
      expect(classifyLink("./stock.md", "orders")).toEqual({ type: "page", target: "stock" });
      expect(classifyLink("stock/colors.md#赤", "orders")).toEqual({
        type: "page",
        target: "stock/colors#赤",
      });
      expect(classifyLink("colors.md", "stock/index")).toEqual({
        type: "page",
        target: "stock/colors",
      });
      expect(classifyLink("../orders.md", "stock/colors")).toEqual({
        type: "page",
        target: "orders",
      });
    });

    it("/ で始まるパスは docs ルートから解決する", () => {
      expect(classifyLink("/orders.md", "stock/colors")).toEqual({
        type: "page",
        target: "orders",
      });
    });

    it("パスと # の後ろの %xx をデコードする", () => {
      expect(classifyLink("stock%20list.md#%E8%B5%A4", "orders")).toEqual({
        type: "page",
        target: "stock list#赤",
      });
    });

    it("# の後ろが空なら見出しを付けない", () => {
      expect(classifyLink("stock.md#", "orders")).toEqual({ type: "page", target: "stock" });
    });
  });

  it("# で始まるリンクは同じページ内の見出しにする", () => {
    expect(classifyLink("#一括更新", "orders")).toEqual({ type: "anchor", headingId: "一括更新" });
    expect(classifyLink("#%E8%B5%A4", "orders")).toEqual({ type: "anchor", headingId: "赤" });
  });

  it("http、https、mailto は外部リンクにする（大文字小文字を問わない）", () => {
    for (const href of ["http://example.com", "https://example.com/a.md", "mailto:a@example.com", "HTTPS://EXAMPLE.COM"]) {
      expect(classifyLink(href, "orders")).toEqual({ type: "external", href });
    }
  });

  it("それ以外は通常のリンクにする", () => {
    for (const href of [
      "",
      "#",
      "tel:0120000000",
      "ftp://example.com/a.md",
      "//example.com/a.md",
      "img/filter.png",
      "orders.MD",
      "orders.md?x=1",
      ".md",
      "stock/",
      "../../orders.md",
      "%E0%A4%A.md",
      "a%2Fb.md",
      "a%23b.md",
    ]) {
      expect(classifyLink(href, "stock/colors")).toEqual({ type: "other", href });
    }
  });
});
