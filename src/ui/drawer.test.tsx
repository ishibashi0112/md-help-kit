import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type HelpApi,
  HelpLoadError,
  HelpNotFoundError,
  HelpProvider,
  type HelpSource,
  useHelp,
} from "../core/index.js";
import { HelpDrawer, type HelpDrawerProps } from "./drawer.js";
import { jaLabels } from "./labels.js";

const FILES: Record<string, string> = {
  _index: "- [受注一覧](orders.md)\n- [在庫照会](stock.md)\n- 管理者向け\n  - [設定](settings.md)",
  orders: [
    "# 受注一覧",
    "",
    "[在庫照会へ](stock.md)",
    "",
    "## 絞り込み",
    "",
    "### 期間",
    "",
    "#### 細かい話",
    "",
    "## 一括更新",
    "",
    "| a | b |",
    "|---|---|",
    "| 1 | 2 |",
    "",
    "> [!WARNING]",
    "> 完了済みの行は変更できません。",
    "",
    "> ただの引用",
    "",
    "- [x] 済",
  ].join("\n"),
  stock: "# 在庫照会\n\n在庫を確認する。",
  settings: "# 設定",
};

function fakeSource(files: Record<string, string>): HelpSource {
  return {
    loadIndex: vi.fn(async () => {
      if (files._index === "<<error>>") throw new HelpLoadError("_index", { status: 500 });
      return files._index ?? "";
    }),
    loadPage: vi.fn(async (id: string) => {
      const content = files[id];
      if (content === undefined) throw new HelpNotFoundError(id);
      if (content === "<<error>>") throw new HelpLoadError(id, { status: 500 });
      return content;
    }),
  };
}

let help: HelpApi;
function Probe() {
  help = useHelp();
  return null;
}

function setup(
  options: { files?: Record<string, string>; drawer?: HelpDrawerProps; app?: ReactNode } = {},
) {
  const source = fakeSource(options.files ?? FILES);
  const result = render(
    <HelpProvider source={source}>
      <Probe />
      {options.app}
      <HelpDrawer {...options.drawer} />
    </HelpProvider>,
  );
  return { source, ...result };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));
const wait = (ms: number) => act(() => new Promise((resolve) => setTimeout(resolve, ms)));

async function openPage(target?: string) {
  act(() => help.open(target));
  await flush();
}

const drawer = () => screen.getByRole("complementary");
const button = (name: string) => within(drawer()).getByRole("button", { name });

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("開閉", () => {
  it("閉じているときは何も描画せず、開いたら document.body にポータルで描画する", async () => {
    const { container } = setup();
    expect(screen.queryByRole("complementary")).toBeNull();
    await openPage("orders");
    expect(drawer().parentElement).toBe(document.body);
    expect(container.contains(drawer())).toBe(false);
    act(() => help.close());
    expect(screen.queryByRole("complementary")).toBeNull();
  });

  it("role=complementary と aria-label を付け、side と theme を属性で出す", async () => {
    setup({ drawer: { side: "left", theme: "dark", labels: jaLabels } });
    await openPage("orders");
    expect(drawer().getAttribute("aria-label")).toBe("ヘルプ");
    expect(drawer().dataset.mhkSide).toBe("left");
    expect(drawer().dataset.mhkTheme).toBe("dark");
  });

  it("side の既定は right で、theme を省略したら属性を付けない", async () => {
    setup();
    await openPage("orders");
    expect(drawer().getAttribute("aria-label")).toBe("Help");
    expect(drawer().dataset.mhkSide).toBe("right");
    expect(drawer().hasAttribute("data-mhk-theme")).toBe(false);
  });

  it("開いたときに検索欄へフォーカスしない", async () => {
    setup();
    await openPage("orders");
    expect(drawer().contains(document.activeElement)).toBe(false);
  });
});

