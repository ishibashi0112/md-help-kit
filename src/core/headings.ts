// 見出しの一覧（DESIGN.md 5.3節の headings）
import type { MdDocument } from "./markdown.js";
import type { HelpHeading } from "./types.js";

/**
 * 本文直下の見出し（h1〜h6）を、出てくる順に返す。
 * 引用、リスト、タグの中の見出しは含めない（IDは付くので、リンクで飛ぶことはできる）。
 */
export function getHeadings(doc: MdDocument): HelpHeading[] {
  return doc.blocks.flatMap((block) =>
    block.type === "heading" ? [{ depth: block.depth, text: block.text, id: block.id }] : [],
  );
}
