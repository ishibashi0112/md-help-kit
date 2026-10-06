// 状態管理（DESIGN.md 5章）。React に依存しない。
// HelpProvider が1つ作り、useHelp() が useSyncExternalStore で読む
import { HelpNotFoundError } from "./errors.js";
import { getHeadings } from "./headings.js";
import { type MdDocument, parseMarkdown } from "./markdown.js";
import { parseIndex } from "./parse-index.js";
import { buildSearchIndex, type SearchIndex, searchIndex } from "./search.js";
import type {
  HelpApi,
  HelpCurrentPage,
  HelpHeading,
  HelpIndexNode,
  HelpIndexStatus,
  HelpPageStatus,
  HelpSearchHit,
  HelpSource,
} from "./types.js";
import { devWarn } from "./warn.js";

/** 目次を取得する時期。mount は HelpProvider のマウント時、open は最初に使うとき */
export type IndexLoading = "mount" | "open";

export interface HelpStoreOptions {
  source: HelpSource;
  defaultPage?: string;
  indexLoading?: IndexLoading;
}

/** useHelp() が返すもののうち、状態の部分 */
export type HelpState = Pick<
  HelpApi,
  "isOpen" | "index" | "indexStatus" | "current" | "screenTarget" | "canGoBack"
>;

export interface HelpStore
  extends Pick<HelpApi, "open" | "close" | "toggle" | "navigate" | "back" | "reload" | "search"> {
  getState(): HelpState;
  subscribe(listener: () => void): () => void;
  /** HelpProvider のマウント時に呼ぶ。indexLoading が mount なら目次を取得する */
  start(): void;
  /** 取得元を差し替える。キャッシュと履歴を捨て、目次と表示中のページを取得し直す */
  setSource(source: HelpSource): void;
  setDefaultPage(page: string | undefined): void;
  /**
   * 画面の宣言（useHelpPage）を登録、更新する。
   * order はレンダーの順で、大きいもの（後から、または子としてレンダーされたもの）ほど優先する。
   * target が null の宣言は、宣言がないものとして扱う。
   */
  setScreen(order: number, target: string | null): void;
  removeScreen(order: number): void;
}

interface LoadedPage {
  markdown: string;
  doc: MdDocument;
  headings: HelpHeading[];
}

/** 表示中のページのうち、状態から求めない部分 */
interface CurrentEntry {
  id: string;
  headingId: string | null;
  status: HelpPageStatus;
}

