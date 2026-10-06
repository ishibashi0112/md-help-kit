// 検索欄と検索結果（DESIGN.md 8章、9.1節）
import { type KeyboardEvent, type ReactNode, useContext, useEffect, useState } from "react";
import { type HelpSearchHit, useHelp } from "../core/index.js";
import { SearchIcon } from "./icons.js";
import { LabelsContext } from "./prose.js";

/** 入力が止まってから検索するまでの時間（ミリ秒） */
const SEARCH_DELAY = 200;

export interface SearchBoxProps {
  query: string;
  onQueryChange: (query: string) => void;
}

/** 検索欄。文字があるときの Esc は文字を消すだけにし、ドロワーは閉じない */
export function SearchBox({ query, onQueryChange }: SearchBoxProps): ReactNode {
  const labels = useContext(LabelsContext);
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape" && query !== "") {
      event.preventDefault();
      event.stopPropagation();
      onQueryChange("");
    }
  };
  return (
    <label className="mhk-search">
      <SearchIcon />
      <input
        type="search"
        className="mhk-search-input"
        value={query}
        placeholder={labels.search}
        aria-label={labels.search}
        onChange={(event) => onQueryChange(event.target.value)}
        onKeyDown={onKeyDown}
      />
    </label>
  );
}

type SearchState =
  | { status: "searching" }
  | { status: "done"; hits: HelpSearchHit[] }
  | { status: "error" };

export interface SearchResultsProps {
  query: string;
  /** 結果を選んだときに呼ぶ（ドロワーは検索語を消して本文の画面に戻る） */
  onSelect: (target: string) => void;
}

/** 検索結果。ページ名、見出し、抜粋を並べる */
export function SearchResults({ query, onSelect }: SearchResultsProps): ReactNode {
  const help = useHelp();
  const labels = useContext(LabelsContext);
  const [state, setState] = useState<SearchState>({ status: "searching" });
  const { search } = help;

  useEffect(() => {
    let cancelled = false;
    setState({ status: "searching" });
    const timer = setTimeout(() => {
      search(query).then(
        (hits) => {
          if (!cancelled) setState({ status: "done", hits });
        },
        () => {
          if (!cancelled) setState({ status: "error" });
        },
      );
    }, SEARCH_DELAY);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search, query]);

  if (state.status === "searching") {
    return (
      <p className="mhk-status" role="status">
        {labels.searching}
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p className="mhk-status" role="alert">
        {labels.searchError}
      </p>
    );
  }
  if (state.hits.length === 0) {
    return (
      <p className="mhk-status" role="status">
        {labels.noResults}
      </p>
    );
  }
  return (
    <ul className="mhk-results">
      {state.hits.map((hit) => (
        <li key={`${hit.pageId}#${hit.headingId ?? ""}`}>
          <button
            type="button"
            className="mhk-result"
            onClick={() => onSelect(hit.headingId === null ? hit.pageId : `${hit.pageId}#${hit.headingId}`)}
          >
            <span className="mhk-result-title">
              {hit.pageTitle}
              {hit.headingText !== null && hit.headingText !== hit.pageTitle && (
                <span className="mhk-result-heading">{hit.headingText}</span>
              )}
            </span>
            {hit.snippet !== "" && <span className="mhk-result-snippet">{hit.snippet}</span>}
          </button>
        </li>
      ))}
    </ul>
  );
}
