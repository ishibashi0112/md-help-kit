// HelpDrawer（DESIGN.md 9.1節）
import {
  type FocusEvent,
  type KeyboardEvent,
  type ReactNode,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { HelpContent, useHelp } from "../core/index.js";
import { BackIcon, CloseIcon, ContentsIcon } from "./icons.js";
import { type HelpLabelsInput, resolveLabels } from "./labels.js";
import { LabelsContext, proseOverrides } from "./prose.js";
import { SearchBox, SearchResults } from "./search-box.js";
import { Toc } from "./toc.js";

export interface HelpDrawerProps {
  /** 表示する側。既定は right */
  side?: "right" | "left";
  /** 文言。渡した項目だけを標準（英語）に重ねる。日本語は jaLabels */
  labels?: HelpLabelsInput;
  /** ライトとダークを固定する。省略時は prefers-color-scheme と、html などに付けた data-mhk-theme に従う */
  theme?: "light" | "dark";
}

/**
 * ヘルプのドロワー。画面の端に、モーダルにせず表示する（ヘルプを開いたままアプリを操作できる）。
 * 閉じているときは何も描画しない。
 */
export function HelpDrawer(props: HelpDrawerProps): ReactNode {
  const { isOpen } = useHelp();
  if (!isOpen) return null;
  return createPortal(<DrawerPanel {...props} />, document.body);
}

type View = "content" | "contents";

function DrawerPanel({ side = "right", labels: labelsInput, theme }: HelpDrawerProps): ReactNode {
  const help = useHelp();
  const labels = useMemo(() => resolveLabels(labelsInput), [labelsInput]);
  const [view, setView] = useState<View>("content");
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLElement>(null);
  // ドロワーにフォーカスが入る前の要素。閉じたときにフォーカスを戻す
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const searching = query.trim() !== "";
  // 何も開いていなければ目次を出す
  const activeView = searching ? "search" : help.current === null ? "contents" : view;

  const showContent = () => {
    setQuery("");
    setView("content");
  };
  const select = (target: string) => {
    help.navigate(target);
    showContent();
  };
  const close = () => {
    const root = rootRef.current;
    const restore =
      root !== null && root.contains(document.activeElement) ? returnFocusRef.current : null;
    help.close();
    if (restore?.isConnected) restore.focus();
  };

  const onFocus = (event: FocusEvent<HTMLElement>) => {
    const from = event.relatedTarget;
    if (from instanceof HTMLElement && !rootRef.current?.contains(from)) {
      returnFocusRef.current = from;
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      close();
    }
  };

  // 戻るボタン: 本文では履歴を戻る。目次と検索結果では本文に戻る
  const back =
    activeView === "content"
      ? { onClick: () => help.back(), disabled: !help.canGoBack }
      : { onClick: showContent, disabled: help.current === null };

  return (
    <LabelsContext.Provider value={labels}>
      <aside
        ref={rootRef}
        className="mhk-drawer"
        data-mhk-side={side}
        data-mhk-theme={theme}
        role="complementary"
        aria-label={labels.title}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
      >
        <header className="mhk-header">
          <button
            type="button"
            className="mhk-icon-button"
            aria-label={labels.back}
            title={labels.back}
            onClick={back.onClick}
            disabled={back.disabled}
          >
            <BackIcon />
          </button>
          <h2 className="mhk-title">{labels.title}</h2>
          <button
            type="button"
            className="mhk-icon-button"
            aria-label={labels.contents}
            title={labels.contents}
            aria-pressed={activeView === "contents"}
            onClick={() => {
              setQuery("");
              setView(activeView === "contents" ? "content" : "contents");
            }}
          >
            <ContentsIcon />
          </button>
          <button
            type="button"
            className="mhk-icon-button"
            aria-label={labels.close}
            title={labels.close}
            onClick={close}
          >
            <CloseIcon />
          </button>
        </header>
        <div className="mhk-search-area">
          <SearchBox query={query} onQueryChange={setQuery} />
        </div>
        <div className="mhk-body">
          {activeView === "search" && <SearchResults query={query.trim()} onSelect={select} />}
          {activeView === "contents" && <Toc onSelect={select} />}
          {activeView === "content" && <PageView onGoToContents={() => setView("contents")} />}
        </div>
      </aside>
    </LabelsContext.Provider>
  );
}

/** 本文。状態ごとの表示（読み込み中、ページなし、取得失敗）もここで行う */
function PageView({ onGoToContents }: { onGoToContents: () => void }): ReactNode {
  const help = useHelp();
  const labels = useContext(LabelsContext);
  switch (help.current?.status) {
    case "loading":
      return (
        <p className="mhk-status" role="status">
          {labels.loading}
        </p>
      );
    case "not-found":
      return (
        <div className="mhk-status" role="alert">
          <p>{labels.notFound}</p>
          <button type="button" className="mhk-action" onClick={onGoToContents}>
            {labels.goToContents}
          </button>
        </div>
      );
    case "error":
      return (
        <div className="mhk-status" role="alert">
          <p>{labels.loadError}</p>
          <button type="button" className="mhk-action" onClick={() => help.reload()}>
            {labels.retry}
          </button>
        </div>
      );
    default:
      return <HelpContent className="mhk-prose" overrides={proseOverrides} />;
  }
}
