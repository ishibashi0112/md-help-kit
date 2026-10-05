// _index.md（目次）の解析（DESIGN.md 3.1節）
import { classifyLink } from "./links.js";
import { type MdList, type MdListItem, parseMarkdown } from "./markdown.js";
import type { HelpIndexNode } from "./types.js";
import { devWarn } from "./warn.js";

/**
 * _index.md の中身から目次ツリーを作る。
 * リスト以外の要素は無視する。リストが複数あるときは、出てくる順につなげる。
 * 解釈できない項目は、その下に入れ子になった項目ごと無視する（開発時は警告を出す）。
 */
export function parseIndex(markdown: string): HelpIndexNode[] {
  return parseMarkdown(markdown)
    .blocks.filter((block): block is MdList => block.type === "list")
    .flatMap(toNodes);
}

function toNodes(list: MdList): HelpIndexNode[] {
  return list.items.flatMap((item) => {
    const node = toNode(item);
    if (typeof node === "string") {
      devWarn(
        `_index.md: ignored "${item.text}" and its nested items because ${node}.`,
      );
      return [];
    }
    return [node];
  });
}

/** 項目を目次の1項目にする。解釈できないときは、その理由（警告の文言）を返す */
function toNode(item: MdListItem): HelpIndexNode | string {
  const children = () => item.lists.flatMap(toNodes);

  const [link, ...rest] = item.links;
  if (link === undefined) {
    if (item.text === "") return "it is empty";
    return { type: "group", title: item.text, children: children() };
  }
  if (rest.length > 0) return "it has more than one link";
  if (link.text === "") return "the link has no text";
  if (link.href === null) return "the link URL is not allowed";

  // _index.md は docs ルートにあるので、そこからの相対で解決する
  const kind = classifyLink(link.href, "_index");
  if (kind.type !== "page") return "the link does not point to a .md file in the docs folder";
  if (kind.target.includes("#")) return "the link points to a heading (#)";

  // リンクの外の文字は無視する（タイトルはリンクの文字だけ）
  return { type: "page", id: kind.target, title: link.text, children: children() };
}
