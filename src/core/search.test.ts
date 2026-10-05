import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown.js";
import { buildSearchIndex, type SearchablePage, searchIndex } from "./search.js";

const page = (id: string, title: string, markdown: string): SearchablePage => ({
  id,
  title,
  doc: parseMarkdown(markdown),
});

const pages = [
  page(
    "orders",
    "受注一覧",
    [
      "# 受注一覧",
      "",
      "受注を一覧で確認する画面です。",
      "",
      "## 一括更新",
      "",
      "複数の受注の状態をまとめて変更できます。",
      "",
      "## 絞り込み",
      "",
      "期間と得意先で絞り込めます。在庫の状態は表示しません。",
    ].join("\n"),
  ),
  page(
    "stock",
    "在庫照会",
    [
      "在庫の数を確認する画面です。",
      "",
      "## 在庫数の色",
      "",
      "在庫が少ない商品は赤で表示します。",
      "",
      "```",
      "コードブロックの中の在庫",
      "```",
    ].join("\n"),
  ),
];

const search = (query: string, target = pages) => searchIndex(buildSearchIndex(target), query);

describe("searchIndex", () => {
  it("タイトル一致、見出し一致、本文一致の順に、それぞれページ順で並べる", () => {
    expect(search("在庫").map((hit) => [hit.pageId, hit.headingId])).toEqual([
      // タイトル一致
      ["stock", null],
      // 見出し一致
      ["stock", "在庫数の色"],
      // 本文一致（ページ順、ページ内の順）
      ["orders", "絞り込み"],
    ]);
  });

  it("タイトル一致は headingId が null で、抜粋は本文の先頭", () => {
    expect(search("受注一覧")[0]).toEqual({
      pageId: "orders",
      pageTitle: "受注一覧",
      headingId: null,
      headingText: null,
      snippet: "受注を一覧で確認する画面です。",
    });
  });

  it("見出しと本文の一致には、見出しの文字と、本文の一致箇所の抜粋を付ける", () => {
    expect(search("まとめて")).toEqual([
      {
        pageId: "orders",
        pageTitle: "受注一覧",
        headingId: "一括更新",
        headingText: "一括更新",
        snippet: "複数の受注の状態をまとめて変更できます。",
      },
    ]);
  });

  it("最初の見出しより前の本文は、headingId が null の区間になる", () => {
    expect(search("数を確認")).toEqual([
      {
        pageId: "stock",
        pageTitle: "在庫照会",
        headingId: null,
        headingText: null,
        snippet: "在庫の数を確認する画面です。",
      },
    ]);
  });

  describe("複数語（AND条件）", () => {
    it("1つの区間にすべての語があれば一致する", () => {
      expect(search("期間 得意先").map((hit) => hit.headingId)).toEqual(["絞り込み"]);
    });

    it("見出しと本文に分かれていても、同じ区間なら一致する", () => {
      expect(search("一括更新 状態").map((hit) => hit.headingId)).toEqual(["一括更新"]);
    });

    it("語が別々の区間に分かれていると一致しない", () => {
      expect(search("一括 期間")).toEqual([]);
    });
  });

  it("同じ区間は1回だけ返し、上位の種類を優先する", () => {
    // 見出し「在庫数の色」は見出しにも本文にも一致するが、見出し一致の1件だけ
    const hits = search("在庫").filter((hit) => hit.headingId === "在庫数の色");
    expect(hits).toHaveLength(1);
    // タイトル一致したページでは、最初の見出しより前の区間を重ねて返さない
    expect(search("在庫").filter((hit) => hit.pageId === "stock" && hit.headingId === null)).toHaveLength(1);
  });

  it("全角と半角、大文字と小文字、半角カナの濁点の違いを吸収する", () => {
    const target = [page("a", "A", "ＡＢＣ製品と、ｶﾞｲﾄﾞの１２３番")];
    expect(search("abc", target)).toHaveLength(1);
    expect(search("ガイド", target)).toHaveLength(1);
    expect(search("123", target)).toHaveLength(1);
    // 検索語の側も正規化する
    expect(search("ＡＢＣ　ｶﾞｲﾄﾞ", target)).toHaveLength(1);
    // 抜粋は元の文字のまま切り出す
    expect(search("ガイド", target)[0]?.snippet).toBe("ＡＢＣ製品と、ｶﾞｲﾄﾞの１２３番");
  });

  it("コードブロックの中は検索しない", () => {
    expect(search("コードブロック")).toEqual([]);
  });

  it("空の検索語は結果なし", () => {
    expect(search("")).toEqual([]);
    expect(search("  　 ")).toEqual([]);
  });

  describe("抜粋", () => {
    const long = (text: string) => [page("p", "P", `## 見出し\n\n${text}`)];

    it("一致箇所の前20字、後ろ40字を切り出し、切った側に … を付ける", () => {
      const before = "あ".repeat(30);
      const after = "い".repeat(50);
      expect(search("目印", long(`${before}目印${after}`))[0]?.snippet).toBe(
        `…${"あ".repeat(20)}目印${"い".repeat(40)}…`,
      );
    });

    it("切らなかった側には … を付けない", () => {
      expect(search("目印", long("前目印後"))[0]?.snippet).toBe("前目印後");
    });

    it("最も手前にある語の位置で切り出す", () => {
      const text = `${"あ".repeat(30)}二番${"い".repeat(5)}一番`;
      expect(search("一番 二番", long(text))[0]?.snippet).toBe(
        `…${"あ".repeat(20)}二番${"い".repeat(5)}一番`,
      );
    });

    it("見出しだけに一致したときは、本文の先頭を切り出す", () => {
      const body = "う".repeat(70);
      expect(search("見出し", long(body))[0]?.snippet).toBe(`${"う".repeat(60)}…`);
    });

    it("サロゲートペアの文字を途中で切らない", () => {
      const before = "𠮷".repeat(25);
      expect(search("目印", long(`${before}目印`))[0]?.snippet).toBe(`…${"𠮷".repeat(20)}目印`);
    });
  });

  it("同じページIDが複数あるときは、最初のものだけを使う", () => {
    const target = [page("a", "最初", "本文"), page("a", "二番目", "本文")];
    expect(search("本文", target).map((hit) => hit.pageTitle)).toEqual(["最初"]);
  });

  it("リストの中の文字も検索する", () => {
    const target = [page("a", "A", "## 手順\n\n- 画面を開く\n  - 入れ子の項目")];
    expect(search("入れ子", target).map((hit) => hit.headingId)).toEqual(["手順"]);
  });
});
