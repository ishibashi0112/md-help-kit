import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import { type ReactNode, StrictMode, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpNotFoundError } from "./errors.js";
import { useHelp, useHelpPage } from "./hooks.js";
import { HelpProvider, type HelpProviderProps } from "./provider.js";
import type { HelpApi, HelpSource } from "./types.js";

function fakeSource(files: Record<string, string>): HelpSource {
  return {
    loadIndex: vi.fn(async () => files._index ?? ""),
    loadPage: vi.fn(async (id: string) => {
      const content = files[id];
      if (content === undefined) throw new HelpNotFoundError(id);
      return content;
    }),
  };
}

const FILES = {
  _index: "- [受注一覧](orders.md)\n- [在庫照会](stock.md)",
  orders: "# 受注一覧\n\n## 一括更新",
  stock: "# 在庫照会",
  dialog: "# ダイアログ",
};

/** useHelp() の最新の値を外から見られるようにする */
let help: HelpApi;
function Probe() {
  help = useHelp();
  return null;
}

function Page({ target, children }: { target: string | null; children?: ReactNode }) {
  useHelpPage(target);
  return <>{children}</>;
}

function setup(ui: ReactNode, props: Partial<HelpProviderProps> = {}) {
  const source = props.source ?? fakeSource(FILES);
  const result = render(
    <HelpProvider source={source} {...props}>
      <Probe />
      {ui}
    </HelpProvider>,
  );
  return { source, ...result };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HelpProvider の外", () => {
  it("useHelp と useHelpPage はエラーを投げる", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useHelp())).toThrow(
      "useHelp() must be used inside <HelpProvider>.",
    );
    expect(() => renderHook(() => useHelpPage("orders"))).toThrow(
      "useHelpPage() must be used inside <HelpProvider>.",
    );
  });
});

describe("目次の取得", () => {
  it("indexLoading を省略したら、マウント時に取得する", async () => {
    const { source } = setup(null);
    await flush();
    expect(source.loadIndex).toHaveBeenCalledTimes(1);
    expect(help.indexStatus).toBe("ready");
    expect(help.index.map((node) => node.title)).toEqual(["受注一覧", "在庫照会"]);
  });

  it("indexLoading が open なら、最初に開くまで取得しない", async () => {
    const { source } = setup(null, { indexLoading: "open" });
    await flush();
    expect(help.indexStatus).toBe("idle");
    expect(source.loadIndex).not.toHaveBeenCalled();
    act(() => help.open());
    await flush();
    expect(help.indexStatus).toBe("ready");
  });
});

describe("画面連動（useHelpPage）", () => {
  it("最後にマウントされた宣言が有効で、アンマウントされたら1つ前に戻る", async () => {
    function App() {
      const [dialog, setDialog] = useState(false);
      return (
        <Page target="orders">
          <button type="button" onClick={() => setDialog((v) => !v)}>
            ダイアログ
          </button>
          {dialog && <Page target="dialog" />}
        </Page>
      );
    }
    setup(<App />);
    expect(help.screenTarget).toBe("orders");
    act(() => screen.getByRole("button").click());
    expect(help.screenTarget).toBe("dialog");
    act(() => screen.getByRole("button").click());
    expect(help.screenTarget).toBe("orders");
  });

  it("同時にマウントされた親子では、子の宣言が有効", () => {
    setup(
      <Page target="orders">
        <Page target="orders#一括更新" />
      </Page>,
    );
    expect(help.screenTarget).toBe("orders#一括更新");
  });

  it("後にある兄弟の宣言が有効", () => {
    setup(
      <>
        <Page target="orders" />
        <Page target="stock" />
      </>,
    );
    expect(help.screenTarget).toBe("stock");
  });

  it("null は宣言なしとして扱う", () => {
    setup(
      <Page target="orders">
        <Page target={null} />
      </Page>,
    );
    expect(help.screenTarget).toBe("orders");
  });

  it("宣言中にターゲットが変わっても、優先の順は変わらない", () => {
    function App({ outer }: { outer: string }) {
      return (
        <Page target={outer}>
          <Page target="stock" />
        </Page>
      );
    }
    const { rerender, source } = setup(<App outer="orders" />);
    rerender(
      <HelpProvider source={source}>
        <Probe />
        <App outer="dialog" />
      </HelpProvider>,
    );
    expect(help.screenTarget).toBe("stock");
  });

  it("StrictMode でも、宣言は1つずつ登録と解除される", () => {
    function App({ show }: { show: boolean }) {
      return <Page target="orders">{show && <Page target="dialog" />}</Page>;
    }
    const source = fakeSource(FILES);
    const ui = (show: boolean) => (
      <StrictMode>
        <HelpProvider source={source}>
          <Probe />
          <App show={show} />
        </HelpProvider>
      </StrictMode>
    );
    const { rerender } = render(ui(true));
    expect(help.screenTarget).toBe("dialog");
    rerender(ui(false));
    expect(help.screenTarget).toBe("orders");
  });

  it("ドロワーが開いている間は、画面のページに追従する", async () => {
    function App() {
      const [target, setTarget] = useState("orders");
      return (
        <Page target={target}>
          <button type="button" onClick={() => setTarget("stock")}>
            在庫へ
          </button>
        </Page>
      );
    }
    setup(<App />);
    act(() => help.open());
    await flush();
    expect(help.current).toMatchObject({ id: "orders", status: "ready" });
    act(() => screen.getByRole("button").click());
    await flush();
    expect(help.current).toMatchObject({ id: "stock", title: "在庫照会", status: "ready" });
    expect(help.canGoBack).toBe(true);
  });
});

describe("useHelp", () => {
  it("操作の関数は、状態が変わっても同じものを返す", async () => {
    setup(null);
    const { open, navigate, search } = help;
    act(() => help.open("orders"));
    await flush();
    expect(help.open).toBe(open);
    expect(help.navigate).toBe(navigate);
    expect(help.search).toBe(search);
  });

  it("search は目次のページから探す", async () => {
    setup(null);
    const hits = await act(() => help.search("一括更新"));
    expect(hits.map((hit) => [hit.pageId, hit.headingId])).toEqual([["orders", "一括更新"]]);
  });
});

describe("source の変更", () => {
  it("新しい source から目次と表示中のページを取得し直す", async () => {
    const first = fakeSource(FILES);
    const next = fakeSource({ _index: "- [新しい受注](orders.md)", orders: "# 新しい受注" });
    const ui = (source: HelpSource) => (
      <HelpProvider source={source}>
        <Probe />
      </HelpProvider>
    );
    const { rerender } = render(ui(first));
    act(() => help.open("orders"));
    await flush();
    rerender(ui(next));
    await flush();
    expect(help.index.map((node) => node.title)).toEqual(["新しい受注"]);
    expect(help.current).toMatchObject({ markdown: "# 新しい受注", status: "ready" });
    expect(help.isOpen).toBe(true);
  });
});
