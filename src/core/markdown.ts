// markdown-to-jsx の呼び出しを1か所に集約する（DESIGN.md 12章）。
// ライブラリの解析結果（AST）は、このファイルの中で、このパッケージ用の簡易構造に変換してから外へ渡す。
// ライブラリを差し替える場合の影響を、このファイルに閉じ込めるため。
import { astToJSX, type MarkdownToJSX, parser, RuleType } from "markdown-to-jsx/react";
import { type ComponentType, createElement, Fragment, type ReactNode } from "react";
import { createTagPolicy, isAllowedUrl, isComponentName, sanitizeAttributes } from "./sanitize.js";
import { slugify } from "./slug.js";
import type { HelpCodeBlockProps } from "./types.js";

type AstNode = MarkdownToJSX.ASTNode;

/** 描画のために、解析済みのmdごとにライブラリのASTを持っておく（ASTの型を外へ出さないため） */
const asts = new WeakMap<MdDocument, AstNode[]>();

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
  const doc: MdDocument = { blocks: toBlocks(ast) };
  asts.set(doc, ast);
  return doc;
}

export interface RenderOptions {
  /** md内で使える HTML タグの追加（7章） */
  allowedTags?: readonly string[];
  /** md内で使える独自タグ（6.1節）。名前が大文字始まりのものだけが有効 */
  components?: Readonly<Record<string, ComponentType<any>>>;
  /** 標準の要素（a、img、table、blockquote など）の差し替え。名前が小文字のものだけが有効 */
  overrides?: Readonly<Record<string, ComponentType<any>>>;
  /**
   * 言語名ごとのコードブロックの描画（6.2節）。言語名の大文字小文字は区別しない。
   * `*` は個別の登録がない全言語（言語名のないものを含む。そのときの lang は空文字）に使う
   */
  codeBlocks?: Readonly<Record<string, ComponentType<HelpCodeBlockProps>>>;
}

/** 注意書きの種別（6.3節）。data-mhk-alert 属性には小文字で出す */
const ALERT_KINDS: ReadonlySet<string> = new Set(["note", "tip", "important", "warning", "caution"]);

/**
 * 解析済みのmdを描画する。安全性の制限（DESIGN.md 7章）は、ここで必ず適用する。
 * ライブラリの設定（tagfilter など）は、呼び出し側から変えられない。
 */
export function renderMarkdown(doc: MdDocument, options: RenderOptions = {}): ReactNode {
  const components = options.components ?? {};
  const kindOf = createTagPolicy({
    allowedTags: options.allowedTags,
    componentNames: Object.keys(components),
  });
  const overrides: Record<string, ComponentType<any>> = {
    ...Object.fromEntries(
      Object.entries(options.overrides ?? {}).filter(([name]) => !isComponentName(name)),
    ),
    ...Object.fromEntries(Object.entries(components).filter(([name]) => isComponentName(name))),
  };
  const codeBlocks = new Map(
    Object.entries(options.codeBlocks ?? {}).map(([lang, component]) => [lang.toLowerCase(), component]),
  );

  return astToJSX(asts.get(doc) ?? [], {
    // 危険なタグを文字にするライブラリの保護は、常に有効にする（7章）
    tagfilter: true,
    // HTML ブロックを描画時に解析し直す場合にも、同じ見出しIDの規則を使う
    slugify: (input) => slugify(input),
    wrapper: null,
    overrides,
    renderRule(next, node, renderChildren, state) {
      switch (node.type) {
        case RuleType.htmlBlock:
        case RuleType.htmlSelfClosing: {
          const kind = kindOf(node.tag);
          if (kind === "text") return renderTagAsText(node, renderChildren, state);
          // ライブラリの描画に渡すため、ノードの属性を制限したものに置き換える（何度行っても結果は同じ）
          if (node.attrs) node.attrs = sanitizeAttributes(node.attrs, kind);
          return next();
        }
        case RuleType.link:
          // 許可しないURLのリンクは、リンクにせず文字だけを表示する
          if (node.target === null || !isAllowedUrl(node.target)) {
            return createElement(Fragment, { key: state.key }, renderChildren(node.children, state));
          }
          return next();
        case RuleType.image:
          // 許可しないURLの画像は、代替テキストを文字で表示する
          if (node.target === null || !isAllowedUrl(node.target)) return node.alt ?? "";
          return next();
        case RuleType.codeBlock: {
          const lang = node.lang ?? "";
          const component = (lang !== "" && codeBlocks.get(lang.toLowerCase())) || codeBlocks.get("*");
          if (component) return createElement(component, { key: state.key, code: node.text, lang });
          return next();
        }
        case RuleType.blockQuote: {
          if (node.alert === undefined) return next();
          const blockquote = overrides.blockquote ?? "blockquote";
          const kind = node.alert.toLowerCase();
          if (ALERT_KINDS.has(kind)) {
            return createElement(
              blockquote,
              { key: state.key, "data-mhk-alert": kind },
              renderChildren(node.children, state),
            );
          }
          // 5種類以外は普通の引用にし、ライブラリが取り除いた [!XXX] を文字で残す（GitHub と同じ見た目）
          return createElement(
            blockquote,
            { key: state.key },
            createElement("p", { key: "alert" }, `[!${node.alert}]`),
            renderChildren(node.children, state),
          );
        }
        default:
          return next();
      }
    },
    createElement: createElementWithoutRawHtml,
  });
}