export function createHelpStore(options: HelpStoreOptions): HelpStore {
  let source = options.source;
  let defaultPage = options.defaultPage;
  const indexLoading = options.indexLoading ?? "mount";

  // 取得元の差し替えと reload で増やす。古い取得の結果をキャッシュに入れないため
  let generation = 0;

  let isOpen = false;

  let index: HelpIndexNode[] = [];
  let indexStatus: HelpIndexStatus = indexLoading === "mount" ? "loading" : "idle";
  let indexError: unknown;
  let indexRequest: Promise<void> | null = null;
  let titles = new Map<string, string>();

  const screens = new Map<number, string | null>();
  let screenTarget: string | null = null;

  let current: CurrentEntry | null = null;
  // 表示中のページの取得ごとに増やす。後から始めた取得の結果だけを使うため
  let pageToken = 0;
  let history: string[] = [];
  // 開くページが目次の先頭に決まったが、目次がまだ取得できていない
  let openFirstPageWhenIndexReady = false;

  const pages = new Map<string, LoadedPage>();
  const pageRequests = new Map<string, Promise<LoadedPage>>();
  let searchCache: SearchIndex | null = null;
  let searchRequest: Promise<SearchIndex> | null = null;

  const listeners = new Set<() => void>();
  let state = buildState();

  function buildState(): HelpState {
    return {
      isOpen,
      index,
      indexStatus,
      current: current && buildCurrent(current),
      screenTarget,
      canGoBack: history.length > 0,
    };
  }

  function buildCurrent(entry: CurrentEntry): HelpCurrentPage {
    const page = entry.status === "ready" ? pages.get(entry.id) : undefined;
    const h1 = page?.headings.find((heading) => heading.depth === 1);
    return {
      id: entry.id,
      title: titles.get(entry.id) ?? h1?.text ?? entry.id,
      markdown: page?.markdown ?? "",
      headings: page?.headings ?? [],
      headingId: entry.headingId,
      status: entry.status,
    };
  }

  function emit(): void {
    state = buildState();
    for (const listener of [...listeners]) listener();
  }

  // 目次

  function requestIndex(): Promise<void> {
    if (indexRequest !== null) return indexRequest;
    const requested = generation;
    if (indexStatus !== "loading") {
      indexStatus = "loading";
      emit();
    }
    indexRequest = Promise.resolve()
      .then(() => source.loadIndex())
      .then(
        (markdown) => {
          if (requested !== generation) return;
          index = parseIndex(markdown);
          titles = titleMap(index);
          indexStatus = "ready";
          indexError = undefined;
          emit();
          if (openFirstPageWhenIndexReady) {
            openFirstPageWhenIndexReady = false;
            const first = firstPageId(index);
            if (isOpen && first !== null) show(first, true);
          }
        },
        (error: unknown) => {
          if (requested !== generation) return;
          indexStatus = "error";
          indexError = error;
          openFirstPageWhenIndexReady = false;
          emit();
        },
      );
    return indexRequest;
  }

  // ページ

  function loadPage(id: string): Promise<LoadedPage> {
    const cached = pages.get(id);
    if (cached) return Promise.resolve(cached);
    const pending = pageRequests.get(id);
    if (pending) return pending;

    const requested = generation;
    const request = Promise.resolve()
      .then(() => source.loadPage(id))
      .then(
        (markdown) => {
          const doc = parseMarkdown(markdown);
          const page = { markdown, doc, headings: getHeadings(doc) };
          if (requested === generation) pages.set(id, page);
          return page;
        },
        (error: unknown) => {
          if (isNotFound(error)) devWarn(`The help page "${id}" does not exist.`);
          throw error;
        },
      )
      .finally(() => {
        if (pageRequests.get(id) === request) pageRequests.delete(id);
      });
    pageRequests.set(id, request);
    return request;
  }

  /** ターゲットのページを表示する。push が true なら、別のページに移るときに直前のページを履歴に積む */
  function show(target: string, push: boolean): void {
    const parsed = parseTarget(target);
    const id = parsed.pageId === "" ? current?.id : parsed.pageId;
    if (id === undefined) {
      devWarn(`"${target}" was ignored because no help page is shown.`);
      return;
    }
    openFirstPageWhenIndexReady = false;

    // 同じページ内の見出しへの移動は、取得し直さず、履歴にも積まない
    if (current !== null && current.id === id) {
      if (current.headingId !== parsed.headingId) {
        current = { ...current, headingId: parsed.headingId };
        emit();
      }
      return;
    }

    if (push && current !== null) history.push(formatTarget(current));
    const cached = pages.has(id);
    current = { id, headingId: parsed.headingId, status: cached ? "ready" : "loading" };
    emit();
    if (!cached) fetchCurrent();
  }

  function fetchCurrent(): void {
    if (current === null) return;
    const id = current.id;
    const token = ++pageToken;
    const settle = (status: HelpPageStatus) => {
      if (token !== pageToken || current?.id !== id) return;
      current = { ...current, status };
      emit();
    };
    loadPage(id).then(
      () => settle("ready"),
      (error: unknown) => settle(isNotFound(error) ? "not-found" : "error"),
    );
  }

  // 検索

  function searchIndexFor(requested: number): Promise<SearchIndex> {
    if (searchCache !== null) return Promise.resolve(searchCache);
    if (searchRequest !== null) return searchRequest;

    const entries = indexPages(index);
    const request = Promise.allSettled(entries.map((entry) => loadPage(entry.id))).then(
      (results) => {
        const built = buildSearchIndex(
          entries.flatMap((entry, i) => {
            const result = results[i];
            return result?.status === "fulfilled"
              ? [{ id: entry.id, title: entry.title, doc: result.value.doc }]
              : [];
          }),
        );
        if (requested === generation) {
          searchRequest = null;
          // 取得に失敗したページがあれば、次の検索で取得し直す
          if (results.every((result) => result.status === "fulfilled")) searchCache = built;
        }
        return built;
      },
    );
    searchRequest = request;
    return request;
  }

  async function search(query: string): Promise<HelpSearchHit[]> {
    if (query.trim() === "") return [];
    const requested = generation;
    await requestIndex();
    if (requested !== generation) return search(query);
    if (indexStatus === "error") throw indexError;
    const built = await searchIndexFor(requested);
    if (requested !== generation) return search(query);
    return searchIndex(built, query);
  }

  // キャッシュを捨てて、目次と表示中のページを取得し直す
  function refetch(): void {
    generation++;
    pages.clear();
    pageRequests.clear();
    searchCache = null;
    searchRequest = null;
    if (indexRequest !== null || indexStatus !== "idle") {
      indexRequest = null;
      requestIndex();
    }
    if (current !== null) {
      current = { ...current, status: "loading" };
      fetchCurrent();
    }
    emit();
  }

  function updateScreenTarget(): void {
    let top = Number.NEGATIVE_INFINITY;
    let next: string | null = null;
    for (const [order, target] of screens) {
      if (target !== null && order > top) {
        top = order;
        next = target;
      }
    }
    if (next === screenTarget) return;
    screenTarget = next;
    // ドロワーが開いている間は、画面のページに追従する（null になったときは表示を変えない）
    if (isOpen && next !== null) show(next, true);
    emit();
  }

  function open(target?: string): void {
    requestIndex();
    isOpen = true;
    const resolved = target ?? screenTarget ?? defaultPage;
    if (resolved !== undefined && resolved !== null) {
      show(resolved, true);
    } else if (indexStatus === "ready") {
      const first = firstPageId(index);
      if (first !== null) show(first, true);
    } else if (indexStatus === "loading") {
      openFirstPageWhenIndexReady = true;
    }
    emit();
  }

  function close(): void {
    isOpen = false;
    openFirstPageWhenIndexReady = false;
    emit();
  }

  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    start() {
      if (indexLoading === "mount") requestIndex();
    },
    setSource(next) {
      if (next === source) return;
      source = next;
      history = [];
      refetch();
    },
    setDefaultPage(page) {
      defaultPage = page;
    },
    setScreen(order, target) {
      screens.set(order, target);
      updateScreenTarget();
    },
    removeScreen(order) {
      if (!screens.delete(order)) return;
      updateScreenTarget();
    },
    open,
    close,
    toggle() {
      if (isOpen) close();
      else open();
    },
    navigate(target) {
      requestIndex();
      show(target, true);
    },
    back() {
      const target = history.pop();
      if (target === undefined) return;
      show(target, false);
      emit();
    },
    reload: refetch,
    search,
  };
}

