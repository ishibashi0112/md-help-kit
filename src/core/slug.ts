// 見出しIDの生成（DESIGN.md 3.3節）。GitHub の挙動に近づける

/**
 * 見出しの文字列から見出しIDを作る。
 * 同じページ内で重複したときの連番（`-1`、`-2`）は markdown-to-jsx が付けるので、ここでは扱わない。
 */
export function slugify(text: string): string {
  return (
    text
      // 1. 前後の空白を除き、小文字にする（英字以外の大文字も対象。GitHub と同じ）
      .trim()
      .toLowerCase()
      // 2. 文字（各国語、結合文字を含む）、数字、`-`、`_`、空白以外を取り除く
      .replace(/[^\p{L}\p{M}\p{N}\s_-]/gu, "")
      // 3. 空白を1文字ずつ `-` に置き換える（連続しても詰めない。GitHub と同じ）
      .replace(/\s/gu, "-")
  );
}