describe("Esc", () => {
  it("ドロワーの中にフォーカスがあるときに閉じる", async () => {
    setup();
    await openPage("orders");
    fireEvent.keyDown(button("Close"), { key: "Escape" });
    expect(help.isOpen).toBe(false);
  });

  it("ドロワーの外で押しても閉じない", async () => {
    setup({ app: <button type="button">アプリ</button> });
    await openPage("orders");
    fireEvent.keyDown(screen.getByRole("button", { name: "アプリ" }), { key: "Escape" });
    expect(help.isOpen).toBe(true);
  });

  it("検索欄に文字があるときは、まず文字を消す", async () => {
    setup();
    await openPage("orders");
    const input = screen.getByRole("searchbox");
    fireEvent.change(input, { target: { value: "在庫" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect((input as HTMLInputElement).value).toBe("");
    expect(help.isOpen).toBe(true);
    fireEvent.keyDown(input, { key: "Escape" });
    expect(help.isOpen).toBe(false);
  });

  it("検索欄の文字を消す Esc は、アプリ側の keydown に伝えない", async () => {
    setup();
    await openPage("orders");
    const appListener = vi.fn();
    document.addEventListener("keydown", appListener);
    try {
      const input = screen.getByRole("searchbox");
      fireEvent.change(input, { target: { value: "在庫" } });
      fireEvent.keyDown(input, { key: "Escape" });
      expect(appListener).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener("keydown", appListener);
    }
  });

  it("閉じたら、ドロワーに入る前の要素にフォーカスを戻す", async () => {
    setup({ app: <button type="button">アプリ</button> });
    await openPage("orders");
    const appButton = screen.getByRole("button", { name: "アプリ" });
    act(() => appButton.focus());
    act(() => button("Close").focus());
    expect(document.activeElement).toBe(button("Close"));
    fireEvent.keyDown(document.activeElement as Element, { key: "Escape" });
    expect(document.activeElement).toBe(appButton);
  });
});

describe("戻る", () => {
  it("本文では履歴を戻る。戻れないときは無効", async () => {
    setup();
    await openPage("orders");
    expect(button("Back")).toHaveProperty("disabled", true);
    fireEvent.click(screen.getByRole("link", { name: "在庫照会へ" }));
    await flush();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("在庫照会");
    expect(button("Back")).toHaveProperty("disabled", false);
    fireEvent.click(button("Back"));
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("受注一覧");
  });

  it("目次と検索結果では本文に戻る", async () => {
    setup();
    await openPage("orders");
    fireEvent.click(button("Contents"));
    expect(screen.getByRole("navigation")).toBeTruthy();
    fireEvent.click(button("Back"));
    expect(screen.queryByRole("navigation")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("受注一覧");
  });
});

describe("目次", () => {
  it("全体目次を出し、表示中のページの下に h2 と h3 を入れ子で並べる", async () => {
    setup();
    await openPage("orders");
    fireEvent.click(button("Contents"));
    expect(button("Contents").getAttribute("aria-pressed")).toBe("true");
    const nav = screen.getByRole("navigation");
    const items = within(nav).getAllByRole("button").map((b) => b.textContent);
    expect(items).toEqual(["受注一覧", "絞り込み", "期間", "一括更新", "在庫照会", "設定"]);
    expect(within(nav).getByText("管理者向け").tagName).toBe("SPAN");
    expect(within(nav).getByRole("button", { name: "受注一覧" }).getAttribute("aria-current")).toBe(
      "page",
    );
  });

  it("見出しを選ぶと、そのページの見出しへ移動して本文に戻る", async () => {
    setup();
    await openPage("orders");
    fireEvent.click(button("Contents"));
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "一括更新" }));
    expect(help.current).toMatchObject({ id: "orders", headingId: "一括更新" });
    expect(screen.queryByRole("navigation")).toBeNull();
  });

  it("ページを選ぶと、そのページへ移動して本文に戻る", async () => {
    setup();
    await openPage("orders");
    fireEvent.click(button("Contents"));
    fireEvent.click(within(screen.getByRole("navigation")).getByRole("button", { name: "設定" }));
    await flush();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("設定");
  });

  it("何も開いていなければ目次を出す", async () => {
    setup({ files: { ...FILES, _index: "" } });
    await openPage();
    expect(help.current).toBeNull();
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("目次の取得に失敗したら、再試行ボタンで取得し直す", async () => {
    const files = { ...FILES, _index: "<<error>>" };
    setup({ files });
    await openPage();
    expect(within(drawer()).getByRole("alert").textContent).toContain("Failed to load.");
    files._index = FILES._index ?? "";
    fireEvent.click(button("Retry"));
    await flush();
    const items = within(screen.getByRole("navigation")).getAllByRole("button");
    expect(items.map((b) => b.textContent)).toEqual(["受注一覧", "在庫照会", "設定"]);
  });
});

describe("状態ごとの表示", () => {
  it("読み込み中", async () => {
    setup();
    act(() => help.open("orders"));
    expect(within(drawer()).getByRole("status").textContent).toBe("Loading…");
    await flush();
  });

  it("ページなしでは、目次へ戻る導線を出す", async () => {
    setup({ drawer: { labels: jaLabels } });
    await openPage("missing");
    expect(within(drawer()).getByRole("alert").textContent).toContain("ページが見つかりません。");
    fireEvent.click(button("目次へ"));
    expect(screen.getByRole("navigation")).toBeTruthy();
  });

  it("取得失敗では、再試行ボタンで取得し直す", async () => {
    const files = { ...FILES, orders: "<<error>>" };
    setup({ files });
    await openPage("orders");
    expect(within(drawer()).getByRole("alert").textContent).toContain("Failed to load.");
    files.orders = "# 直った";
    fireEvent.click(button("Retry"));
    await flush();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("直った");
  });
});

describe("検索", () => {
  it("入力から少し待って検索し、結果を選ぶとその見出しへ移動して検索語を消す", async () => {
    setup();
    await openPage("stock");
    const input = screen.getByRole("searchbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "一括" } });
    expect(within(drawer()).getByRole("status").textContent).toBe("Searching…");
    await wait(250);
    await flush();
    const result = within(drawer()).getByRole("button", { name: /受注一覧.*一括更新/ });
    fireEvent.click(result);
    await flush();
    expect(help.current).toMatchObject({ id: "orders", headingId: "一括更新" });
    expect(input.value).toBe("");
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("受注一覧");
  });

  it("結果がなければ、その旨を出す", async () => {
    setup();
    await openPage("orders");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "存在しない語" } });
    await wait(250);
    await flush();
    expect(within(drawer()).getByRole("status").textContent).toBe("No results.");
  });

  it("検索に失敗したら、その旨を出す", async () => {
    setup({ files: { ...FILES, _index: "<<error>>" } });
    await openPage("orders");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "在庫" } });
    await wait(250);
    await flush();
    expect(within(drawer()).getByRole("alert").textContent).toBe("Search failed.");
  });
});

