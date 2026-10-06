// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { HelpLoadError, HelpNotFoundError } from "./errors.js";
import { createHelpStore, type HelpStoreOptions } from "./store.js";
import type { HelpSource } from "./types.js";

const INDEX = [
  "- [受注一覧](orders.md)",
  "- 在庫",
  "  - [在庫照会](stock.md)",
  "  - [在庫数の色](stock/colors.md)",
].join("\n");

const FILES: Record<string, string> = {
  _index: INDEX,
  orders: "# 受注一覧\n\n受注を確認する。\n\n## 一括更新\n\nまとめて変更する。",
  stock: "# 在庫照会\n\n在庫を確認する。",
  "stock/colors": "# 色\n\n在庫が少ないと赤。",
  hidden: "# 目次にないページ\n\n本文",
  "no-heading": "本文だけ",
};

/** 中身を差し替えられる取得元。呼び出しは記録する */
function fakeSource(files: Record<string, string> = FILES) {
  const fail = new Map<string, unknown>();
  const source = {
    loadIndex: vi.fn(async () => source.loadPage("_index")),
    loadPage: vi.fn(async (id: string) => {
      if (fail.has(id)) throw fail.get(id);
      const content = files[id];
      if (content === undefined) throw new HelpNotFoundError(id);
      return content;
    }),
    fail,
  };
  return source;
}

