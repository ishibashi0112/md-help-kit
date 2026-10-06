import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HelpContent, HelpNotFoundError, HelpProvider, useHelp } from "../core/index.js";

// mermaid は jsdom では描画できないので、差し替えて振る舞いを確かめる
const mock = vi.hoisted(() => ({
  factoryCalls: 0,
  fail: false,
  initialize: vi.fn(),
  render: vi.fn(async (_id: string, _code: string) => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' })),
}));

function mockMermaid() {
  vi.doMock("mermaid", () => {
    mock.factoryCalls++;
    if (mock.fail) throw new Error("Cannot find package 'mermaid'");
    return { default: { initialize: mock.initialize, render: mock.render } };
  });
}

/** 毎回まっさらな状態のモジュールを読み込む（mermaid の読み込み状態を持ち越さないため） */
async function loadBlock() {
  vi.resetModules();
  mockMermaid();
  return (await import("./mermaid-block.js")).MermaidBlock;
}

const CODE = "flowchart TD\n  A --> B";

beforeEach(() => {
  mock.factoryCalls = 0;
  mock.fail = false;
  mock.initialize.mockClear();
  mock.render.mockReset();
  mock.render.mockImplementation(async () => ({ svg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>' }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("MermaidBlock", () => {
  it("読み込んだだけでは mermaid を読み込まない", async () => {
    await loadBlock();
    expect(mock.factoryCalls).toBe(0);
  });

  it("描画中は aria-busy の空の枠を出す", async () => {
    const MermaidBlock = await loadBlock();
    mock.render.mockImplementation(() => new Promise(() => {}));
    const { container } = render(<MermaidBlock code={CODE} lang="mermaid" />);
    const root = container.querySelector(".mhk-mermaid");
    expect(root?.getAttribute("aria-busy")).toBe("true");
    expect(root?.childElementCount).toBe(0);
  });

  it("図を画像として描画し、代替テキストは元のコードにする", async () => {
    const MermaidBlock = await loadBlock();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg"><text>受注</text></svg>';
    mock.render.mockResolvedValue({ svg });
    const { container } = render(<MermaidBlock code={CODE} lang="mermaid" />);
    const img = await screen.findByRole("img");
    expect(img.getAttribute("alt")).toBe(CODE);
    const src = img.getAttribute("src") ?? "";
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(src.slice(src.indexOf(",") + 1))).toBe(svg);
    expect(container.querySelector(".mhk-mermaid")?.hasAttribute("aria-busy")).toBe(false);
    expect(mock.factoryCalls).toBe(1);
  });

  it("securityLevel: strict などで初期化してから描画する", async () => {
    const MermaidBlock = await loadBlock();
    render(<MermaidBlock code={CODE} lang="mermaid" />);
    await screen.findByRole("img");
    expect(mock.initialize).toHaveBeenCalledWith({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "default",
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
    });
    expect(mock.render).toHaveBeenCalledWith(expect.stringMatching(/^mhk-mermaid-\d+$/), CODE);
  });

  it("図のタイトル（accTitle）があれば、それを代替テキストにする", async () => {
    const MermaidBlock = await loadBlock();
    render(<MermaidBlock code={"flowchart TD\n  accTitle: 受注の流れ\n  A --> B"} lang="mermaid" />);
    expect((await screen.findByRole("img")).getAttribute("alt")).toBe("受注の流れ");
  });

  describe("配色", () => {
    const theme = () => (mock.initialize.mock.calls.at(-1)?.[0] as { theme: string }).theme;
    const stubScheme = (colorScheme: string) =>
      vi.spyOn(window, "getComputedStyle").mockReturnValue({ colorScheme } as CSSStyleDeclaration);

    it("描画する場所の color-scheme が dark なら dark の配色で描く", async () => {
      const MermaidBlock = await loadBlock();
      stubScheme("dark");
      render(<MermaidBlock code={CODE} lang="mermaid" />);
      await screen.findByRole("img");
      expect(theme()).toBe("dark");
    });

    it("light dark のときは OS の設定に従い、OS の設定が変わったら描き直す", async () => {
      const MermaidBlock = await loadBlock();
      stubScheme("light dark");
      const listeners = new Set<() => void>();
      const media = {
        matches: false,
        addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
        removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
      };
      vi.stubGlobal("matchMedia", () => media);
      render(<MermaidBlock code={CODE} lang="mermaid" />);
      await screen.findByRole("img");
      expect(theme()).toBe("default");

      media.matches = true;
      act(() => {
        for (const listener of listeners) listener();
      });
      await waitFor(() => expect(theme()).toBe("dark"));
      expect(mock.render).toHaveBeenCalledTimes(2);
    });

    describe("data-mhk-theme が変わったとき", () => {
      // jsdom は CSS を計算しないので、最も近い data-mhk-theme を color-scheme とみなす（styles.css と同じ結果）
      const stubSchemeFromAttribute = () =>
        vi.spyOn(window, "getComputedStyle").mockImplementation(
          (element) =>
            ({
              colorScheme: element.closest("[data-mhk-theme]")?.getAttribute("data-mhk-theme") ?? "light",
            }) as CSSStyleDeclaration,
        );
      afterEach(() => {
        delete document.documentElement.dataset.mhkTheme;
      });

      it("html の data-mhk-theme が変わったら描き直す", async () => {
        const MermaidBlock = await loadBlock();
        stubSchemeFromAttribute();
        render(<MermaidBlock code={CODE} lang="mermaid" />);
        await screen.findByRole("img");
        expect(theme()).toBe("default");

        document.documentElement.dataset.mhkTheme = "dark";
        await waitFor(() => expect(theme()).toBe("dark"));
        expect(mock.render).toHaveBeenCalledTimes(2);

        delete document.documentElement.dataset.mhkTheme;
        await waitFor(() => expect(theme()).toBe("default"));
        expect(mock.render).toHaveBeenCalledTimes(3);
      });

      it("祖先の要素（ドロワーなど）の data-mhk-theme が変わったら描き直す", async () => {
        const MermaidBlock = await loadBlock();
        stubSchemeFromAttribute();
        const { container } = render(
          <aside data-mhk-theme="dark">
            <MermaidBlock code={CODE} lang="mermaid" />
          </aside>,
        );
        await screen.findByRole("img");
        expect(theme()).toBe("dark");

        container.querySelector("aside")?.setAttribute("data-mhk-theme", "light");
        await waitFor(() => expect(theme()).toBe("default"));
        expect(mock.render).toHaveBeenCalledTimes(2);
      });

      it("配色が変わらなければ描き直さない", async () => {
        const MermaidBlock = await loadBlock();
        stubSchemeFromAttribute();
        render(<MermaidBlock code={CODE} lang="mermaid" />);
        await screen.findByRole("img");

        await act(async () => {
          document.documentElement.dataset.mhkTheme = "light";
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
        expect(mock.render).toHaveBeenCalledTimes(1);
      });

      it("アンマウントしたら監視をやめる", async () => {
        const MermaidBlock = await loadBlock();
        const getComputedStyle = stubSchemeFromAttribute();
        const { unmount } = render(<MermaidBlock code={CODE} lang="mermaid" />);
        await screen.findByRole("img");
        unmount();
        const calls = getComputedStyle.mock.calls.length;

        document.documentElement.dataset.mhkTheme = "dark";
        await new Promise((resolve) => setTimeout(resolve, 20));
        expect(getComputedStyle.mock.calls.length).toBe(calls);
      });
    });
  });

  describe("誤り", () => {
    it("記法の誤りは、図の代わりにエラー文と元のコードを表示する", async () => {
      const MermaidBlock = await loadBlock();
      mock.render.mockRejectedValue(new Error("Parse error on line 2:\n...A -->\n------^"));
      const { container } = render(<MermaidBlock code={CODE} lang="mermaid" />);
      await waitFor(() => expect(container.querySelector(".mhk-mermaid-error")).not.toBeNull());
      expect(container.querySelector(".mhk-mermaid-message")?.textContent).toBe(
        "Parse error on line 2:\n...A -->\n------^",
      );
      expect(container.querySelector(".mhk-mermaid-error pre code")?.textContent).toBe(CODE);
      expect(container.querySelector("img")).toBeNull();
    });

    it("mermaid の読み込みに失敗したときも同じように表示し、次の描画で読み込み直す", async () => {
      const MermaidBlock = await loadBlock();
      mock.fail = true;
      const first = render(<MermaidBlock code={CODE} lang="mermaid" />);
      await waitFor(() => expect(first.container.querySelector(".mhk-mermaid-error")).not.toBeNull());
      expect(first.container.querySelector(".mhk-mermaid-error pre code")?.textContent).toBe(CODE);
      first.unmount();

      mock.fail = false;
      // 失敗した読み込みを持ち越さないよう、mermaid を登録し直す（同じ MermaidBlock のまま）
      vi.doUnmock("mermaid");
      mockMermaid();
      render(<MermaidBlock code={CODE} lang="mermaid" />);
      expect(await screen.findByRole("img")).toBeTruthy();
    });

    it("mermaid が残す一時的な要素を取り除く", async () => {
      const MermaidBlock = await loadBlock();
      mock.render.mockImplementation(async (id: string) => {
        for (const prefix of ["", "d"]) {
          const element = document.createElement("div");
          element.id = `${prefix}${id}`;
          document.body.append(element);
        }
        throw new Error("Parse error");
      });
      const { container } = render(<MermaidBlock code={CODE} lang="mermaid" />);
      await waitFor(() => expect(container.querySelector(".mhk-mermaid-error")).not.toBeNull());
      expect(document.body.querySelectorAll("[id*=mhk-mermaid-]")).toHaveLength(0);
    });
  });

  it("複数の図は1つずつ順番に描画する", async () => {
    const MermaidBlock = await loadBlock();
    let running = 0;
    let maxRunning = 0;
    mock.render.mockImplementation(async () => {
      running++;
      maxRunning = Math.max(maxRunning, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running--;
      return { svg: "<svg/>" };
    });
    render(
      <>
        <MermaidBlock code="flowchart TD\n  A --> B" lang="mermaid" />
        <MermaidBlock code="flowchart TD\n  C --> D" lang="mermaid" />
        <MermaidBlock code="flowchart TD\n  E --> F" lang="mermaid" />
      </>,
    );
    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
    expect(maxRunning).toBe(1);
  });

  it("codeBlocks.mermaid に登録すると、```mermaid が図になる", async () => {
    const MermaidBlock = await loadBlock();
    let help: ReturnType<typeof useHelp> | undefined;
    const Probe = () => {
      help = useHelp();
      return null;
    };
    const files: Record<string, string> = { _index: "", p: "# 図\n\n```mermaid\nflowchart TD\n  A --> B\n```" };
    const source = {
      loadIndex: async () => files._index ?? "",
      loadPage: async (id: string) => {
        const content = files[id];
        if (content === undefined) throw new HelpNotFoundError(id);
        return content;
      },
    };
    render(
      <HelpProvider source={source} codeBlocks={{ mermaid: MermaidBlock }}>
        <Probe />
        <HelpContent />
      </HelpProvider>,
    );
    act(() => help?.open("p"));
    const img = await screen.findByRole("img");
    expect(img.getAttribute("alt")).toBe("flowchart TD\n  A --> B");
  });
});
