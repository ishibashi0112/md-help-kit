// UI の文言（DESIGN.md 9.4節）。標準は英語

export interface HelpLabels {
  /** ドロワーの見出し。ドロワーの aria-label にも使う */
  title: string;
  /** HelpButton の aria-label（children を渡さないとき） */
  openHelp: string;
  back: string;
  close: string;
  /** 全体目次への切り替え */
  contents: string;
  /** 検索欄のプレースホルダーと aria-label */
  search: string;
  loading: string;
  notFound: string;
  goToContents: string;
  loadError: string;
  retry: string;
  searching: string;
  noResults: string;
  searchError: string;
  /** 注意書きのラベル（6.3節） */
  alerts: {
    note: string;
    tip: string;
    important: string;
    warning: string;
    caution: string;
  };
}

/** labels prop で受け取る形。渡した項目だけを標準に重ねる */
export type HelpLabelsInput = Partial<Omit<HelpLabels, "alerts">> & {
  alerts?: Partial<HelpLabels["alerts"]>;
};

const defaultLabels: HelpLabels = {
  title: "Help",
  openHelp: "Help",
  back: "Back",
  close: "Close",
  contents: "Contents",
  search: "Search help",
  loading: "Loading…",
  notFound: "This page was not found.",
  goToContents: "Go to contents",
  loadError: "Failed to load.",
  retry: "Retry",
  searching: "Searching…",
  noResults: "No results.",
  searchError: "Search failed.",
  alerts: {
    note: "Note",
    tip: "Tip",
    important: "Important",
    warning: "Warning",
    caution: "Caution",
  },
};

/** 日本語の文言 */
export const jaLabels: HelpLabels = {
  title: "ヘルプ",
  openHelp: "ヘルプ",
  back: "戻る",
  close: "閉じる",
  contents: "目次",
  search: "ヘルプを検索",
  loading: "読み込み中…",
  notFound: "ページが見つかりません。",
  goToContents: "目次へ",
  loadError: "読み込めませんでした。",
  retry: "再試行",
  searching: "検索中…",
  noResults: "見つかりませんでした。",
  searchError: "検索できませんでした。",
  alerts: {
    note: "補足",
    tip: "ヒント",
    important: "重要",
    warning: "警告",
    caution: "危険",
  },
};

export function resolveLabels(input?: HelpLabelsInput): HelpLabels {
  if (input === undefined) return defaultLabels;
  return {
    ...defaultLabels,
    ...input,
    alerts: { ...defaultLabels.alerts, ...input.alerts },
  };
}
