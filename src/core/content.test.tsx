import { act, cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { HelpContent, type HelpContentProps } from "./content.js";
import { HelpLoadError, HelpNotFoundError } from "./errors.js";
import { useHelp } from "./hooks.js";
import { HelpProvider, type HelpProviderProps } from "./provider.js";
import type { HelpApi, HelpCodeBlockProps, HelpSource } from "./types.js";
import { resetDevWarnings } from "./warn.js";

const FILES: Record<string, string> = {
  _index: "- [受注一覧](orders.md)\n- [在庫照会](stock.md)",
  orders: [
    "# 受注一覧",
    "",
    "受注を確認する。",
    "",
    "## 一括更新",
    "",
    "まとめて変更する。",
  ].join("\n"),
  stock: "# 在庫照会\n\n[色について](stock/colors.md)",
  "stock/colors": [
    "# 色",
    "",
    "- [受注の一括更新](../orders.md#一括更新)",
    "- [受注一覧（ルートから）](/orders.md)",
    "- [下の見出しへ](#赤)",
    "- [公式サイト](https://example.com)",
    "- [問い合わせ](mailto:help@example.com)",
    "- [マニュアル](files/manual.pdf)",
    "",
    "## 赤",
    "",
    "在庫が少ない。",
  ].join("\n"),
};

function fakeSource(files: Record<string, string>, extra: Partial<HelpSource> = {}): HelpSource {
  return {
    loadIndex: vi.fn(async () => files._index ?? ""),
    loadPage: vi.fn(async (id: string) => {
      const content = files[id];
      if (content === undefined) throw new HelpNotFoundError(id);
      if (content === "<<error>>") throw new HelpLoadError(id, { status: 500 });
      return content;
    }),
    ...extra,
  };
}

let help: HelpApi;
function Probe() {
  help = useHelp();
  return null;
}

function setup(
  options: {
    files?: Record<string, string>;
    provider?: Partial<HelpProviderProps>;
    content?: HelpContentProps;
  } = {},
) {
  const source = options.provider?.source ?? fakeSource(options.files ?? FILES);
  const result = render(
    <HelpProvider {...options.provider} source={source}>
      <Probe />
      <HelpContent className="prose" {...options.content} />
    </HelpProvider>,
  );
  return { source, ...result };
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

/** ページを開いて、取得が終わるのを待つ */
async function openPage(target: string) {
  act(() => help.open(target));
  await flush();
}

const scrollIntoView = vi.fn();
let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  scrollIntoView.mockClear();
  Element.prototype.scrollIntoView = scrollIntoView;
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

const warnings = () => warn.mock.calls.map((call) => String(call[0]));

describe("描画する状態", () => {
  it("何も開いていない、取得中、ページなし、取得失敗のときは何も描画しない", async () => {
    const { container } = setup({ files: { ...FILES, broken: "<<error>>" } });
    expect(container.innerHTML).toBe("");

    act(() => help.open("orders"));
    expect(help.current?.status).toBe("loading");
    expect(container.innerHTML).toBe("");

    await openPage("missing");
    expect(help.current?.status).toBe("not-found");
    expect(container.innerHTML).toBe("");

    await openPage("broken");
    expect(help.current?.status).toBe("error");
    expect(container.innerHTML).toBe("");
  });

  it("取得できたら className を付けた div の中に描画し、見出しにIDを付ける", async () => {
    const { container } = setup();
    await openPage("orders");
    const root = container.firstElementChild;
    expect(root?.tagName).toBe("DIV");
    expect(root?.className).toBe("prose");
    expect(root?.querySelector("h1")?.id).toBe("受注一覧");
    expect(root?.querySelector("h2")?.id).toBe("一括更新");
  });

  it("表、タスクリスト、取り消し線を描画する", async () => {
    const { container } = setup({
      files: { _index: "", p: "| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] 済\n- [ ] 未\n\n~~消~~" },
    });
    await openPage("p");
    expect(container.querySelector("table td")?.textContent).toBe("1");
    expect(container.querySelectorAll("input[type=checkbox]")).toHaveLength(2);
    expect(container.querySelector("del")?.textContent).toBe("消");
  });

  it("HelpProvider の外で使ったらエラーを投げる", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => HelpContent({}))).toThrow(
      "HelpContent must be used inside <HelpProvider>.",
    );
  });
});

