import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { type HelpApi, HelpNotFoundError, HelpProvider, useHelp } from "../core/index.js";
import { HelpButton } from "./button.js";
import { jaLabels } from "./labels.js";

const FILES: Record<string, string> = {
  _index: "- [受注一覧](orders.md)\n- [在庫照会](stock.md)",
  orders: "# 受注一覧",
  stock: "# 在庫照会",
};

let help: HelpApi;
function Probe() {
  help = useHelp();
  return null;
}

function setup(ui: ReactNode) {
  const source = {
    loadIndex: async () => FILES._index ?? "",
    loadPage: async (id: string) => {
      const content = FILES[id];
      if (content === undefined) throw new HelpNotFoundError(id);
      return content;
    },
  };
  return render(
    <HelpProvider source={source} defaultPage="orders">
      <Probe />
      {ui}
    </HelpProvider>,
  );
}

const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HelpButton", () => {
  it("クリックで開閉し、aria-expanded で状態を示す", async () => {
    setup(<HelpButton />);
    const button = screen.getByRole("button", { name: "Help" });
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    await flush();
    expect(help.isOpen).toBe(true);
    expect(help.current?.id).toBe("orders");
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button);
    expect(help.isOpen).toBe(false);
  });

  it("標準はアイコンだけで、aria-label は labels から付ける", () => {
    setup(<HelpButton labels={jaLabels} />);
    const button = screen.getByRole("button", { name: "ヘルプ" });
    expect(button.querySelector("svg")).not.toBeNull();
    expect(button.className).toBe("mhk-button");
  });

  it("children で中身を差し替えられる（aria-label は付けない）", () => {
    setup(<HelpButton>使い方</HelpButton>);
    const button = screen.getByRole("button", { name: "使い方" });
    expect(button.hasAttribute("aria-label")).toBe(false);
    expect(button.querySelector("svg")).toBeNull();
  });

  it("className と、そのほかの属性を受け付ける", () => {
    setup(<HelpButton className="my-button" data-testid="help" title="ヘルプを開く" />);
    const button = screen.getByTestId("help");
    expect(button.className).toBe("mhk-button my-button");
    expect(button.getAttribute("title")).toBe("ヘルプを開く");
  });

  describe("target", () => {
    it("閉じているときは、そのページを開く", async () => {
      setup(<HelpButton target="stock" />);
      fireEvent.click(screen.getByRole("button"));
      await flush();
      expect(help.isOpen).toBe(true);
      expect(help.current?.id).toBe("stock");
    });

    it("そのページを表示中なら閉じる", async () => {
      setup(<HelpButton target="stock#在庫照会" />);
      act(() => help.open("stock"));
      await flush();
      fireEvent.click(screen.getByRole("button"));
      expect(help.isOpen).toBe(false);
    });

    it("別のページを表示中なら、そのページへ移動する", async () => {
      setup(<HelpButton target="stock" />);
      act(() => help.open("orders"));
      await flush();
      fireEvent.click(screen.getByRole("button"));
      await flush();
      expect(help.isOpen).toBe(true);
      expect(help.current?.id).toBe("stock");
    });
  });
});
