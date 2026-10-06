// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { HelpLoadError, HelpNotFoundError } from "./errors.js";
import { remote } from "./source-remote.js";

let fetchMock: Mock<typeof fetch>;
beforeEach(() => {
  fetchMock = vi.fn<typeof fetch>(async () => new Response("本文", { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const requestedUrls = () => fetchMock.mock.calls.map(([url]) => url);

describe("remote", () => {
  describe("URLの組み立て", () => {
    it("目次は ${baseUrl}/_index.md、ページは ${baseUrl}/${id}.md", async () => {
      const source = remote("/help");
      await source.loadIndex();
      await source.loadPage("orders");
      await source.loadPage("stock/colors");
      expect(requestedUrls()).toEqual(["/help/_index.md", "/help/orders.md", "/help/stock/colors.md"]);
    });

    it("パスの各セグメントをエンコードする", async () => {
      await remote("/help").loadPage("設定/画面 一覧#?");
      expect(requestedUrls()).toEqual([
        "/help/%E8%A8%AD%E5%AE%9A/%E7%94%BB%E9%9D%A2%20%E4%B8%80%E8%A6%A7%23%3F.md",
      ]);
    });

    it("baseUrl の末尾の / は取り除く", async () => {
      await remote("https://files.example.co.jp/app-help/").loadPage("orders");
      await remote("/").loadIndex();
      expect(requestedUrls()).toEqual([
        "https://files.example.co.jp/app-help/orders.md",
        "/_index.md",
      ]);
    });
  });

  describe("fetch の設定", () => {
    it("標準は cache: no-cache", async () => {
      await remote("/help").loadIndex();
      expect(fetchMock.mock.calls[0]?.[1]).toEqual({ cache: "no-cache" });
    });

    it("fetchInit で上書きできる", async () => {
      await remote("/help", { fetchInit: { credentials: "include" } }).loadIndex();
      await remote("/help", { fetchInit: { cache: "default", headers: { "X-A": "1" } } }).loadIndex();
      expect(fetchMock.mock.calls.map(([, init]) => init)).toEqual([
        { cache: "no-cache", credentials: "include" },
        { cache: "default", headers: { "X-A": "1" } },
      ]);
    });
  });

  it("本文を文字列で返す", async () => {
    fetchMock.mockResolvedValue(
      new Response("# 受注一覧", { headers: { "Content-Type": "text/markdown; charset=utf-8" } }),
    );
    await expect(remote("/help").loadPage("orders")).resolves.toBe("# 受注一覧");
  });

  describe("エラーの変換", () => {
    const failure = (source: Promise<string>) => source.catch((e: unknown) => e);

    it("404 は HelpNotFoundError", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 404 }));
      const error = await failure(remote("/help").loadPage("missing"));
      expect(error).toBeInstanceOf(HelpNotFoundError);
      expect((error as HelpNotFoundError).pageId).toBe("missing");
    });

    it("目次の 404 も HelpNotFoundError", async () => {
      fetchMock.mockResolvedValue(new Response("", { status: 404 }));
      const error = await failure(remote("/help").loadIndex());
      expect((error as HelpNotFoundError).pageId).toBe("_index");
    });

    it.each([500, 403, 410, 401])("%i は HelpLoadError（ステータスを持つ）", async (status) => {
      fetchMock.mockResolvedValue(new Response("", { status }));
      const error = await failure(remote("/help").loadPage("orders"));
      expect(error).toBeInstanceOf(HelpLoadError);
      expect((error as HelpLoadError).status).toBe(status);
    });

    it("ネットワークの失敗は HelpLoadError（元のエラーを cause に持つ）", async () => {
      const cause = new TypeError("Failed to fetch");
      fetchMock.mockRejectedValue(cause);
      const error = await failure(remote("/help").loadPage("orders"));
      expect(error).toBeInstanceOf(HelpLoadError);
      expect((error as HelpLoadError).status).toBeUndefined();
      expect((error as HelpLoadError).cause).toBe(cause);
    });

    it("本文の読み込みの失敗は HelpLoadError", async () => {
      const response = new Response("x");
      const cause = new TypeError("body stream already read");
      vi.spyOn(response, "text").mockRejectedValue(cause);
      fetchMock.mockResolvedValue(response);
      const error = await failure(remote("/help").loadPage("orders"));
      expect(error).toBeInstanceOf(HelpLoadError);
      expect((error as HelpLoadError).cause).toBe(cause);
    });

    it("200 でも HTML が返ったら HelpNotFoundError とし、警告する", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      fetchMock.mockResolvedValue(
        new Response("<!doctype html>", { headers: { "Content-Type": "Text/HTML; charset=utf-8" } }),
      );
      const error = await failure(remote("/help").loadPage("missing"));
      expect(error).toBeInstanceOf(HelpNotFoundError);
      expect(warn).toHaveBeenCalledWith(
        '[md-help-kit] remote: "/help/missing.md" returned HTML instead of Markdown, so it was treated as not found.',
      );
    });

    it.each(["../secret", "./orders", "", "stock//colors", "stock/..", "/orders"])(
      "docs の外を指しうるページID %j は、取得せずに HelpNotFoundError",
      async (id) => {
        const error = await failure(remote("/help").loadPage(id));
        expect(error).toBeInstanceOf(HelpNotFoundError);
        expect(fetchMock).not.toHaveBeenCalled();
      },
    );
  });

  describe("resolveAsset", () => {
    it.each([
      // [baseUrl, ページID, パス, 結果]
      ["https://files.example.co.jp/app-help", "orders", "img/a.png", "https://files.example.co.jp/app-help/img/a.png"],
      ["https://files.example.co.jp/app-help", "stock/colors", "../img/a.png", "https://files.example.co.jp/app-help/img/a.png"],
      ["https://files.example.co.jp/app-help", "stock/colors", "./a.png?v=1#x", "https://files.example.co.jp/app-help/stock/a.png?v=1#x"],
      ["https://files.example.co.jp/app-help", "orders", "/img/a.png", "https://files.example.co.jp/img/a.png"],
      ["//files.example.co.jp/app-help", "orders", "img/a.png", "//files.example.co.jp/app-help/img/a.png"],
      ["/help", "orders", "img/a.png", "/help/img/a.png"],
      ["/help", "stock/colors", "../../../img/a.png", "/img/a.png"],
      ["/help", "設定/画面", "図 1.png", "/help/%E8%A8%AD%E5%AE%9A/%E5%9B%B3%201.png"],
      ["/help", "orders", "/img/a.png", "/img/a.png"],
      ["help", "stock/colors", "a.png", "help/stock/a.png"],
      ["./help", "stock/colors", "../../../img/a.png?v=1", "../img/a.png?v=1"],
      ["help", "orders", "/img/a.png", "/img/a.png"],
    ])("%s のページ %s で %s → %s", (baseUrl, pageId, path, expected) => {
      expect(remote(baseUrl).resolveAsset?.(pageId, path)).toBe(expected);
    });

    it.each(["https://cdn.example.com/a.png", "//cdn.example.com/a.png", "data:image/png;base64,AA"])(
      "絶対URL %s はそのまま返す",
      (path) => {
        expect(remote("/help").resolveAsset?.("orders", path)).toBe(path);
        expect(remote("help").resolveAsset?.("orders", path)).toBe(path);
      },
    );
  });
});
