import { describe, expect, it } from "vitest";
import { getHeadings } from "./headings.js";
import { parseMarkdown } from "./markdown.js";

describe("getHeadings", () => {
  it("本文直下の h1〜h6 を出てくる順に返す", () => {
    const doc = parseMarkdown(
      "# 在庫照会\n\n本文\n\n## 一括更新\n\n### 手順\n\n#### 補足\n\n##### 5\n\n###### 6\n\n## 一括更新",
    );
    expect(getHeadings(doc)).toEqual([
      { depth: 1, text: "在庫照会", id: "在庫照会" },
      { depth: 2, text: "一括更新", id: "一括更新" },
      { depth: 3, text: "手順", id: "手順" },
      { depth: 4, text: "補足", id: "補足" },
      { depth: 5, text: "5", id: "5" },
      { depth: 6, text: "6", id: "6" },
      { depth: 2, text: "一括更新", id: "一括更新-1" },
    ]);
  });

  it("引用、リスト、タグの中の見出しは含めない", () => {
    const doc = parseMarkdown("> ## 引用内\n\n- ## リスト内\n\n<Tabs>\n\n## タグ内\n\n</Tabs>\n\n## 通常");
    expect(getHeadings(doc)).toEqual([{ depth: 2, text: "通常", id: "通常" }]);
  });

  it("見出しがなければ空の配列を返す", () => {
    expect(getHeadings(parseMarkdown("本文だけ"))).toEqual([]);
  });
});