describe("本文の部品", () => {
  it("表を横スクロールできる枠で包み、枠にフォーカスできるようにする", async () => {
    setup();
    await openPage("orders");
    const wrapper = drawer().querySelector(".mhk-prose .mhk-table");
    expect(wrapper?.querySelector("table")).not.toBeNull();
    expect(wrapper?.getAttribute("tabindex")).toBe("0");
  });

  it("注意書きにはアイコンとラベルを付け、普通の引用はそのまま", async () => {
    setup({ drawer: { labels: jaLabels } });
    await openPage("orders");
    const alert = within(drawer()).getByRole("note");
    expect(alert.dataset.mhkAlert).toBe("warning");
    expect(alert.querySelector(".mhk-alert-title")?.textContent).toBe("警告");
    expect(alert.querySelector(".mhk-alert-title svg")).not.toBeNull();
    expect(alert.querySelector(".mhk-alert-body")?.textContent).toBe("完了済みの行は変更できません。");
    expect(drawer().querySelector("blockquote")?.textContent).toBe("ただの引用");
  });

  it("タスクリストのチェックボックスは操作できない", async () => {
    setup();
    await openPage("orders");
    expect(drawer().querySelector("input[type=checkbox]")).toHaveProperty("disabled", true);
  });

  it("本文は .mhk-prose の中に描画する", async () => {
    setup();
    await openPage("orders");
    expect(drawer().querySelector(".mhk-body > .mhk-prose > h1")?.textContent).toBe("受注一覧");
  });
});

describe("文言", () => {
  it("渡した項目だけを差し替える", async () => {
    setup({ drawer: { labels: { close: "閉", alerts: { warning: "要注意" } } } });
    await openPage("orders");
    expect(button("閉")).toBeTruthy();
    expect(button("Back")).toBeTruthy();
    expect(within(drawer()).getByRole("note").textContent).toContain("要注意");
  });
});
