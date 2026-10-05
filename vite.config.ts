import { readFileSync } from "node:fs";
import type { Plugin } from "vite";
import dts from "vite-plugin-dts";
import { defineConfig } from "vitest/config";

// 入口ごとの出力先。キーが dist 内のパス（拡張子なし）になり、package.json の exports と対応する
const entries = {
  "core/index": "src/core/index.ts",
  "ui/index": "src/ui/index.ts",
  "mermaid/index": "src/mermaid/index.ts",
};

// dependencies と peerDependencies はバンドルに含めず、利用者側で解決させる
const pkg = JSON.parse(readFileSync("package.json", "utf8"));
const externals = Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies });
const isExternal = (id: string) =>
  externals.some((name) => id === name || id.startsWith(`${name}/`));

// UI層のCSSは JS から import させず、利用者が直接読み込む1枚のファイルとしてそのまま置く
const stylesSource = "src/ui/styles.css";
function copyStyles(): Plugin {
  return {
    name: "mhk-copy-styles",
    apply: "build",
    buildStart() {
      this.addWatchFile(stylesSource);
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "ui/styles.css",
        source: readFileSync(stylesSource, "utf8"),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: "tsconfig.json",
      entryRoot: "src",
      include: ["src"],
      exclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    }),
    copyStyles(),
  ],
  build: {
    lib: {
      entry: entries,
      formats: ["es"],
      fileName: (_format, entryName) => `${entryName}.js`,
    },
    rolldownOptions: {
      external: isExternal,
      output: {
        chunkFileNames: "chunks/[name]-[hash].js",
      },
    },
    copyPublicDir: false,
  },
  test: {
    environment: "jsdom",
  },
});
