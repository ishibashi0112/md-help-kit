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

/** useHelp() が返すもの（5.3節） */
export interface HelpApi {
  /** ドロワーが開いているか */
  isOpen: boolean;
  /** ドロワーを開く。target を省略したときは、画面のページ、defaultPage、目次の先頭の順に選ぶ */
  open(target?: string): void;
  close(): void;
  toggle(): void;

  /** 目次ツリー */
  index: HelpIndexNode[];
  /** 目次の取得の状態。idle はまだ取得を始めていない（indexLoading が "open" のとき） */
  indexStatus: HelpIndexStatus;

  /** 表示中のページ。まだ何も開いていないときは null */
  current: HelpCurrentPage | null;

  /** 画面が宣言しているターゲット（useHelpPage） */
  screenTarget: string | null;
  /** ターゲット（`orders`、`orders#一括更新`）へ移動する */
  navigate(target: string): void;
  /** ドロワー内の履歴で1つ前に戻る */
  back(): void;
  canGoBack: boolean;
  /** キャッシュを捨て、目次と表示中のページを取得し直す */
  reload(): void;

  search(query: string): Promise<HelpSearchHit[]>;
}

export type HelpIndexStatus = "idle" | "loading" | "ready" | "error";

export type HelpPageStatus = "loading" | "ready" | "not-found" | "error";

/** 表示中のページ */
export interface HelpCurrentPage {
  id: string;
  /** 目次のタイトル。目次にないページは、本文の最初の `#` 見出し、なければページID */
  title: string;
  markdown: string;
  headings: HelpHeading[];
  /** ターゲットが見出しまで指しているときの見出しID */
  headingId: string | null;
  status: HelpPageStatus;
}

/** コードブロックの描画を差し替えるコンポーネントの props（6.2節） */
export interface HelpCodeBlockProps {
  /** コードブロックの中身 */
  code: string;
  /** 言語名 */
  lang: string;
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
