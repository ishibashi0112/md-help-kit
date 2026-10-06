// 検索（DESIGN.md 8章）
import type { MdBlock, MdDocument, MdList } from "./markdown.js";
import type { HelpSearchHit } from "./types.js";

/** 検索の対象にするページ */
export interface SearchablePage {
  id: string;
  /** 目次のタイトル */
  title: string;
  doc: MdDocument;
}

/** 検索用に前処理したページの一覧。buildSearchIndex で作る */
export interface SearchIndex {
  pages: IndexedPage[];
}

interface IndexedPage {
  id: string;
  title: string;
  normalizedTitle: string;
  sections: Section[];
}

/** 見出し区間。本文直下の見出し（h1〜h6）で区切る。最初の見出しより前は heading が null の区間 */
interface Section {
  heading: { id: string; text: string; normalized: string } | null;
  /** ページの先頭を指す区間（最初の見出しより前の区間と、ページの最初の見出しが h1 のときのその区間） */
  leading: boolean;
  body: NormalizedText;
}

/** 正規化した文字と、その各文字が元の文字列のどこから来たか */
interface NormalizedText {
  original: string;
  normalized: string;
  /** normalized の i 文字目は original の starts[i] から ends[i] の手前まで */
  starts: number[];
  ends: number[];
}

/** 抜粋で、一致箇所の前と後ろに残す文字数 */
const SNIPPET_BEFORE = 20;
const SNIPPET_AFTER = 40;

/** 検索用の前処理をする。同じページIDが複数あるときは、最初のものだけを使う */
export function buildSearchIndex(pages: SearchablePage[]): SearchIndex {
  const seen = new Set<string>();
  const indexed: IndexedPage[] = [];
  for (const page of pages) {
    if (seen.has(page.id)) continue;
    seen.add(page.id);
    indexed.push({
      id: page.id,
      title: page.title,
      normalizedTitle: normalize(page.title).normalized,
      sections: toSections(page.doc),
    });
  }
  return { pages: indexed };
}

/**
 * 検索する。空白区切りの複数語は AND 条件で、1つの見出し区間にすべての語があるときに一致とする。
 * 結果はタイトル一致、見出し一致、本文一致の順に並べ、同じ種類の中ではページの順、ページ内の順にする。
 * 同じ区間は1回だけ返す（上位の種類を優先）。
 */
export function searchIndex(index: SearchIndex, query: string): HelpSearchHit[] {
  const terms = normalize(query).normalized.split(/\s+/u).filter((term) => term !== "");
  if (terms.length === 0) return [];

  const titleHits: HelpSearchHit[] = [];
  const headingHits: HelpSearchHit[] = [];
  const bodyHits: HelpSearchHit[] = [];

  for (const page of index.pages) {
    const hit = (section: Section | null, snippet: string): HelpSearchHit => ({
      pageId: page.id,
      pageTitle: page.title,
      headingId: section?.heading?.id ?? null,
      headingText: section?.heading?.text ?? null,
      snippet,
    });

    // タイトル一致はページごとに1件。区間は最初の見出しより前（headingId は null）とし、抜粋は本文の先頭。
    // ページの先頭を指す区間は、同じ場所を指すので重ねて返さない
    const titleMatched = terms.every((term) => page.normalizedTitle.includes(term));
    if (titleMatched) {
      const first = page.sections.find((section) => section.body.original !== "");
      titleHits.push(hit(null, leading(first?.body.original ?? "")));
    }

    for (const section of page.sections) {
      if (titleMatched && section.leading) continue;
      const heading = section.heading?.normalized ?? "";
      if (section.heading !== null && terms.every((term) => heading.includes(term))) {
        headingHits.push(hit(section, snippetOf(section.body, terms)));
      } else if (
        terms.every((term) => heading.includes(term) || section.body.normalized.includes(term))
      ) {
        bodyHits.push(hit(section, snippetOf(section.body, terms)));
      }
    }
  }

  return [...titleHits, ...headingHits, ...bodyHits];
}

function toSections(doc: MdDocument): Section[] {
  const sections: { heading: Section["heading"]; leading: boolean; texts: string[] }[] = [
    { heading: null, leading: true, texts: [] },
  ];
  for (const block of doc.blocks) {
    if (block.type === "heading") {
      sections.push({
        heading: { id: block.id, text: block.text, normalized: normalize(block.text).normalized },
        // ページの最初の見出しが h1 なら、その区間はページの先頭（タイトル）を指す
        leading: sections.length === 1 && block.depth === 1,
        texts: [],
      });
    } else {
      sections.at(-1)?.texts.push(blockText(block));
    }
  }
  return sections
    .filter((section) => section.heading !== null || section.texts.length > 0)
    .map((section) => ({
      heading: section.heading,
      leading: section.leading,
      body: normalize(section.texts.join(" ")),
    }));
}

function blockText(block: Exclude<MdBlock, { type: "heading" }>): string {
  return block.type === "list" ? listText(block) : block.text;
}

function listText(list: MdList): string {
  return list.items
    .flatMap((item) => [item.text, ...item.lists.map(listText)])
    .filter((text) => text !== "")
    .join(" ");
}

// 1文字と、それに続く結合文字（半角カナの濁点、半濁点を含む）をひとまとまりとして扱う。
// まとまりごとに正規化すると、ｶﾞ と ガ のように正規化で文字数が変わるものも、元の位置へ戻せる
const CLUSTER = /\P{M}[\p{M}ﾞﾟ]*|[\p{M}ﾞﾟ]+/gu;

/** NFKC 正規化して小文字にする（全角と半角、大文字と小文字の違いを吸収する） */
function normalize(text: string): NormalizedText {
  let normalized = "";
  const starts: number[] = [];
  const ends: number[] = [];
  for (const match of text.matchAll(CLUSTER)) {
    const piece = match[0].normalize("NFKC").toLowerCase();
    for (let i = 0; i < piece.length; i++) {
      starts.push(match.index);
      ends.push(match.index + match[0].length);
    }
    normalized += piece;
  }
  return { original: text, normalized, starts, ends };
}

/** 本文で最も手前にある一致箇所の前後を切り出す。本文に一致がなければ本文の先頭を返す */
function snippetOf(body: NormalizedText, terms: string[]): string {
  let at = -1;
  let length = 0;
  for (const term of terms) {
    const index = body.normalized.indexOf(term);
    if (index !== -1 && (at === -1 || index < at)) {
      at = index;
      length = term.length;
    }
  }
  if (at === -1) return leading(body.original);

  const start = body.starts[at] ?? 0;
  const end = body.ends[at + length - 1] ?? start;
  // 文字数はコードポイントで数える（サロゲートペアを途中で切らない）
  const before = Array.from(body.original.slice(0, start));
  const after = Array.from(body.original.slice(end));
  return (
    (before.length > SNIPPET_BEFORE ? "…" : "") +
    before.slice(-SNIPPET_BEFORE).join("") +
    body.original.slice(start, end) +
    after.slice(0, SNIPPET_AFTER).join("") +
    (after.length > SNIPPET_AFTER ? "…" : "")
  );
}

/** 先頭から、抜粋と同じ文字数を切り出す */
function leading(text: string): string {
  const chars = Array.from(text);
  const limit = SNIPPET_BEFORE + SNIPPET_AFTER;
  return chars.slice(0, limit).join("") + (chars.length > limit ? "…" : "");
}