describe("リンク（5.5節）", () => {
  const link = (container: HTMLElement, text: string) =>
    [...container.querySelectorAll("a")].find((a) => a.textContent === text) as HTMLAnchorElement;

  it("ページへのリンクは、現在のページからの相対パスで解決し、ドロワー内で移動する", async () => {
    const { container } = setup();
    await openPage("stock/colors");
    const a = link(container, "受注の一括更新");
    expect(a.getAttribute("href")).toBe("../orders.md#%E4%B8%80%E6%8B%AC%E6%9B%B4%E6%96%B0");
    const event = fireEvent.click(a);
    expect(event).toBe(false); // preventDefault された
    await flush();
    expect(help.current).toMatchObject({ id: "orders", headingId: "一括更新", status: "ready" });
    expect(container.querySelector("h1")?.textContent).toBe("受注一覧");
  });

  it("修飾キーを押していても、ドロワー内で移動する", async () => {
    const { container } = setup();
    await openPage("stock/colors");
    expect(fireEvent.click(link(container, "受注一覧（ルートから）"), { ctrlKey: true })).toBe(false);
    await flush();
    expect(help.current?.id).toBe("orders");
  });

  it("移動したあと、back() で前のページに戻る", async () => {
    const { container } = setup();
    await openPage("stock");
    fireEvent.click(link(container, "色について"));
    await flush();
    expect(container.querySelector("h1")?.textContent).toBe("色");
    act(() => help.back());
    expect(container.querySelector("h1")?.textContent).toBe("在庫照会");
  });

  it("# のリンクは同じページ内の見出しへスクロールし、履歴に積まない", async () => {
    const { container } = setup();
    await openPage("stock/colors");
    scrollIntoView.mockClear();
    expect(fireEvent.click(link(container, "下の見出しへ"))).toBe(false);
    expect(help.current?.headingId).toBe("赤");
    expect(help.canGoBack).toBe(false);
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView.mock.contexts[0]).toBe(container.querySelector("h2"));
  });

  it("http、https、mailto は新しいタブで開く", async () => {
    const { container } = setup();
    await openPage("stock/colors");
    for (const text of ["公式サイト", "問い合わせ"]) {
      const a = link(container, text);
      expect(a.getAttribute("target")).toBe("_blank");
      expect(a.getAttribute("rel")).toBe("noreferrer noopener");
    }
  });

  it("その他のリンクは、何もせず通常のリンクとして描画する", async () => {
    const { container } = setup();
    await openPage("stock/colors");
    const a = link(container, "マニュアル");
    expect(a.getAttribute("href")).toBe("files/manual.pdf");
    expect(a.hasAttribute("target")).toBe(false);
    expect(fireEvent.click(a)).toBe(true); // preventDefault されない
  });
});

describe("スクロール", () => {
  it("見出しまで指すターゲットでは、その見出しを表示する", async () => {
    const { container } = setup();
    await openPage("orders#一括更新");
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(container.querySelector("h2"));
    expect(scrollIntoView.mock.calls.at(-1)).toEqual([{ block: "start" }]);
  });

  it("見出しがなければ、本文の先頭を表示する", async () => {
    const { container } = setup();
    await openPage("orders");
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(container.firstElementChild);
  });

  it("同じ見出しへ続けて移動しても、毎回スクロールする", async () => {
    setup();
    await openPage("orders#一括更新");
    const count = scrollIntoView.mock.calls.length;
    act(() => help.navigate("orders#一括更新"));
    act(() => help.navigate("#一括更新"));
    expect(scrollIntoView.mock.calls.length).toBe(count + 2);
  });

  it("見出しが見つからなければ警告する", async () => {
    setup();
    await openPage("orders#存在しない見出し");
    expect(warnings()).toContain(
      '[md-help-kit] The heading "存在しない見出し" was not found in the help page "orders".',
    );
  });
});

describe("画像", () => {
  const files = {
    _index: "",
    "stock/colors": [
      "![相対](img/a.png) ![ルート](/img/b.png) ![絶対](https://cdn.example.com/c.png)",
      "",
      '<img src="img/raw.png" alt="HTML">',
    ].join("\n"),
  };
  const sources = (container: HTMLElement) =>
    [...container.querySelectorAll("img")].map((img) => img.getAttribute("src"));

  it("相対パスは source.resolveAsset で解決する（許可した <img> も含む）", async () => {
    const resolveAsset = vi.fn((pageId: string, path: string) => `resolved:${pageId}:${path}`);
    const { container } = setup({
      provider: { source: fakeSource(files, { resolveAsset }), allowedTags: ["img"] },
    });
    await openPage("stock/colors");
    expect(sources(container)).toEqual([
      "resolved:stock/colors:img/a.png",
      "resolved:stock/colors:/img/b.png",
      "https://cdn.example.com/c.png",
      "resolved:stock/colors:img/raw.png",
    ]);
  });

  it("resolveAsset がなければ変換しない", async () => {
    const { container } = setup({ files, provider: { allowedTags: ["img"] } });
    await openPage("stock/colors");
    expect(sources(container)).toEqual([
      "img/a.png",
      "/img/b.png",
      "https://cdn.example.com/c.png",
      "img/raw.png",
    ]);
  });
});