/** 解決を手で制御できる取得元 */
function manualSource() {
  const pending = new Map<string, { resolve: (value: string) => void; reject: (e: unknown) => void }>();
  const wait = (id: string) =>
    new Promise<string>((resolve, reject) => {
      pending.set(id, { resolve, reject });
    });
  const source: HelpSource = {
    loadIndex: vi.fn(() => wait("_index")),
    loadPage: vi.fn((id: string) => wait(id)),
  };
  return { source, pending };
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(options: Partial<HelpStoreOptions> = {}) {
  const source = fakeSource();
  const store = createHelpStore({ source, ...options });
  store.start();
  return { source, store };
}

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("目次", () => {
  it("indexLoading が mount（既定）なら、start() で取得する", async () => {
    const { store, source } = setup();
    expect(store.getState().indexStatus).toBe("loading");
    await flush();
    expect(source.loadIndex).toHaveBeenCalledTimes(1);
    expect(store.getState().indexStatus).toBe("ready");
    expect(store.getState().index).toEqual([
      { type: "page", id: "orders", title: "受注一覧", children: [] },
      {
        type: "group",
        title: "在庫",
        children: [
          { type: "page", id: "stock", title: "在庫照会", children: [] },
          { type: "page", id: "stock/colors", title: "在庫数の色", children: [] },
        ],
      },
    ]);
  });

  it("indexLoading が open なら、最初に使うまで取得しない（idle）", async () => {
    for (const use of [
      (s: ReturnType<typeof createHelpStore>) => s.open(),
      (s: ReturnType<typeof createHelpStore>) => s.toggle(),
      (s: ReturnType<typeof createHelpStore>) => s.navigate("orders"),
      (s: ReturnType<typeof createHelpStore>) => void s.search("受注"),
    ]) {
      const { store, source } = setup({ indexLoading: "open" });
      await flush();
      expect(store.getState().indexStatus).toBe("idle");
      expect(source.loadIndex).not.toHaveBeenCalled();
      use(store);
      expect(store.getState().indexStatus).toBe("loading");
      await flush();
      expect(store.getState().indexStatus).toBe("ready");
    }
  });

  it("取得に失敗したら error。reload() で取得し直す", async () => {
    const { store, source } = setup();
    source.fail.set("_index", new HelpLoadError("_index", { status: 500 }));
    await flush();
    expect(store.getState().indexStatus).toBe("error");
    source.fail.delete("_index");
    store.reload();
    expect(store.getState().indexStatus).toBe("loading");
    await flush();
    expect(store.getState().indexStatus).toBe("ready");
  });
});

describe("開く、閉じる", () => {
  it("open(target) はそのページを開く", async () => {
    const { store } = setup();
    store.open("stock");
    expect(store.getState().isOpen).toBe(true);
    await flush();
    expect(store.getState().current?.id).toBe("stock");
  });

  it("target を省略したら、画面のページ、defaultPage、目次の先頭の順に選ぶ", async () => {
    const { store } = setup({ defaultPage: "stock" });
    await flush();
    store.setScreen(1, "stock/colors");
    store.open();
    expect(store.getState().current?.id).toBe("stock/colors");

    store.removeScreen(1);
    store.close();
    store.open();
    expect(store.getState().current?.id).toBe("stock");

    store.setDefaultPage(undefined);
    store.close();
    store.open();
    expect(store.getState().current?.id).toBe("orders");
  });

  it("目次の先頭を開くとき、目次がまだなら取得を待つ", async () => {
    const { source, pending } = manualSource();
    const store = createHelpStore({ source });
    store.start();
    store.open();
    expect(store.getState().current).toBeNull();
    await flush();
    pending.get("_index")?.resolve("- 群\n  - [最初](first.md)\n- [二番目](second.md)");
    await flush();
    expect(store.getState().current).toMatchObject({ id: "first", status: "loading" });
  });

  it("開くページが決まらないときは current は null のまま", async () => {
    const store = createHelpStore({ source: fakeSource({ _index: "目次なし" }) });
    store.start();
    await flush();
    store.open();
    expect(store.getState().isOpen).toBe(true);
    expect(store.getState().current).toBeNull();
  });

  it("toggle() は開閉を切り替える", () => {
    const { store } = setup({ defaultPage: "orders" });
    store.toggle();
    expect(store.getState().isOpen).toBe(true);
    store.toggle();
    expect(store.getState().isOpen).toBe(false);
  });
});

describe("ページの表示", () => {
  it("取得中は loading、取得できたら ready になり、本文と見出しが入る", async () => {
    const { store } = setup();
    await flush();
    store.navigate("orders");
    expect(store.getState().current).toEqual({
      id: "orders",
      title: "受注一覧",
      markdown: "",
      headings: [],
      headingId: null,
      status: "loading",
    });
    await flush();
    expect(store.getState().current).toEqual({
      id: "orders",
      title: "受注一覧",
      markdown: FILES.orders,
      headings: [
        { depth: 1, text: "受注一覧", id: "受注一覧" },
        { depth: 2, text: "一括更新", id: "一括更新" },
      ],
      headingId: null,
      status: "ready",
    });
  });

  it("目次にないページのタイトルは、最初の # 見出し、なければページID", async () => {
    const { store } = setup();
    await flush();
    store.navigate("hidden");
    await flush();
    expect(store.getState().current?.title).toBe("目次にないページ");
    store.navigate("no-heading");
    await flush();
    expect(store.getState().current?.title).toBe("no-heading");
  });

  it("存在しないページは not-found になり、警告する", async () => {
    const { store } = setup();
    store.navigate("missing");
    await flush();
    expect(store.getState().current).toMatchObject({ id: "missing", title: "missing", status: "not-found" });
    expect(warn).toHaveBeenCalledWith('[md-help-kit] The help page "missing" does not exist.');
  });

  it("取得に失敗したら error になる", async () => {
    const { store, source } = setup();
    source.fail.set("orders", new HelpLoadError("orders", { status: 500 }));
    store.navigate("orders");
    await flush();
    expect(store.getState().current?.status).toBe("error");
  });

  it("取得したページはキャッシュし、再び開くときは取得しない", async () => {
    const { store, source } = setup();
    store.navigate("orders");
    await flush();
    store.navigate("stock");
    await flush();
    store.navigate("orders");
    expect(store.getState().current?.status).toBe("ready");
    expect(source.loadPage.mock.calls.filter(([id]) => id === "orders")).toHaveLength(1);
  });

  it("見出しまで指すターゲットは headingId に入る", async () => {
    const { store } = setup();
    store.navigate("orders#一括更新");
    await flush();
    expect(store.getState().current).toMatchObject({ id: "orders", headingId: "一括更新" });
  });

  it("同じページ内の見出しへの移動は、取得し直さず、履歴にも積まない", async () => {
    const { store, source } = setup();
    store.navigate("orders");
    await flush();
    store.navigate("orders#一括更新");
    expect(store.getState().current).toMatchObject({ headingId: "一括更新", status: "ready" });
    store.navigate("#受注一覧");
    expect(store.getState().current).toMatchObject({ id: "orders", headingId: "受注一覧" });
    expect(store.getState().canGoBack).toBe(false);
    expect(source.loadPage.mock.calls.filter(([id]) => id === "orders")).toHaveLength(1);
  });

  it("ページIDのないターゲットは、ページを開いていなければ無視して警告する", () => {
    const { store } = setup();
    store.navigate("#一括更新");
    expect(store.getState().current).toBeNull();
    expect(warn).toHaveBeenCalledWith(
      '[md-help-kit] "#一括更新" was ignored because no help page is shown.',
    );
  });

  describe("取得の追い越し", () => {
    it("前のページの取得が先に終わっても、後から開いたページは取得中のまま", async () => {
      const { source, pending } = manualSource();
      const store = createHelpStore({ source, indexLoading: "open" });
      store.navigate("slow");
      store.navigate("fast");
      await flush();
      pending.get("slow")?.resolve("# 遅い");
      await flush();
      expect(store.getState().current).toMatchObject({ id: "fast", status: "loading" });
      pending.get("fast")?.resolve("# 速い");
      await flush();
      expect(store.getState().current).toMatchObject({ id: "fast", markdown: "# 速い", status: "ready" });
    });

    it("前のページの取得が後から失敗しても、表示中のページには影響しない", async () => {
      const { source, pending } = manualSource();
      const store = createHelpStore({ source, indexLoading: "open" });
      store.navigate("slow");
      store.navigate("fast");
      await flush();
      pending.get("fast")?.resolve("# 速い");
      await flush();
      pending.get("slow")?.reject(new HelpNotFoundError("slow"));
      await flush();
      expect(store.getState().current).toMatchObject({ id: "fast", status: "ready" });
    });

    it("reload の前に始めた取得が終わっても、取得し直した結果を待つ", async () => {
      const { source, pending } = manualSource();
      const store = createHelpStore({ source, indexLoading: "open" });
      store.navigate("orders");
      await flush();
      const before = pending.get("orders");
      store.reload();
      await flush();
      before?.resolve("# 古い");
      await flush();
      expect(store.getState().current).toMatchObject({ id: "orders", status: "loading" });
      pending.get("orders")?.resolve("# 新しい");
      await flush();
      expect(store.getState().current).toMatchObject({ markdown: "# 新しい", status: "ready" });
    });
  });
});

describe("履歴", () => {
  it("別のページへ移るときに直前のページを積み、back() で戻る", async () => {
    const { store } = setup();
    store.navigate("orders#一括更新");
    store.navigate("stock");
    store.navigate("stock/colors");
    expect(store.getState().canGoBack).toBe(true);
    store.back();
    expect(store.getState().current?.id).toBe("stock");
    store.back();
    expect(store.getState().current).toMatchObject({ id: "orders", headingId: "一括更新" });
    expect(store.getState().canGoBack).toBe(false);
    store.back();
    expect(store.getState().current?.id).toBe("orders");
  });

  it("閉じた状態からの open で別のページになるときも積み、閉じても履歴は残す", async () => {
    const { store } = setup();
    store.open("orders");
    store.close();
    expect(store.getState().canGoBack).toBe(false);
    store.open("stock");
    expect(store.getState().canGoBack).toBe(true);
    store.close();
    expect(store.getState().canGoBack).toBe(true);
    // 同じページを開き直すときは積まない
    store.open("stock");
    store.back();
    expect(store.getState().current?.id).toBe("orders");
    expect(store.getState().canGoBack).toBe(false);
  });
});

describe("画面の宣言", () => {
  it("order の大きい宣言が有効で、解除されたら1つ前に戻る", () => {
    const { store } = setup();
    store.setScreen(2, "orders");
    store.setScreen(5, "stock");
    store.setScreen(3, "stock/colors");
    expect(store.getState().screenTarget).toBe("stock");
    store.removeScreen(5);
    expect(store.getState().screenTarget).toBe("stock/colors");
    store.removeScreen(3);
    expect(store.getState().screenTarget).toBe("orders");
    store.removeScreen(2);
    expect(store.getState().screenTarget).toBeNull();
  });

  it("null の宣言は、宣言がないものとして扱う", () => {
    const { store } = setup();
    store.setScreen(1, "orders");
    store.setScreen(2, null);
    expect(store.getState().screenTarget).toBe("orders");
  });

  it("ターゲットを変えても、スタック上の位置は変わらない", () => {
    const { store } = setup();
    store.setScreen(1, "orders");
    store.setScreen(2, "stock");
    store.setScreen(1, "stock/colors");
    expect(store.getState().screenTarget).toBe("stock");
    store.removeScreen(2);
    expect(store.getState().screenTarget).toBe("stock/colors");
  });

  it("ドロワーが開いている間は、画面のページに追従し、直前のページを履歴に積む", async () => {
    const { store } = setup();
    store.setScreen(1, "orders");
    store.open();
    store.setScreen(2, "stock#在庫照会");
    expect(store.getState().current).toMatchObject({ id: "stock", headingId: "在庫照会" });
    store.back();
    expect(store.getState().current?.id).toBe("orders");
  });

  it("閉じている間は追従しない。画面のターゲットが null になっても表示は変えない", () => {
    const { store } = setup();
    store.open("orders");
    store.close();
    store.setScreen(1, "stock");
    expect(store.getState().current?.id).toBe("orders");
    store.open();
    expect(store.getState().current?.id).toBe("stock");
    store.removeScreen(1);
    expect(store.getState().current?.id).toBe("stock");
  });
});

describe("reload", () => {
  it("キャッシュを捨て、目次と表示中のページを取得し直す", async () => {
    const files = { ...FILES };
    const { store, source } = (() => {
      const source = fakeSource(files);
      const store = createHelpStore({ source });
      store.start();
      return { source, store };
    })();
    store.navigate("orders");
    await flush();
    files.orders = "# 新しい受注一覧";
    store.reload();
    expect(store.getState().current?.status).toBe("loading");
    await flush();
    expect(store.getState().current).toMatchObject({ markdown: "# 新しい受注一覧", status: "ready" });
    expect(source.loadIndex).toHaveBeenCalledTimes(2);
  });
});

describe("search", () => {
  it("初回の検索で目次の全ページを取得し、以後はキャッシュを使う", async () => {
    const { store, source } = setup();
    const hits = await store.search("在庫");
    expect(hits.map((hit) => [hit.pageId, hit.pageTitle, hit.headingId])).toEqual([
      // タイトルは目次のものを使う（タイトル一致のページでは、先頭の h1 の区間を重ねて返さない）
      ["stock", "在庫照会", null],
      ["stock/colors", "在庫数の色", null],
    ]);
    const loaded = source.loadPage.mock.calls.map(([id]) => id).filter((id) => id !== "_index");
    expect(loaded.sort()).toEqual(["orders", "stock", "stock/colors"]);

    await store.search("受注");
    expect(source.loadPage.mock.calls.filter(([id]) => id !== "_index")).toHaveLength(3);
  });

  it("目次のページを並行して取得する", async () => {
    const { source, pending } = manualSource();
    const store = createHelpStore({ source });
    store.start();
    await flush();
    pending.get("_index")?.resolve("- [a](a.md)\n- [b](b.md)");
    const result = store.search("本文");
    await flush();
    expect([...pending.keys()].filter((id) => id !== "_index").sort()).toEqual(["a", "b"]);
    pending.get("a")?.resolve("本文 a");
    pending.get("b")?.resolve("本文 b");
    expect((await result).map((hit) => hit.pageId)).toEqual(["a", "b"]);
  });

  it("取得に失敗したページは結果から除き、次の検索で取得し直す", async () => {
    const { store, source } = setup();
    source.fail.set("stock", new HelpLoadError("stock", { status: 500 }));
    const pageIds = async () => [...new Set((await store.search("在庫")).map((hit) => hit.pageId))];
    expect(await pageIds()).toEqual(["stock/colors"]);
    source.fail.delete("stock");
    expect(await pageIds()).toEqual(["stock", "stock/colors"]);
  });

  it("目次が取得できなければ、そのエラーで reject する", async () => {
    const { store, source } = setup();
    const error = new HelpLoadError("_index", { status: 500 });
    source.fail.set("_index", error);
    await expect(store.search("在庫")).rejects.toBe(error);
  });

  it("空の検索語は、取得せずに結果なし", async () => {
    const { store, source } = setup({ indexLoading: "open" });
    await expect(store.search(" 　")).resolves.toEqual([]);
    expect(source.loadIndex).not.toHaveBeenCalled();
  });

  it("表示のキャッシュを共有する", async () => {
    const { store, source } = setup();
    store.navigate("orders");
    await flush();
    await store.search("在庫");
    expect(source.loadPage.mock.calls.filter(([id]) => id === "orders")).toHaveLength(1);
  });
});

describe("setSource", () => {
  it("キャッシュと履歴を捨て、新しい取得元から目次と表示中のページを取得し直す", async () => {
    const { store } = setup();
    store.open("orders");
    store.navigate("stock");
    await flush();
    const next = fakeSource({ _index: "- [新しい在庫](stock.md)", stock: "# 新しい在庫" });
    store.setSource(next);
    expect(store.getState().canGoBack).toBe(false);
    expect(store.getState().isOpen).toBe(true);
    await flush();
    expect(store.getState().index).toEqual([
      { type: "page", id: "stock", title: "新しい在庫", children: [] },
    ]);
    expect(store.getState().current).toMatchObject({ markdown: "# 新しい在庫", status: "ready" });
  });

  it("同じ取得元なら何もしない", async () => {
    const { store, source } = setup();
    await flush();
    store.setSource(source);
    expect(source.loadIndex).toHaveBeenCalledTimes(1);
  });

  it("差し替え前の取得の結果は使わない", async () => {
    const { source, pending } = manualSource();
    const store = createHelpStore({ source });
    store.start();
    store.navigate("orders");
    await flush();
    store.setSource(fakeSource({ _index: "", orders: "# 新" }));
    await flush();
    expect(store.getState().indexStatus).toBe("ready");
    // 新しい取得元の結果が出たあとで、古い取得元の結果が届く
    pending.get("_index")?.resolve("- [古い](old.md)");
    pending.get("orders")?.resolve("# 古");
    await flush();
    expect(store.getState().index).toEqual([]);
    expect(store.getState().current?.markdown).toBe("# 新");
  });
});

describe("購読", () => {
  it("状態が変わると通知し、getState() は新しい値を返す", () => {
    const { store } = setup();
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    const before = store.getState();
    store.open("orders");
    expect(listener).toHaveBeenCalled();
    expect(store.getState()).not.toBe(before);
    unsubscribe();
    listener.mockClear();
    store.close();
    expect(listener).not.toHaveBeenCalled();
  });
});
