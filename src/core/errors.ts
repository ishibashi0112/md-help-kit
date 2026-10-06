// 取得元のエラー（DESIGN.md 4章）。利用者が自作する取得元からも投げられるよう、公開する

/** 目次（_index.md）を表すID */
export const INDEX_ID = "_index";

function describe(pageId: string): string {
  return pageId === INDEX_ID ? "the help index (_index.md)" : `help page "${pageId}"`;
}

/** ページ（または目次）が存在しない */
export class HelpNotFoundError extends Error {
  readonly name = "HelpNotFoundError";
  /** 見つからなかったページのID。目次のときは `_index` */
  readonly pageId: string;

  constructor(pageId: string, options?: ErrorOptions) {
    const target = describe(pageId);
    super(`${target[0]?.toUpperCase()}${target.slice(1)} was not found.`, options);
    this.pageId = pageId;
  }
}

export interface HelpLoadErrorOptions extends ErrorOptions {
  /** HTTP のステータス */
  status?: number;
  /** 失敗の理由や対処の案内。文言の末尾に付ける */
  detail?: string;
}

/** 取得に失敗した（ネットワークの失敗、404 以外のエラー状態など） */
export class HelpLoadError extends Error {
  readonly name = "HelpLoadError";
  /** 取得しようとしたページのID。目次のときは `_index` */
  readonly pageId: string;
  /** HTTP のステータス。HTTP の応答がないときは undefined */
  readonly status: number | undefined;

  constructor(pageId: string, options: HelpLoadErrorOptions = {}) {
    const { status, detail, ...errorOptions } = options;
    const http = status === undefined ? "" : ` (HTTP ${status})`;
    super(`Failed to load ${describe(pageId)}${http}${detail ? `: ${detail}` : "."}`, errorOptions);
    this.pageId = pageId;
    this.status = status;
  }
}