describe("コードブロック（6.2節）", () => {
  const files = {
    _index: "",
    p: [
      "```mermaid\ngraph TD\n```",
      "```Mermaid\ngraph LR\n```",
      "```ts\nconst a = 1;\n```",
      "```\nplain\n```",
      "    indented",
    ].join("\n\n"),
  };
  const Mermaid = ({ code, lang }: HelpCodeBlockProps) => (
    <figure data-lang={lang} data-kind="mermaid">
      {code}
    </figure>
  );
  const Highlight = ({ code, lang }: HelpCodeBlockProps) => (
    <figure data-lang={lang} data-kind="highlight">
      {code}
    </figure>
  );
  const figures = (container: HTMLElement) =>
    [...container.querySelectorAll("figure")].map((f) => [
      f.dataset.kind,
      f.dataset.lang,
      f.textContent,
    ]);

  it("言語名ごとに差し替える。言語名の大文字小文字は区別しない", async () => {
    const { container } = setup({ files, provider: { codeBlocks: { mermaid: Mermaid } } });
    await openPage("p");
    expect(figures(container)).toEqual([
      ["mermaid", "mermaid", "graph TD"],
      ["mermaid", "Mermaid", "graph LR"],
    ]);
    // 登録がなければ素の <pre><code>
    expect([...container.querySelectorAll("pre > code")].map((c) => c.textContent)).toEqual([
      "const a = 1;",
      "plain",
      "indented",
    ]);
  });

  it("* は個別の登録がない全言語に使い、言語名がなければ lang は空文字", async () => {
    const { container } = setup({
      files,
      provider: { codeBlocks: { mermaid: Mermaid, "*": Highlight } },
    });
    await openPage("p");
    expect(figures(container)).toEqual([
      ["mermaid", "mermaid", "graph TD"],
      ["mermaid", "Mermaid", "graph LR"],
      ["highlight", "ts", "const a = 1;"],
      ["highlight", "", "plain"],
      ["highlight", "", "indented"],
    ]);
    expect(container.querySelector("pre")).toBeNull();
  });
});

describe("注意書き（6.3節）", () => {
  it("5種類は data-mhk-alert に小文字の種別を出し、ラベルは付けない", async () => {
    const kinds = ["NOTE", "TIP", "IMPORTANT", "WARNING", "caution"];
    const { container } = setup({
      files: { _index: "", p: kinds.map((k) => `> [!${k}]\n> ${k} の本文`).join("\n\n") },
    });
    await openPage("p");
    const quotes = [...container.querySelectorAll("blockquote")];
    expect(quotes.map((q) => q.dataset.mhkAlert)).toEqual([
      "note",
      "tip",
      "important",
      "warning",
      "caution",
    ]);
    expect(quotes[3]?.textContent).toBe("WARNING の本文");
    expect(container.querySelector("header")).toBeNull();
  });

  it("5種類以外は普通の引用にし、[!XXX] を文字で残す", async () => {
    const { container } = setup({ files: { _index: "", p: "> [!foo]\n> 本文" } });
    await openPage("p");
    const quote = container.querySelector("blockquote");
    expect(quote?.hasAttribute("data-mhk-alert")).toBe(false);
    expect(quote?.textContent).toBe("[!FOO]本文");
  });

  it("普通の引用には何も付けない", async () => {
    const { container } = setup({ files: { _index: "", p: "> 引用" } });
    await openPage("p");
    expect(container.querySelector("blockquote")?.hasAttribute("data-mhk-alert")).toBe(false);
  });
});

