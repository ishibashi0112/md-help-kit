// タグ、属性、URLの制限（DESIGN.md 7章）。
// ライブラリが標準で行う保護（tagfilter、on* 属性と javascript: などの除去）に上乗せする。
// 描画への組み込みは markdown.ts の renderRule で行う
import { devWarnOnce } from "./warn.js";

/** 標準で許可する HTML タグ */
export const DEFAULT_ALLOWED_TAGS: readonly string[] = [
  "details",
  "summary",
  "kbd",
  "br",
  "sub",
  "sup",
  "mark",
];

/** allowedTags に追加しても許可しないタグ */
const FORBIDDEN_TAGS: ReadonlySet<string> = new Set([
  // 実行、埋め込み
  "script",
  "noscript",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "applet",
  "template",
  // ページ全体に影響する
  "style",
  "link",
  "meta",
  "base",
  "title",
  // 入力欄
  "form",
  "input",
  "button",
  "select",
  "option",
  "textarea",
  // GFM の tagfilter の対象
  "xmp",
  "plaintext",
  "noembed",
  "noframes",
]);

/**
 * md内のタグの扱い。
 * - html: 許可した HTML タグとして描画する
 * - component: 登録した独自タグとして描画する
 * - text: 描画せず、文字として表示する
 */
export type TagKind = "html" | "component" | "text";

export interface TagPolicyOptions {
  /** 標準に加えて許可する HTML タグ */
  allowedTags?: readonly string[];
  /** 登録した独自タグの名前 */
  componentNames?: readonly string[];
}

/** 独自タグの名前（大文字始まり）か */
export function isComponentName(name: string): boolean {
  return /^[A-Z]/.test(name);
}

/**
 * タグ名からタグの扱いを決める関数を作る。
 * 大文字始まりのタグは独自タグとして扱い、HTML タグの許可リストとは照合しない。
 */
export function createTagPolicy(options: TagPolicyOptions = {}): (tag: string) => TagKind {
  const allowed = new Set(DEFAULT_ALLOWED_TAGS);
  for (const tag of options.allowedTags ?? []) {
    const name = tag.toLowerCase();
    if (FORBIDDEN_TAGS.has(name)) {
      devWarnOnce(`allowedTags: <${name}> is always disallowed for safety and was ignored.`);
    } else {
      allowed.add(name);
    }
  }

  const components = new Set<string>();
  for (const name of options.componentNames ?? []) {
    if (isComponentName(name)) {
      components.add(name);
    } else {
      devWarnOnce(
        `components: "${name}" was ignored because custom tag names must start with an uppercase letter.`,
      );
    }
  }

  return (tag) => {
    const kind = isComponentName(tag)
      ? components.has(tag)
        ? "component"
        : "text"
      : allowed.has(tag.toLowerCase())
        ? "html"
        : "text";
    if (kind === "text") {
      devWarnOnce(
        `<${tag}> is neither registered in components nor allowed by allowedTags, so it is shown as text.`,
      );
    }
    return kind;
  };
}

const ALLOWED_SCHEMES: ReadonlySet<string> = new Set(["http", "https", "mailto"]);

/** リンクと画像のURLとして許可するか。http、https、mailto と相対パスだけを許可する */
export function isAllowedUrl(url: string): boolean {
  // ブラウザと同じく、前後の空白と制御文字、途中のタブと改行を取り除いてから判定する
  const value = url.replace(/^[\x00-\x20]+|[\x00-\x20]+$/g, "").replace(/[\t\n\r]/g, "");
  const scheme = /^([a-z][a-z\d+.-]*):/i.exec(value);
  if (scheme) return ALLOWED_SCHEMES.has((scheme[1] ?? "").toLowerCase());
  // `//` や `\\` で始まるものは、別のホストを指す
  return !/^[/\\]{2}/.test(value);
}

/** URL を値に持つ属性 */
const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  "href",
  "src",
  "srcset",
  "action",
  "formaction",
  "poster",
  "cite",
  "background",
  "longdesc",
  "ping",
  "xlink:href",
]);

/**
 * タグの属性から、許可しないものを取り除いた新しいオブジェクトを返す。
 * - 許可しない URL を値に持つ属性（HTML タグ、独自タグの両方）
 * - HTML タグの style（独自タグの style は残す）
 */
export function sanitizeAttributes(
  attrs: Readonly<Record<string, unknown>>,
  kind: "html" | "component",
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(attrs)) {
    const key = name.toLowerCase();
    if (kind === "html" && key === "style") continue;
    if (URL_ATTRIBUTES.has(key) && typeof value === "string") {
      const urls = key === "srcset" || key === "ping" ? splitUrlList(key, value) : [value];
      if (!urls.every(isAllowedUrl)) continue;
    }
    result[name] = value;
  }
  return result;
}

/** srcset（カンマ区切りで、各候補は「URL 記述子」）と ping（空白区切り）のURLを取り出す */
function splitUrlList(key: string, value: string): string[] {
  if (key === "ping") return value.split(/\s+/).filter((url) => url !== "");
  return value
    .split(",")
    .map((candidate) => candidate.trim().split(/\s+/)[0] ?? "")
    .filter((url) => url !== "");
}
