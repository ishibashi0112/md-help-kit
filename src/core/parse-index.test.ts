import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { parseIndex } from "./parse-index.js";

describe("parseIndex", () => {
  let warn: MockInstance<typeof console.warn>;
  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("3.1節の例を目次ツリーにする", () => {
    const index = parseIndex(
      [
        "- [受注一覧](orders.md)",
        "- [在庫照会](stock.md)",
        "  - [在庫数の色について](stock/colors.md)",
        "- 管理者向け",
        "  - [設定](settings.md)",
      ].join("\n"),
    );
    expect(index).toEqual([
      { type: "page", id: "orders", title: "受注一覧", children: [] },
      {
        type: "page",
        id: "stock",
        title: "在庫照会",
        children: [
          { type: "page", id: "stock/colors", title: "在庫数の色について", children: [] },
        ],
      },
      {
        type: "group",
        title: "管理者向け",
        children: [{ type: "page", id: "settings", title: "設定", children: [] }],
      },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("リスト以外は無視し、複数のリストは出てくる順につなげる", () => {
    const index = parseIndex(
      "# 目次\n\n- [受注一覧](orders.md)\n\n説明の段落\n\n## 後半\n\n1. [在庫照会](stock.md)",
    );
    expect(index).toEqual([
      { type: "page", id: "orders", title: "受注一覧", children: [] },
      { type: "page", id: "stock", title: "在庫照会", children: [] },
    ]);
  });

  it("タイトルはリンクの文字だけにし、記法を除く", () => {
    expect(parseIndex("- [**受注**一覧](orders.md) よく使う画面")).toEqual([
      { type: "page", id: "orders", title: "受注一覧", children: [] },
    ]);
  });

  it("グループ見出しの記法を除く", () => {
    expect(parseIndex("- **管理者**向け\n  - [設定](settings.md)")).toEqual([
      {
        type: "group",
        title: "管理者向け",
        children: [{ type: "page", id: "settings", title: "設定", children: [] }],
      },
    ]);
  });

  it("リンク先の ./ と %xx を解決してページIDにする", () => {
    expect(parseIndex("- [a](./stock/colors.md)\n- [b](stock%20list.md)\n- [c](<設定 画面.md>)")).toEqual([
      { type: "page", id: "stock/colors", title: "a", children: [] },
      { type: "page", id: "stock list", title: "b", children: [] },
      { type: "page", id: "設定 画面", title: "c", children: [] },
    ]);
  });

  describe("解釈できない項目", () => {
    it.each([
      ["- [a](a.md) と [b](b.md)", "more than one link"],
      ["- [外部](https://example.com)", "does not point to a .md file"],
      ["- [画像](img/filter.png)", "does not point to a .md file"],
      ["- [上](../outside.md)", "does not point to a .md file"],
      ["- [見出し](orders.md#一括更新)", "points to a heading"],
      ["- [](orders.md)", "has no text"],
      ["- [危険](javascript:alert(1))", "URL is not allowed"],
    ])("%s は、入れ子の項目ごと無視して警告する", (line, reason) => {
      const index = parseIndex(`${line}\n  - [子](child.md)\n- [残る](kept.md)`);
      expect(index).toEqual([{ type: "page", id: "kept", title: "残る", children: [] }]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain(reason);
      expect(warn.mock.calls[0]?.[0]).toMatch(/^\[md-help-kit\] _index\.md: /);
    });

    it("空の項目は無視して警告する", () => {
      expect(parseIndex("- [残る](kept.md)\n-\n- [残る2](kept2.md)")).toEqual([
        { type: "page", id: "kept", title: "残る", children: [] },
        { type: "page", id: "kept2", title: "残る2", children: [] },
      ]);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(warn.mock.calls[0]?.[0]).toContain("it is empty");
    });

    it("入れ子の中の解釈できない項目は、その項目だけを無視する", () => {
      expect(parseIndex("- [在庫照会](stock.md)\n  - [外部](https://example.com)\n  - [色](stock/colors.md)")).toEqual([
        {
          type: "page",
          id: "stock",
          title: "在庫照会",
          children: [{ type: "page", id: "stock/colors", title: "色", children: [] }],
        },
      ]);
      expect(warn).toHaveBeenCalledTimes(1);
    });

    it("本番（NODE_ENV=production）では警告しない", () => {
      vi.stubEnv("NODE_ENV", "production");
      try {
        expect(parseIndex("- [外部](https://example.com)")).toEqual([]);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        vi.unstubAllEnvs();
      }
    });
  });
});
