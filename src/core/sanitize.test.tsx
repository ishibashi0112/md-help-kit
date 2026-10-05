import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { parseMarkdown, type RenderOptions, renderMarkdown } from "./markdown.js";
import { createTagPolicy, isAllowedUrl, sanitizeAttributes } from "./sanitize.js";
import { resetDevWarnings } from "./warn.js";

let warn: MockInstance<typeof console.warn>;
beforeEach(() => {
  resetDevWarnings();
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/** mdを描画し、包んだ要素を返す */
function show(markdown: string, options?: RenderOptions): HTMLElement {
  const { container } = render(<div>{renderMarkdown(parseMarkdown(markdown), options)}</div>);
  return container.firstElementChild as HTMLElement;
}

/** 受け取った props を記録する独自タグ */
function recorder() {
  const calls: Record<string, unknown>[] = [];
  const Probe = (props: Record<string, unknown>) => {
    calls.push(props);
    return <span data-probe="" />;
  };
  return { calls, Probe };
}

describe("isAllowedUrl", () => {
  it.each([
    "https://example.com",
    "http://example.com",
    "HTTPS://EXAMPLE.COM",
    "mailto:help@example.com",
    "stock.md",
    "./stock.md",
    "../orders.md",
    "/help/orders.md",
    "#一括更新",
    "img/filter.png",
    "?q=1",
  ])("%s は許可する", (url) => {
    expect(isAllowedUrl(url)).toBe(true);
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    " javascript:alert(1)",
    "java\tscript:alert(1)",
    "java\nscript:alert(1)",
    "\u0001javascript:alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/png;base64,AAAA",
    "tel:0120000000",
    "ftp://example.com/a.md",
    "file:///etc/passwd",
    "//evil.example.com/a.md",
    "\\\\evil.example.com/a.md",
    "/\\evil.example.com/a.md",
  ])("%j は許可しない", (url) => {
    expect(isAllowedUrl(url)).toBe(false);
  });
});

describe("sanitizeAttributes", () => {
  it("HTML タグの style を捨て、ほかの属性は残す", () => {
    expect(sanitizeAttributes({ class: "a", style: { color: "red" }, title: "t" }, "html")).toEqual({
      class: "a",
      title: "t",
    });
  });

  it("独自タグの style は残す", () => {
    expect(sanitizeAttributes({ style: { color: "red" } }, "component")).toEqual({
      style: { color: "red" },
    });
  });

  it("許可しない URL を値に持つ属性を取り除く（HTML タグ、独自タグの両方）", () => {
    for (const kind of ["html", "component"] as const) {
      expect(
        sanitizeAttributes(
          {
            href: "data:image/png;base64,AAAA",
            src: "https://example.com/a.png",
            "xlink:href": "javascript:alert(1)",
            ACTION: "tel:0120",
            poster: "./poster.png",
          },
          kind,
        ),
      ).toEqual({ src: "https://example.com/a.png", poster: "./poster.png" });
    }
  });

  it("srcset と ping は、含まれるURLのどれかが許可されなければ取り除く", () => {
    expect(
      sanitizeAttributes({ srcset: "a.png 1x, https://example.com/b.png 2x" }, "html"),
    ).toEqual({ srcset: "a.png 1x, https://example.com/b.png 2x" });
    expect(sanitizeAttributes({ srcset: "a.png 1x, data:image/png;base64,AA 2x" }, "html")).toEqual(
      {},
    );
    expect(sanitizeAttributes({ ping: "https://example.com/p javascript:x" }, "html")).toEqual({});
  });

  it("文字列でない値は URL として扱わない", () => {
    expect(sanitizeAttributes({ src: ["a", "b"] }, "component")).toEqual({ src: ["a", "b"] });
  });
});

describe("createTagPolicy", () => {
  it("標準で許可する HTML タグは html、それ以外は text", () => {
    const kindOf = createTagPolicy();
    for (const tag of ["details", "summary", "kbd", "br", "sub", "sup", "mark"]) {
      expect(kindOf(tag)).toBe("html");
    }
    for (const tag of ["div", "span", "u", "img", "a", "script"]) {
      expect(kindOf(tag)).toBe("text");
    }
  });

  it("allowedTags で追加でき、大文字小文字を区別せずに照合する", () => {
    const kindOf = createTagPolicy({ allowedTags: ["U", "table"] });
    expect(kindOf("u")).toBe("html");
    expect(kindOf("table")).toBe("html");
    expect(kindOf("TABLE")).toBe("text");
  });

  it("常に禁止するタグは、allowedTags に追加しても許可せず、警告する", () => {
    const forbidden = [
      "script",
      "noscript",
      "iframe",
      "frame",
      "frameset",
      "object",
      "embed",
      "applet",
      "template",
      "style",
      "link",
      "meta",
      "base",
      "title",
      "form",
      "input",
      "button",
      "select",
      "option",
      "textarea",
      "xmp",
      "plaintext",
      "noembed",
      "noframes",
    ];
    const kindOf = createTagPolicy({ allowedTags: [...forbidden, "IFRAME"] });
    for (const tag of forbidden) expect(kindOf(tag)).toBe("text");
    const messages = warn.mock.calls.map((call) => String(call[0]));
    expect(messages.filter((m) => m.includes("always disallowed"))).toHaveLength(forbidden.length);
  });

  it("登録した独自タグは component、未登録は text", () => {
    const kindOf = createTagPolicy({ componentNames: ["OpenScreen"] });
    expect(kindOf("OpenScreen")).toBe("component");
    expect(kindOf("Shortcut")).toBe("text");
  });

  it("大文字始まりのタグは HTML タグの許可リストと照合しない", () => {
    expect(createTagPolicy()("KBD")).toBe("text");
  });

  it("小文字始まりの独自タグの名前は無視し、警告する", () => {
    const kindOf = createTagPolicy({ componentNames: ["openScreen"] });
    expect(kindOf("openScreen")).toBe("text");
    expect(warn.mock.calls[0]?.[0]).toContain('components: "openScreen" was ignored');
  });

  it("文字にするタグの警告は、同じタグ名につき1回だけ出す", () => {
    const kindOf = createTagPolicy();
    kindOf("u");
    kindOf("u");
    createTagPolicy()("u");
    kindOf("div");
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn.mock.calls[0]?.[0]).toBe(
      "[md-help-kit] <u> is neither registered in components nor allowed by allowedTags, so it is shown as text.",
    );
  });
});

describe("描画時の制限（renderMarkdown）", () => {
  describe("HTML タグ", () => {
    it("標準で許可するタグは要素として描画する", () => {
      const root = show(
        "<details><summary>概要</summary>本文</details>\n\n<kbd>Ctrl</kbd> 改<br>行 H<sub>2</sub>O x<sup>2</sup> <mark>重要</mark>",
      );
      for (const tag of ["details", "summary", "kbd", "br", "sub", "sup", "mark"]) {
        expect(root.querySelector(tag), tag).not.toBeNull();
      }
    });

    it("許可していないタグは描画せず、タグ名と中身を文字で表示する", () => {
      const root = show("<u>下線</u> と <span class=\"x\">範囲</span>");
      expect(root.querySelector("u")).toBeNull();
      expect(root.querySelector("span")).toBeNull();
      expect(root.textContent).toBe("<u>下線</u> と <span>範囲</span>");
    });

    it("文字で表示するタグの中身は、mdとして描画する", () => {
      const root = show("<section>\n\n**太字**\n\n</section>");
      expect(root.querySelector("section")).toBeNull();
      expect(root.querySelector("strong")?.textContent).toBe("太字");
      expect(root.textContent).toBe("<section>太字</section>");
    });

    it("中身のないタグは自己終了の形で表示する", () => {
      expect(show("a <img src=\"a.png\"> b").textContent).toBe("a <img /> b");
    });

    it("allowedTags で追加したタグは描画する", () => {
      expect(show("<u>下線</u>", { allowedTags: ["u"] }).querySelector("u")?.textContent).toBe(
        "下線",
      );
    });

    it("許可したタグの中にある許可していないタグも、文字にする", () => {
      const root = show("<details><summary>概要</summary><u>下線</u></details>");
      expect(root.querySelector("details")).not.toBeNull();
      expect(root.querySelector("u")).toBeNull();
      expect(root.querySelector("details")?.textContent).toContain("<u>下線</u>");
    });

    it.each([
      "<script>alert(1)</script>",
      "<iframe src=\"https://example.com\"></iframe>",
      "<style>body { display: none }</style>",
      "<object data=\"x.swf\"></object>",
      "<embed src=\"x.swf\">",
      "<form action=\"https://example.com\"><input name=\"q\"><button>送信</button></form>",
      "<base href=\"https://evil.example.com/\">",
      "<meta http-equiv=\"refresh\" content=\"0;url=https://evil.example.com\">",
      "<link rel=\"stylesheet\" href=\"x.css\">",
      "<textarea>x</textarea>",
      "<template><b>x</b></template>",
      "<img src=x onerror=alert(1)>",
      "<svg onload=alert(1)></svg>",
    ])("%s は、allowedTags に追加しても要素として描画しない", (markdown) => {
      const tags = [
        "script",
        "iframe",
        "style",
        "object",
        "embed",
        "form",
        "input",
        "button",
        "base",
        "meta",
        "link",
        "textarea",
        "template",
        "img",
        "svg",
      ];
      for (const options of [undefined, { allowedTags: tags.filter((t) => t !== "img" && t !== "svg") }]) {
        const root = show(markdown, options);
        for (const tag of tags) expect(root.querySelector(tag), tag).toBeNull();
      }
    });

    it("ライブラリが中身を HTML として書き込むタグ（pre）でも、中身を HTML として解釈しない", () => {
      const root = show("<pre><img src=x onerror=alert(1)><b>太字</b></pre>", {
        allowedTags: ["pre"],
      });
      const pre = root.querySelector("pre");
      expect(pre).not.toBeNull();
      expect(pre?.querySelector("img")).toBeNull();
      expect(pre?.querySelector("b")).toBeNull();
      expect(pre?.textContent).toContain("<b>太字</b>");
    });

    it("許可していない pre は、中身ごと文字で表示する", () => {
      const root = show("<pre>x <b>y</b></pre>");
      expect(root.querySelector("pre")).toBeNull();
      expect(root.querySelector("b")).toBeNull();
      expect(root.textContent).toBe("<pre>x <b>y</b></pre>");
    });
  });

  describe("独自タグ", () => {
    it("登録した独自タグは、そのコンポーネントで描画する", () => {
      const root = show(
        '<OpenScreen to="settings">**設定**画面を開く</OpenScreen>\n\n<Shortcut keys={["Ctrl", "E"]} />',
        {
          components: {
            OpenScreen: (props: { to: string; children?: React.ReactNode }) => (
              <button type="button" data-to={props.to}>
                {props.children}
              </button>
            ),
            Shortcut: (props: { keys: string[] }) => <kbd>{props.keys.join("+")}</kbd>,
          },
        },
      );
      const button = root.querySelector("button[data-to='settings']");
      expect(button?.querySelector("strong")?.textContent).toBe("設定");
      expect(root.querySelector("kbd")?.textContent).toBe("Ctrl+E");
    });

    it("登録していない独自タグは、タグ名と中身を文字で表示し、警告する", () => {
      const root = show(
        '<OpenScreen to="settings">**設定**画面を開く</OpenScreen>\n\n<Shortcut keys={["Ctrl", "E"]} />',
      );
      expect(root.querySelector("openscreen")).toBeNull();
      expect(root.querySelector("strong")?.textContent).toBe("設定");
      expect(root.textContent).toBe("<OpenScreen>設定画面を開く</OpenScreen><Shortcut />");
      expect(warn.mock.calls.map((call) => call[0])).toEqual([
        expect.stringContaining("<OpenScreen> is neither registered"),
        expect.stringContaining("<Shortcut> is neither registered"),
      ]);
    });

    it("小文字始まりの名前で登録したものは使えない", () => {
      const { calls, Probe } = recorder();
      const root = show("<probe />", { components: { probe: Probe } });
      expect(calls).toHaveLength(0);
      expect(root.textContent).toBe("<probe />");
    });

    it("属性に書いた式は実行せず、文字列のまま渡す", () => {
      const { calls, Probe } = recorder();
      show("<Probe fn={() => alert(1)} value={foo} />", { components: { Probe } });
      expect(calls[0]?.fn).toBe("() => alert(1)");
      expect(calls[0]?.value).toBe("foo");
    });
  });

  describe("属性", () => {
    it("on で始まる属性は描画しない（HTML タグ、独自タグの両方）", () => {
      const { calls, Probe } = recorder();
      const root = show(
        '<kbd onclick="alert(1)" onMouseOver="alert(1)">x</kbd>\n\n<Probe onClick="alert(1)" onload="alert(1)" />',
        { components: { Probe } },
      );
      const kbd = root.querySelector("kbd");
      expect(kbd?.getAttributeNames().filter((name) => name.startsWith("on"))).toEqual([]);
      expect(Object.keys(calls[0] ?? {}).filter((name) => /^on/i.test(name))).toEqual([]);
    });

    it("許可した HTML タグの style は描画しない", () => {
      const root = show('<kbd style="color:red">x</kbd>');
      expect(root.querySelector("kbd")?.hasAttribute("style")).toBe(false);
    });

    it("mdの表の列の寄せ（th、td の style）は残す", () => {
      const root = show("| 左 | 中 | 右 |\n|:--|:-:|--:|\n| a | b | c |");
      expect(root.querySelector("th:nth-child(2)")?.getAttribute("style")).toContain("center");
      expect(root.querySelector("td:nth-child(3)")?.getAttribute("style")).toContain("right");
    });

    it("独自タグには style を渡す", () => {
      const { calls, Probe } = recorder();
      show('<Probe style="color:red" />', { components: { Probe } });
      expect(calls[0]?.style).toBeDefined();
    });
  });

  describe("禁止する設定", () => {
    it("tagfilter と evalUnserializableExpressions は、呼び出し側から指定できない", () => {
      const { calls, Probe } = recorder();
      const doc = parseMarkdown("<script>alert(1)</script>\n\n<Probe fn={() => alert(1)} />");
      // @ts-expect-error RenderOptions には tagfilter がない
      renderMarkdown(doc, { tagfilter: false });
      // 型を無視して渡しても使われない
      const options = { components: { Probe }, tagfilter: false, evalUnserializableExpressions: true };
      const { container } = render(<div>{renderMarkdown(doc, options)}</div>);
      expect(container.querySelector("script")).toBeNull();
      expect(calls[0]?.fn).toBe("() => alert(1)");
    });
  });

  describe("URL", () => {
    it.each([
      "[リンク](javascript:alert(1))",
      "[リンク](java&#x09;script:alert(1))",
      "[リンク](vbscript:msgbox(1))",
      "[リンク](data:text/html,x)",
      "[リンク](data:image/png;base64,AAAA)",
      "[リンク](tel:0120000000)",
      "[リンク](ftp://example.com/a.md)",
      "[リンク](//evil.example.com/a.md)",
      "<javascript:alert(1)>",
    ])("%s はリンクにせず、文字だけを表示する", (markdown) => {
      const root = show(markdown);
      expect(root.querySelector("a")).toBeNull();
      expect(root.textContent).not.toBe("");
    });

    it.each([
      ["[リンク](https://example.com)", "https://example.com"],
      ["[リンク](http://example.com)", "http://example.com"],
      ["[リンク](mailto:help@example.com)", "mailto:help@example.com"],
      ["[リンク](./stock.md#赤)", "./stock.md#%E8%B5%A4"],
      ["[リンク](#一括更新)", "#%E4%B8%80%E6%8B%AC%E6%9B%B4%E6%96%B0"],
      ["<https://example.com>", "https://example.com"],
    ])("%s はリンクにする", (markdown, href) => {
      expect(show(markdown).querySelector("a")?.getAttribute("href")).toBe(href);
    });

    it("許可しないURLの画像は描画せず、代替テキストを文字で表示する", () => {
      const root = show("![構成図](data:image/png;base64,AAAA) と ![](javascript:alert(1))");
      expect(root.querySelector("img")).toBeNull();
      expect(root.textContent).toBe("構成図 と ");
    });

    it("許可するURLの画像は描画する", () => {
      const root = show("![構成図](https://example.com/a.png) ![図](img/filter.png)");
      expect([...root.querySelectorAll("img")].map((img) => img.getAttribute("src"))).toEqual([
        "https://example.com/a.png",
        "img/filter.png",
      ]);
    });

    it("許可した HTML タグの URL 属性も制限する", () => {
      const root = show(
        [
          '<a href="data:image/png;base64,AAAA">a1</a>',
          '<a href="java&#x09;script:alert(1)">a2</a>',
          '<a href="https://example.com">a3</a>',
          '<img src="data:image/png;base64,AAAA">',
          '<img src="a.png" srcset="b.png 1x, data:image/png;base64,AA 2x">',
        ].join(" "),
        { allowedTags: ["a", "img"] },
      );
      const links = [...root.querySelectorAll("a")];
      expect(links.map((a) => a.getAttribute("href"))).toEqual([null, null, "https://example.com"]);
      const images = [...root.querySelectorAll("img")];
      expect(images[0]?.hasAttribute("src")).toBe(false);
      expect(images[1]?.getAttribute("src")).toBe("a.png");
      expect(images[1]?.hasAttribute("srcset")).toBe(false);
    });

    it("独自タグの URL 属性も制限する", () => {
      const { calls, Probe } = recorder();
      show('<Probe href="javascript:alert(1)" src="https://example.com/a.png" />', {
        components: { Probe },
      });
      expect(calls[0]?.href).toBeUndefined();
      expect(calls[0]?.src).toBe("https://example.com/a.png");
    });
  });
});
