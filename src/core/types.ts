// 公開する型（DESIGN.md 4章、5.3節）

/** ヘルプのmdの取得元（4章） */
export interface HelpSource {
  /** _index.md の中身を返す */
  loadIndex(): Promise<string>;
  /** ページIDに対応するmdの中身を返す。存在しなければ HelpNotFoundError を投げる */
  loadPage(id: string): Promise<string>;
  /** md内の相対パス（画像など）を、表示用URLに解決する。省略時は変換しない */
  resolveAsset?(pageId: string, path: string): string;
}

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
