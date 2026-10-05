import { describe, expect, it } from "vitest";
import { slugify } from "./slug.js";

describe("slugify", () => {
  it("日本語はそのまま残す", () => {
    expect(slugify("一括更新")).toBe("一括更新");
    expect(slugify("在庫数の色について")).toBe("在庫数の色について");
  });

  it("前後の空白を除き、小文字にする", () => {
    expect(slugify("  Hello World  ")).toBe("hello-world");
  });

  it("英字以外の大文字も小文字にする", () => {
    expect(slugify("ＡＢＣ")).toBe("ａｂｃ");
  });

  it("文字、数字、-、_、空白以外を取り除く", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("C++ の使い方")).toBe("c-の使い方");
    expect(slugify("「受注」（一覧）")).toBe("受注一覧");
    expect(slugify("snake_case と kebab-case")).toBe("snake_case-と-kebab-case");
  });

  it("結合文字と、①などの数字は残す", () => {
    expect(slugify("が")).toBe("が");
    expect(slugify("手順①")).toBe("手順①");
    expect(slugify("v2 の 10 件")).toBe("v2-の-10-件");
  });

  it("空白は全角も含めて1文字ずつ - にする（連続しても詰めない）", () => {
    expect(slugify("受注　一覧")).toBe("受注-一覧");
    expect(slugify("a  b")).toBe("a--b");
    expect(slugify("a - b")).toBe("a---b");
  });

  it("残る文字がなければ空文字になる", () => {
    expect(slugify("!!!")).toBe("");
  });
});
