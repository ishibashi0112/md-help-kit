// デモアプリ（DESIGN.md 12章の example/）の Vite の設定。起動は pnpm example
import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

const exampleDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = join(exampleDir, "..", "src");
const docsDir = join(exampleDir, "docs");

const contentTypes: Record<string, string> = {
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

/**
 * example/docs/ を /help/ で配信する（remote の取得元のため）。
 * 存在しないファイルは、アプリの HTML ではなく 404 を返す（実際のサーバーと同じように）
 */
function serveHelpDocs(): Plugin {
  return {
    name: "md-help-kit-example:serve-help-docs",
    configureServer(server) {
      server.middlewares.use("/help", (req, res) => {
        const file = docsFile(req.url ?? "/");
        if (file === null || statSync(file, { throwIfNoEntry: false })?.isFile() !== true) {
          res.statusCode = 404;
          res.end();
          return;
        }
        res.setHeader("Content-Type", contentTypes[extname(file)] ?? "application/octet-stream");
        createReadStream(file).pipe(res);
      });
    },
  };
}

/** URL のパスを docs/ の中のファイルのパスにする。docs/ の外を指すときや、デコードできないときは null */
function docsFile(url: string): string | null {
  let path: string;
  try {
    path = decodeURIComponent(new URL(url, "http://localhost").pathname);
  } catch {
    return null;
  }
  const file = normalize(join(docsDir, path));
  return file.startsWith(docsDir + sep) ? file : null;
}

export default defineConfig(({ mode }) => ({
  root: exampleDir,
  publicDir: false,
  plugins: [serveHelpDocs()],
  resolve: {
    // 利用者と同じ書き方で import し、ビルドせずに src/ を読む
    alias: [
      { find: /^md-help-kit$/, replacement: join(srcDir, "core/index.ts") },
      { find: /^md-help-kit\/ui$/, replacement: join(srcDir, "ui/index.ts") },
      { find: /^md-help-kit\/ui\/styles\.css$/, replacement: join(srcDir, "ui/styles.css") },
      { find: /^md-help-kit\/mermaid$/, replacement: join(srcDir, "mermaid/index.ts") },
    ],
  },
  // ライブラリを src から読むと、開発時の警告（DESIGN.md 11章）が使う process.env.NODE_ENV が
  // 置き換えられないので、ここで定義する（node_modules から使う利用者では Vite が置き換える）
  define: {
    "process.env.NODE_ENV": JSON.stringify(mode === "production" ? "production" : "development"),
  },
  server: {
    fs: { allow: [join(exampleDir, "..")] },
  },
}));
