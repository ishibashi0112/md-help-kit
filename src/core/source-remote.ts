// 外部に置いたmdを取得元にする（DESIGN.md 4.2節）
import { HelpLoadError, HelpNotFoundError, INDEX_ID } from "./errors.js";
import { isValidPageId } from "./links.js";
import type { HelpSource } from "./types.js";
import { devWarn } from "./warn.js";

export interface RemoteOptions {
  /** fetch の設定。標準の `{ cache: "no-cache" }` に重ねて上書きする（認証付き、別オリジンなど） */
  fetchInit?: RequestInit;
}

/**
 * 外部に置いたmdを取得元にする。
 * 目次は `${baseUrl}/_index.md`、ページは `${baseUrl}/${id}.md` から取得する（パスの各セグメントはエンコードする）。
 * 404 は HelpNotFoundError、それ以外の失敗は HelpLoadError にする。
 */
export function remote(baseUrl: string, options: RemoteOptions = {}): HelpSource {
  const base = baseUrl.replace(/\/+$/, "");
  const urlOf = (id: string) => `${base}/${id.split("/").map(encodeURIComponent).join("/")}.md`;

  const load = async (id: string): Promise<string> => {
    if (!isValidPageId(id)) throw new HelpNotFoundError(id);
    const url = urlOf(id);

    let response: Response;
    try {
      // 毎回サーバーに更新を確認し、mdの差し替えをすぐに反映する
      response = await fetch(url, { cache: "no-cache", ...options.fetchInit });
    } catch (cause) {
      throw new HelpLoadError(id, { cause });
    }
    if (response.status === 404) throw new HelpNotFoundError(id);
    if (!response.ok) throw new HelpLoadError(id, { status: response.status });
    // SPA のサーバーは、存在しないパスにもアプリの HTML を 200 で返すことがある
    if (response.headers.get("content-type")?.toLowerCase().includes("text/html")) {
      devWarn(`remote: "${url}" returned HTML instead of Markdown, so it was treated as not found.`);
      throw new HelpNotFoundError(id);
    }

    try {
      return await response.text();
    } catch (cause) {
      throw new HelpLoadError(id, { status: response.status, cause });
    }
  };

  return {
    loadIndex: () => load(INDEX_ID),
    loadPage: load,
    // 相対パスは、ページのURLを基準に解決する
    resolveAsset: (pageId, path) => resolveUrl(urlOf(pageId), path),
  };
}

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

/**
 * base を基準に path を解決する。
 * 絶対URL（スキーム付き、`//` 始まり）の path はそのまま返す。`/` で始まる path は、base のサーバーのルートから。
 * base が相対（`/help` や `help`）なら、結果も相対のまま返す（fetch や img と同じく、表示中の文書を基準にさせるため）。
 */
function resolveUrl(base: string, path: string): string {
  if (SCHEME.test(path) || path.startsWith("//")) return path;
  if (SCHEME.test(base)) return new URL(path, base).href;
  if (base.startsWith("//")) return new URL(path, `https:${base}`).href.slice("https:".length);
  if (base.startsWith("/")) {
    const url = new URL(path, `https://base.invalid${base}`);
    return url.pathname + url.search + url.hash;
  }
  return resolveRelativePath(base, path);
}

/** 相対パス同士の解決。docs より上を指す `..` は残す */
function resolveRelativePath(base: string, path: string): string {
  const suffixAt = path.search(/[?#]/);
  const pathPart = suffixAt === -1 ? path : path.slice(0, suffixAt);
  const suffix = suffixAt === -1 ? "" : path.slice(suffixAt);
  if (pathPart.startsWith("/")) return path;

  const segments = base
    .split("/")
    .slice(0, -1)
    .filter((segment) => segment !== ".");
  for (const segment of pathPart.split("/")) {
    if (segment === ".") continue;
    if (segment === ".." && segments.length > 0 && segments.at(-1) !== "..") {
      segments.pop();
    } else {
      segments.push(segment);
    }
  }
  return segments.join("/") + suffix;
}
