// @vitest-environment node
import type { ImportGlobFunction } from "vite/types/importGlob.d.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpLoadError, HelpNotFoundError } from "./errors.js";
import { bundled } from "./source-bundled.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("bundled", () => {
  describe("ページIDの正規化", () => {
    it("キーの共通の接頭辞と .md を取り除く", async () => {
      const source = bundled({
        "./docs/_index.md": "目次",
        "./docs/orders.md": "受注",
        "./docs/stock/colors.md": "色",
      });
      await expect(source.loadIndex()).resolves.toBe("目次");
      await expect(source.loadPage("orders")).resolves.toBe("受注");
      await expect(source.loadPage("stock/colors")).resolves.toBe("色");
    });

    it("共通の接頭辞はディレクトリ単位で求める", async () => {
      const source = bundled({ "./docs/order.md": "a", "./docs/orders.md": "b" });
      await expect(source.loadPage("order")).resolves.toBe("a");
      await expect(source.loadPage("orders")).resolves.toBe("b");
    });

    it("/ で始まるキーや、ディレクトリのないキーも扱える", async () => {
      await expect(bundled({ "/src/docs/_index.md": "目次" }).loadIndex()).resolves.toBe("目次");
      await expect(bundled({ "_index.md": "目次", "a.md": "a" }).loadPage("a")).resolves.toBe("a");
    });

    it("日本語や空白を含むファイル名もそのままページIDにする", async () => {
      const source = bundled({ "./docs/_index.md": "", "./docs/設定/画面 一覧.md": "x" });
      await expect(source.loadPage("設定/画面 一覧")).resolves.toBe("x");
    });

    it(".md で終わらないキーは無視し、警告する", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const source = bundled({ "./docs/_index.md": "", "./docs/a.md": "a", "./other/note.txt": "x" });
      // 無視したキーは、共通の接頭辞の計算にも使わない
      await expect(source.loadPage("a")).resolves.toBe("a");
      expect(warn).toHaveBeenCalledWith(
        '[md-help-kit] bundled: ignored "./other/note.txt" because it does not end with .md.',
      );
    });
  });

  it("遅延読み込みの関数も受け付ける", async () => {
    const load = vi.fn(async () => "受注");
    const source = bundled({ "./docs/_index.md": async () => "目次", "./docs/orders.md": load });
    expect(load).not.toHaveBeenCalled();
    await expect(source.loadIndex()).resolves.toBe("目次");
    await expect(source.loadPage("orders")).resolves.toBe("受注");
    expect(load).toHaveBeenCalledTimes(1);
  });

  describe("エラー", () => {
    const source = bundled({ "./docs/_index.md": "目次", "./docs/orders.md": "受注" });

    it.each(["missing", "Orders", "../docs/orders", "./orders", "", "stock//colors"])(
      "存在しないページ %j は HelpNotFoundError",
      async (id) => {
        const error = await source.loadPage(id).catch((e: unknown) => e);
        expect(error).toBeInstanceOf(HelpNotFoundError);
        expect((error as HelpNotFoundError).pageId).toBe(id);
      },
    );

    it("目次がなければ HelpNotFoundError", async () => {
      const error = await bundled({ "./docs/a.md": "a" })
        .loadIndex()
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HelpNotFoundError);
      expect((error as HelpNotFoundError).pageId).toBe("_index");
    });

    it("遅延読み込みが失敗したら HelpLoadError（元のエラーを cause に持つ）", async () => {
      const cause = new Error("chunk load failed");
      const error = await bundled({
        "./docs/orders.md": async () => {
          throw cause;
        },
      })
        .loadPage("orders")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HelpLoadError);
      expect((error as HelpLoadError).cause).toBe(cause);
    });

    it("文字列以外が返ったら、glob の指定を案内する HelpLoadError", async () => {
      // query: "?raw", import: "default" を付け忘れると、モジュールのオブジェクトが返る
      const modules = { "./docs/orders.md": async () => ({ default: "受注" }) } as never;
      const error = await bundled(modules)
        .loadPage("orders")
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(HelpLoadError);
      expect((error as Error).message).toContain('{ query: "?raw", import: "default" }');
    });
  });

  it("画像の相対パスは解決しない（resolveAsset を持たない）", () => {
    expect(bundled({}).resolveAsset).toBeUndefined();
  });

  it("import.meta.glob の結果をそのまま渡せる（型の確認）", () => {
    // 型だけを確かめる。実行はしない
    const typeCheck = (glob: ImportGlobFunction) => {
      bundled(glob("./docs/**/*.md", { query: "?raw", import: "default" }));
      bundled(glob("./docs/**/*.md", { query: "?raw", import: "default", eager: true }));
      // @ts-expect-error 文字列以外の値は受け付けない
      bundled({ "./docs/a.md": 1 });
    };
    expect(typeCheck).toBeTypeOf("function");
  });
});