/** mdのリンクと、HTML の <a> のリンク先をすべて集める（開発時の確認用） */
export function collectLinkTargets(doc: MdDocument): string[] {
  const targets: string[] = [];
  const visit = (node: AstNode) => {
    if (node.type === RuleType.link && node.target !== null) targets.push(node.target);
    if (node.type === RuleType.htmlBlock || node.type === RuleType.htmlSelfClosing) {
      const href = node.attrs?.href;
      if (node.tag.toLowerCase() === "a" && typeof href === "string") targets.push(href);
    }
    for (const child of descendantsOf(node)) visit(child);
  };
  (asts.get(doc) ?? []).forEach(visit);
  return targets;
}

/** 子ノードをすべて返す（リストの項目と表のセルを含む） */
function descendantsOf(node: AstNode): AstNode[] {
  switch (node.type) {
    case RuleType.orderedList:
    case RuleType.unorderedList:
      return node.items.flat();
    case RuleType.table:
      return [...node.header, ...node.cells.flat()].flat();
    default:
      return childrenOf(node);
  }
}

/** 許可していないタグを、タグ名と中身の文字で表示する。属性は表示しない */
function renderTagAsText(
  node: MarkdownToJSX.HTMLNode | MarkdownToJSX.HTMLSelfClosingNode,
  renderChildren: MarkdownToJSX.ASTRender,
  state: MarkdownToJSX.State,
): ReactNode {
  let content: ReactNode = null;
  if (node.type === RuleType.htmlBlock) {
    if (node.children && node.children.length > 0) {
      content = renderChildren(node.children, state);
    } else if (node.text) {
      // 中身を解析しないタグ（<pre> など）の中身は、この欄にしかない
      content = node.text;
    }
  }
  if (content === null) return `<${node.tag} />`;
  return createElement(Fragment, { key: state.key }, `<${node.tag}>`, content, `</${node.tag}>`);
}

/**
 * ライブラリが中身を HTML として直接書き込む場合（<pre> など）も、HTML として解釈させず、
 * その文字列を文字として表示する
 */
const createElementWithoutRawHtml: NonNullable<MarkdownToJSX.Options["createElement"]> = (
  type,
  props,
  ...children
) => {
  if (props && "dangerouslySetInnerHTML" in props) {
    const { dangerouslySetInnerHTML, ...rest } = props as {
      dangerouslySetInnerHTML?: { __html?: unknown };
    };
    return createElement(type, rest, String(dangerouslySetInnerHTML?.__html ?? ""));
  }
  return createElement(type, props, ...children);
};

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
