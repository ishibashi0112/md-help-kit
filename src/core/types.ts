// 公開する型（DESIGN.md 5.3節）

/** 目次ツリーの1項目。リンクのある項目はページ、リンクのない項目はグループ見出し（3.1節） */
export type HelpIndexNode =
  | { type: "page"; id: string; title: string; children: HelpIndexNode[] }
  | { type: "group"; title: string; children: HelpIndexNode[] };

/** ページ内の見出し */
export interface HelpHeading {
  /** 見出しの階層（`#` の数） */
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  /** 見出しの文字 */
  text: string;
  /** 見出しID（3.3節）。描画した見出しに付くIDと同じ */
  id: string;
}

/** 検索結果の1件（ページ × 見出し区間。8章） */
export interface HelpSearchHit {
  pageId: string;
  pageTitle: string;
  /** 一致箇所の直近の見出し。最初の見出しより前のとき、タイトルに一致したときは null */
  headingId: string | null;
  headingText: string | null;
  /** 一致箇所の前後を切り出した文字列 */
  snippet: string;
}