describe("独自タグ（6.1節）", () => {
  it("登録した独自タグはそのコンポーネントで描画し、登録していないものは文字で表示する", async () => {
    const OpenScreen = ({ to, children }: { to: string; children?: ReactNode }) => (
      <button type="button" data-to={to}>
        {children}
      </button>
    );
    const { container } = setup({
      files: {
        _index: "",
        p: '<OpenScreen to="settings">**設定**を開く</OpenScreen>\n\n<Shortcut keys={["Ctrl"]} />',
      },
      provider: { components: { OpenScreen } },
    });
    await openPage("p");
    expect(container.querySelector("button[data-to=settings] strong")?.textContent).toBe("設定");
    expect(container.textContent).toContain("<Shortcut />");
  });
});

describe("overrides", () => {
  it("標準の要素を差し替えられる（table を枠で包むなど）", async () => {
    const Table = (props: { children?: ReactNode }) => (
      <div className="scroll">
        <table>{props.children}</table>
      </div>
    );
    const Blockquote = (props: { "data-mhk-alert"?: string; children?: ReactNode }) => (
      <aside data-kind={props["data-mhk-alert"] ?? "quote"}>{props.children}</aside>
    );
    const { container } = setup({
      files: { _index: "", p: "| a |\n|---|\n| 1 |\n\n> [!TIP]\n> 便利\n\n> 引用" },
      content: { overrides: { table: Table, blockquote: Blockquote } },
    });
    await openPage("p");
    expect(container.querySelector("div.scroll > table td")?.textContent).toBe("1");
    expect([...container.querySelectorAll("aside")].map((a) => a.dataset.kind)).toEqual([
      "tip",
      "quote",
    ]);
  });

  it("a と img を差し替えても、リンクの扱いと画像の解決はこちらで行う", async () => {
    const MyLink = (props: { href?: string; onClick?: () => void; children?: ReactNode }) => (
      <a className="my-link" href={props.href} onClick={props.onClick}>
        {props.children}
      </a>
    );
    const MyImage = (props: { src?: string }) => <img className="my-image" src={props.src} alt="" />;
    const { container } = setup({
      provider: {
        source: fakeSource(
          { _index: "", p: "[在庫](stock.md) ![図](a.png)", stock: "# 在庫照会" },
          { resolveAsset: (_id, path) => `/help/${path}` },
        ),
      },
      content: { overrides: { a: MyLink, img: MyImage } },
    });
    await openPage("p");
    expect(container.querySelector("img.my-image")?.getAttribute("src")).toBe("/help/a.png");
    fireEvent.click(container.querySelector("a.my-link") as Element);
    await flush();
    expect(help.current?.id).toBe("stock");
  });

  it("大文字始まりのキーは無視し、警告する", async () => {
    const Fake = () => <span data-fake="" />;
    const { container } = setup({
      files: { _index: "", p: "<Fake />" },
      content: { overrides: { Fake } },
    });
    await openPage("p");
    expect(container.querySelector("[data-fake]")).toBeNull();
    expect(warnings().some((w) => w.includes('HelpContent overrides: "Fake" was ignored'))).toBe(
      true,
    );
  });
});

describe("安全性", () => {
  it("HelpContent でも7章の制限がかかる", async () => {
    const { container } = setup({
      files: {
        _index: "",
        p: '<script>alert(1)</script>\n\n[x](javascript:alert(1)) <kbd style="color:red" onclick="alert(1)">k</kbd>',
      },
    });
    await openPage("p");
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("a")).toBeNull();
    const kbd = container.querySelector("kbd");
    expect(kbd?.hasAttribute("style")).toBe(false);
    expect(kbd?.hasAttribute("onclick")).toBe(false);
  });
});

describe("開発時の警告（11章）", () => {
  const files = {
    _index: "",
    p: "[ある](orders.md) [ない](missing.md#見出し) [見出しなし](#ない見出し) [見出しあり](#見出し)\n\n## 見出し",
    orders: "# 受注",
  };

  it("存在しないページへのリンクと、存在しない見出しへのリンクを警告する", async () => {
    setup({ files });
    await openPage("p");
    await flush();
    expect(warnings()).toEqual(
      expect.arrayContaining([
        '[md-help-kit] The help page "p" has a link to the help page "missing", which does not exist.',
        '[md-help-kit] The help page "p" has a link to the heading "ない見出し", which was not found.',
      ]),
    );
    expect(warnings().filter((w) => w.includes('"orders"'))).toEqual([]);
    expect(warnings().filter((w) => w.includes('"見出し"'))).toEqual([]);
  });

  it("本番ではリンク先を取得しない", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const { source } = setup({ files });
    await openPage("p");
    await flush();
    expect(vi.mocked(source.loadPage).mock.calls.map(([id]) => id)).toEqual(["p"]);
    expect(warnings()).toEqual([]);
  });
});
