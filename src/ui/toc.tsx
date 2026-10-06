// 全体目次と、表示中のページの見出し（ページ内目次）（DESIGN.md 9.1節）
import { type ReactNode, useContext } from "react";
import { type HelpIndexNode, useHelp } from "../core/index.js";
import { LabelsContext } from "./prose.js";

export interface TocProps {
  /** ページや見出しを選んだときに呼ぶ（ドロワーは本文の画面に戻る） */
  onSelect: (target: string) => void;
}

/** 全体目次。表示中のページの下には、そのページの h2 と h3 を入れ子で並べる */
export function Toc({ onSelect }: TocProps): ReactNode {
  const help = useHelp();
  const labels = useContext(LabelsContext);

  if (help.indexStatus === "idle" || help.indexStatus === "loading") {
    return (
      <p className="mhk-status" role="status">
        {labels.loading}
      </p>
    );
  }
  if (help.indexStatus === "error") {
    return (
      <div className="mhk-status" role="alert">
        <p>{labels.loadError}</p>
        <button type="button" className="mhk-action" onClick={() => help.reload()}>
          {labels.retry}
        </button>
      </div>
    );
  }

  const currentId = help.current?.id;
  const headings = (help.current?.headings ?? []).filter((h) => h.depth === 2 || h.depth === 3);

  const renderNodes = (nodes: HelpIndexNode[]): ReactNode => (
    <ul className="mhk-toc-list">
      {nodes.map((node, i) =>
        node.type === "group" ? (
          // グループは ID を持たないので、位置をキーにする
          <li key={`group-${i}`} className="mhk-toc-group">
            <span className="mhk-toc-group-title">{node.title}</span>
            {node.children.length > 0 && renderNodes(node.children)}
          </li>
        ) : (
          <li key={`page-${node.id}-${i}`}>
            <button
              type="button"
              className="mhk-toc-item"
              aria-current={node.id === currentId ? "page" : undefined}
              onClick={() => onSelect(node.id)}
            >
              {node.title}
            </button>
            {node.id === currentId && headings.length > 0 && (
              <ul className="mhk-toc-list mhk-toc-headings">
                {headings.map((heading) => (
                  <li key={heading.id}>
                    <button
                      type="button"
                      className="mhk-toc-item mhk-toc-heading"
                      data-depth={heading.depth}
                      onClick={() => onSelect(`${node.id}#${heading.id}`)}
                    >
                      {heading.text}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {node.children.length > 0 && renderNodes(node.children)}
          </li>
        ),
      )}
    </ul>
  );

  return <nav className="mhk-toc">{renderNodes(help.index)}</nav>;
}
