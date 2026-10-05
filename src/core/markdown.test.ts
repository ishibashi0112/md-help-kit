import { describe, expect, it } from "vitest";
import { parseMarkdown } from "./markdown.js";

describe("parseMarkdown", () => {
  describe("見出し", () => {
    it("3.3節の規則で見出しIDを付け、重複には連番を付ける", () => {
      const { blocks } = parseMarkdown(
        "# 在庫照会\n\n## 一括更新\n\n## 一括更新\n\n### Hello World!",
      );
      expect(blocks).toEqual([
        { type: "heading", depth: 1, id: "在庫照会", text: "在庫照会" },
        { type: "heading", depth: 2, id: "一括更新", text: "一括更新" },
        { type: "heading", depth: 2, id: "一括更新-1", text: "一括更新" },
        { type: "heading", depth: 3, id: "hello-world", text: "Hello World!" },
      ]);
    });

    it("見出しの文字から記法を除く", () => {
      const { blocks } = parseMarkdown("## `code` と [設定](settings.md) の **太字**");
      expect(blocks).toEqual([
        { type: "heading", depth: 2, id: "code-と-設定-の-太字", text: "code と 設定 の 太字" },
      ]);
    });

    it("引用、リスト、タグの中の見出しは見出しにせず、文字として扱う", () => {
      const { blocks } = parseMarkdown("> ## 引用内\n\n<Tabs>\n\n## タグ内\n\n</Tabs>\n\n## 通常");
      expect(blocks).toEqual([
        { type: "text", text: "引用内" },
        { type: "text", text: "タグ内" },
        { type: "heading", depth: 2, id: "通常", text: "通常" },
      ]);
    });
  });

  describe("リスト", () => {
    it("項目の文字、リンク、入れ子のリストを取り出す", () => {
      const { blocks } = parseMarkdown(
        "- [在庫照会](stock.md)\n  - [色について](stock/colors.md)\n- 管理者向け\n\n1. [番号](num.md) と説明",
      );
      expect(blocks).toEqual([
        {
          type: "list",
          items: [
            {
              text: "在庫照会",
              links: [{ href: "stock.md", text: "在庫照会" }],
              lists: [
                {
                  type: "list",
                  items: [
                    {
                      text: "色について",
                      links: [{ href: "stock/colors.md", text: "色について" }],
                      lists: [],
                    },
                  ],
                },
              ],
            },
            { text: "管理者向け", links: [], lists: [] },
          ],
        },
        {
          type: "list",
          items: [
            { text: "番号 と説明", links: [{ href: "num.md", text: "番号" }], lists: [] },
          ],
        },
      ]);
    });

    it("項目の間に空行があるリストでも同じ形になる", () => {
      const { blocks } = parseMarkdown("- [a](a.md)\n\n- グループ\n\n  - [b](b.md)");
      expect(blocks).toEqual([
        {
          type: "list",
          items: [
            { text: "a", links: [{ href: "a.md", text: "a" }], lists: [] },
            {
              text: "グループ",
              links: [],
              lists: [
                {
                  type: "list",
                  items: [{ text: "b", links: [{ href: "b.md", text: "b" }], lists: [] }],
                },
              ],
            },
          ],
        },
      ]);
    });

    it("危険なURLのリンクは href が null になる", () => {
      const { blocks } = parseMarkdown("- [危険](javascript:alert(1))");
      expect(blocks).toEqual([
        {
          type: "list",
          items: [{ text: "危険", links: [{ href: null, text: "危険" }], lists: [] }],
        },
      ]);
    });
  });

  describe("文字の取り出し", () => {
    const texts = (markdown: string) =>
      parseMarkdown(markdown).blocks.map((block) => (block.type === "text" ? block.text : null));

    it("インラインコード、リンクの文字、タグの中の文字は含める", () => {
      expect(
        texts(
          "`Ctrl` を押して [設定](settings.md) を開く。<kbd>Esc</kbd>キー\n\n<OpenScreen to=\"settings\">設定画面</OpenScreen>",
        ),
      ).toEqual(["Ctrl を押して 設定 を開く。Escキー", "設定画面"]);
    });

    it("コードブロック、画像、リンク先、タグの属性、コメントは含めない", () => {
      expect(
        texts(
          "```mermaid\ngraph TD\n```\n\n![代替テキスト](a.png)\n\n<!-- メモ -->\n\n[文字](https://example.com/secret)",
        ),
      ).toEqual(["文字"]);
    });

    it("表は各セルの文字を空白でつなぐ", () => {
      expect(texts("| 列1 | 列2 |\n|---|---|\n| 値1 | 値2 |")).toEqual(["列1 列2 値1 値2"]);
    });

    it("注意書きは種別の記法を除いた本文だけにする", () => {
      expect(texts("> [!WARNING]\n> 完了済みの行は\n> 変更できません。")).toEqual([
        "完了済みの行は 変更できません。",
      ]);
    });

    it("参照定義と脚注の定義は含めない", () => {
      expect(texts("[参照][r] と脚注[^1]\n\n[r]: https://example.com\n[^1]: 脚注の本文")).toEqual([
        "参照 と脚注",
      ]);
    });
  });
});
