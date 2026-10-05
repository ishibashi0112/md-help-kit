// markdown-to-jsx の呼び出しを1か所に集約する（DESIGN.md 12章）。
// ライブラリの解析結果（AST）は、このファイルの中で、このパッケージ用の簡易構造に変換してから外へ渡す。
// ライブラリを差し替える場合の影響を、このファイルに閉じ込めるため。
import { type MarkdownToJSX, parser, RuleType } from "markdown-to-jsx/react";
import { slugify } from "./slug.js";

type AstNode = MarkdownToJSX.ASTNode;

/** 解析済みのmd。本文直下の要素を、出てくる順に並べたもの */
export interface MdDocument {
  blocks: MdBlock[];
}

export type MdBlock = MdHeading | MdList | MdText;

/** 本文直下の見出し。引用、リスト、タグの中の見出しは含めない（それらは MdText の文字になる） */
export interface MdHeading {
  type: "heading";
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  /** 見出しID。描画した見出しに付くIDと同じ */
  id: string;
  text: string;
}

/** リスト（番号付きを含む） */
export interface MdList {
  type: "list";
  items: MdListItem[];
}

export interface MdListItem {
  /** 項目の文字（入れ子のリストを除く） */
  text: string;
  /** 項目の中のリンク（入れ子のリストの中は含めない） */
  links: MdLink[];
  /** 項目の中に入れ子になったリスト */
  lists: MdList[];
}

export interface MdLink {
  /** リンク先。危険なURLとしてライブラリが取り除いたときは null */
  href: string | null;
  text: string;
}

/** 見出しとリスト以外の、本文直下のまとまり（段落、表、引用、タグなど） */
export interface MdText {
  type: "text";
  text: string;
}

/**
 * mdを解析する。
 *
 * 文字の取り出しでは、md記法とタグを除き、読める文字だけを残す（DESIGN.md 8章）。
 * コードブロック、画像、リンク先のURL、タグの属性は文字に含めない。連続する空白は1つにまとめる。
 */
export function parseMarkdown(markdown: string): MdDocument {
  const ast = parser(markdown, {
    slugify: (input) => slugify(input),
    // 独自タグの属性に書かれた式は実行しない（7章）
    evalUnserializableExpressions: false,
  });
  return { blocks: toBlocks(ast) };
}

function toBlocks(nodes: AstNode[]): MdBlock[] {
  const blocks: MdBlock[] = [];
  for (const node of nodes) {
    switch (node.type) {
      case RuleType.heading:
        blocks.push({
          type: "heading",
          depth: node.level,
          id: node.id,
          text: squash(textOf(node.children)),
        });
        break;
      case RuleType.orderedList:
      case RuleType.unorderedList:
        blocks.push(toList(node.items));
        break;
      default: {
        const text = squash(textOf([node]));
        if (text !== "") blocks.push({ type: "text", text });
      }
    }
  }
  return blocks;
}

function toList(items: AstNode[][]): MdList {
  return {
    type: "list",
    items: items.map((nodes) => {
      const content: AstNode[] = [];
      const lists: MdList[] = [];
      for (const node of nodes) {
        if (node.type === RuleType.orderedList || node.type === RuleType.unorderedList) {
          lists.push(toList(node.items));
        } else {
          content.push(node);
        }
      }
      return { text: squash(textOf(content)), links: linksOf(content), lists };
    }),
  };
}

function linksOf(nodes: AstNode[]): MdLink[] {
  const links: MdLink[] = [];
  const visit = (node: AstNode) => {
    if (node.type === RuleType.link) {
      links.push({ href: node.target, text: squash(textOf(node.children)) });
      return;
    }
    for (const child of childrenOf(node)) visit(child);
  };
  nodes.forEach(visit);
  return links;
}

/** 文字だけを取り出す。ブロックの境目には空白を入れる */
function textOf(nodes: AstNode[]): string {
  return nodes.map(nodeText).join("");
}

function nodeText(node: AstNode): string {
  switch (node.type) {
    case RuleType.text:
    case RuleType.codeInline:
      return node.text;
    case RuleType.breakLine:
      return " ";
    case RuleType.paragraph:
    case RuleType.heading:
    case RuleType.blockQuote:
      return ` ${textOf(node.children)} `;
    case RuleType.orderedList:
    case RuleType.unorderedList:
      return node.items.map((item) => ` ${textOf(item)} `).join("");
    case RuleType.table:
      return [node.header, ...node.cells]
        .map((row) => row.map((cell) => ` ${textOf(cell)} `).join(""))
        .join("");
    // 文字として読むものではない要素
    case RuleType.codeBlock:
    case RuleType.image:
    case RuleType.htmlComment:
    case RuleType.htmlSelfClosing:
    case RuleType.footnoteReference:
    case RuleType.gfmTask:
    case RuleType.refCollection:
    case RuleType.ref:
    case RuleType.footnote:
    case RuleType.frontmatter:
    case RuleType.breakThematic:
      return "";
    default:
      // リンク、強調、HTMLタグ、独自タグなどは中身の文字だけを使う
      return textOf(childrenOf(node));
  }
}

function childrenOf(node: AstNode): AstNode[] {
  return "children" in node && Array.isArray(node.children) ? node.children : [];
}

function squash(text: string): string {
  return text.replace(/\s+/gu, " ").trim();
}
