// リンクの分類と相対パスの解決（DESIGN.md 5.5節）

export type LinkKind =
  /** ドロワー内でページ遷移する。target はターゲット（`stock/colors#赤`） */
  | { type: "page"; target: string }
  /** 同じページ内の見出しへスクロールする */
  | { type: "anchor"; headingId: string }
  /** 新しいタブで開く（http、https、mailto） */
  | { type: "external"; href: string }
  /** 何もせず、通常のリンクとして描画する */
  | { type: "other"; href: string };

const SCHEME = /^[a-z][a-z\d+.-]*:/i;
const EXTERNAL_SCHEME = /^(?:https?|mailto):/i;

/**
 * md内のリンク先を分類する。
 * 相対パスは現在のページからの相対で、`/` で始まるパスは docs ルートからで解決する。
 */
export function classifyLink(href: string, currentPageId: string): LinkKind {
  if (href.startsWith("#")) {
    const headingId = decode(href.slice(1));
    return headingId ? { type: "anchor", headingId } : { type: "other", href };
  }
  if (SCHEME.test(href)) {
    return EXTERNAL_SCHEME.test(href) ? { type: "external", href } : { type: "other", href };
  }
  const target = resolvePageLink(href, currentPageId);
  return target === null ? { type: "other", href } : { type: "page", target };
}

/** `.md` への相対パスをターゲットにする。ページへのリンクとして扱えないときは null */
function resolvePageLink(href: string, currentPageId: string): string | null {
  // `//` で始まるものは別のホストを指す
  if (href.startsWith("//")) return null;

  const hashIndex = href.indexOf("#");
  const path = hashIndex === -1 ? href : href.slice(0, hashIndex);
  const hash = hashIndex === -1 ? "" : href.slice(hashIndex + 1);
  if (!path.endsWith(".md") || path.includes("?")) return null;

  const segments = path.startsWith("/") ? [] : currentPageId.split("/").slice(0, -1);
  for (const raw of path.split("/")) {
    const segment = decode(raw);
    // デコードして区切りや `#` になるものは、ページIDとして扱えない
    if (segment === null || segment.includes("/") || segment.includes("#")) return null;
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      // docs ルートより上は指せない
      if (segments.length === 0) return null;
      segments.pop();
      continue;
    }
    segments.push(segment);
  }

  const file = segments.pop();
  if (file === undefined || !file.endsWith(".md") || file === ".md") return null;
  const id = [...segments, file.slice(0, -".md".length)].join("/");

  const headingId = decode(hash);
  if (headingId === null) return null;
  return headingId === "" ? id : `${id}#${headingId}`;
}

/**
 * ページIDとして取得してよいか。
 * 空、`.`、`..` のセグメントを含むもの（docs の外を指しうるもの）は使えない。
 */
export function isValidPageId(id: string): boolean {
  return id.split("/").every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

function decode(text: string): string | null {
  try {
    return decodeURIComponent(text);
  } catch {
    return null;
  }
}
