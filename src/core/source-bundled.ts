// ビルドに含めたmdを取得元にする（DESIGN.md 4.1節）
import { HelpLoadError, HelpNotFoundError, INDEX_ID } from "./errors.js";
import { isValidPageId } from "./links.js";
import type { HelpSource } from "./types.js";
import { devWarn } from "./warn.js";

/**
 * ビルドに含めたmdを取得元にする。
 *
 * 引数には、`import.meta.glob` で `{ query: "?raw", import: "default" }` を指定した結果を、そのまま渡せる。
 * 値は、mdの中身（即時読み込み）か、中身を返す関数（遅延読み込み）。
 * キーの共通の接頭辞（ディレクトリ単位）と `.md` を取り除いたものがページIDになる。
 * 画像の相対パスの解決（resolveAsset）は行わない。
 */
// 引数の型をジェネリクスにしているのは、import.meta.glob の型が引数の型から推論されて、型エラーになるのを防ぐため
export function bundled<T extends string | (() => Promise<string>)>(
  modules: Readonly<Record<string, T>>,
): HelpSource {
  const paths = Object.keys(modules).filter((path) => {
    if (path.endsWith(".md")) return true;
    devWarn(`bundled: ignored "${path}" because it does not end with .md.`);
    return false;
  });
  const prefix = commonDirectory(paths);
  const pages = new Map<string, unknown>(
    paths.map((path) => [path.slice(prefix.length, -".md".length), modules[path]]),
  );

  const load = async (id: string): Promise<string> => {
    if (!isValidPageId(id) || !pages.has(id)) throw new HelpNotFoundError(id);
    const entry = pages.get(id);
    let content: unknown;
    try {
      content = typeof entry === "function" ? await entry() : entry;
    } catch (cause) {
      throw new HelpLoadError(id, { cause });
    }
    if (typeof content !== "string") {
      throw new HelpLoadError(id, {
        detail:
          'the module did not provide a string. Pass { query: "?raw", import: "default" } to import.meta.glob.',
      });
    }
    return content;
  };

  return {
    loadIndex: () => load(INDEX_ID),
    loadPage: load,
  };
}

/** パスの共通の接頭辞を、ディレクトリ単位で求める（末尾は `/`。共通のディレクトリがなければ空文字） */
function commonDirectory(paths: readonly string[]): string {
  let common: string[] | undefined;
  for (const path of paths) {
    const directories = path.split("/").slice(0, -1);
    if (common === undefined) {
      common = directories;
      continue;
    }
    let length = 0;
    while (
      length < common.length &&
      length < directories.length &&
      common[length] === directories[length]
    ) {
      length++;
    }
    common = common.slice(0, length);
  }
  return common === undefined || common.length === 0 ? "" : `${common.join("/")}/`;
}