function parseTarget(target: string): { pageId: string; headingId: string | null } {
  const hashIndex = target.indexOf("#");
  if (hashIndex === -1) return { pageId: target, headingId: null };
  const headingId = target.slice(hashIndex + 1);
  return { pageId: target.slice(0, hashIndex), headingId: headingId === "" ? null : headingId };
}

function formatTarget(entry: CurrentEntry): string {
  return entry.headingId === null ? entry.id : `${entry.id}#${entry.headingId}`;
}

/** 取得元のライブラリが重複して読み込まれていても判定できるよう、名前でも確かめる */
function isNotFound(error: unknown): boolean {
  return (
    error instanceof HelpNotFoundError ||
    (error instanceof Error && error.name === "HelpNotFoundError")
  );
}

/** 目次のページを深さ優先の順に並べる（同じページIDは最初のものだけ） */
function indexPages(nodes: HelpIndexNode[]): { id: string; title: string }[] {
  const result: { id: string; title: string }[] = [];
  const seen = new Set<string>();
  const visit = (node: HelpIndexNode) => {
    if (node.type === "page" && !seen.has(node.id)) {
      seen.add(node.id);
      result.push({ id: node.id, title: node.title });
    }
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return result;
}

function titleMap(nodes: HelpIndexNode[]): Map<string, string> {
  return new Map(indexPages(nodes).map((page) => [page.id, page.title]));
}

function firstPageId(nodes: HelpIndexNode[]): string | null {
  return indexPages(nodes)[0]?.id ?? null;
}
