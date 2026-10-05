# md-help-kit

Reactアプリ向けのアプリ内ヘルプキット（npmパッケージ）。
仕様は `DESIGN.md` が正。実装で迷ったら、まず `DESIGN.md` を読むこと。

## 進め方

- `DESIGN.md` 13章の順序で、1段階ずつ進める
- 1つの段階が終わったら、テストを通し、変更内容を要約して止まる。次の段階へは指示があってから進む
- 仕様に書かれていないことを決める必要が出たら、実装せずに質問する
- 仕様と実装が食い違うと分かったら、黙ってどちらかに合わせず報告する。仕様を変える場合は `DESIGN.md` も同時に更新する

## 守ること

- `dependencies` は `markdown-to-jsx` だけ。追加が必要だと考えたら、入れる前に理由を添えて相談する
- `markdown-to-jsx` を import してよいのは `src/core/markdown.ts` だけ
- `src/ui` と `src/mermaid` は、`src/core/index.ts` が公開しているものだけを使う
- 安全性（`DESIGN.md` 7章）の制限は緩めない。`tagfilter: false` と `evalUnserializableExpressions: true` は使わない
- モジュールの読み込み時に `window` や `document` へ触れない
- 段階の範囲外の機能（`DESIGN.md` 15章の候補など）を先回りして実装しない

## 参考資料

- `reference/prose-sample-light.html`、`reference/prose-sample-dark.html`: 本文スタイルの見本。
  UI層のCSS（`DESIGN.md` 9.5節）を書くときに、色、余白、文字サイズの基準として読む。
  デザインツールが出力したファイルなので、構造やインラインスタイルはそのまま流用しない（値だけを参考にする）

## コマンド

- インストール: `pnpm install`
- テスト: `pnpm test`（監視モードは `pnpm test:watch`）
- 型検査: `pnpm typecheck`
- ビルド: `pnpm build`（`dist/` に出力）。型エラーがあってもビルドは止まらないので、型は `pnpm typecheck` で確認する
- example の起動: 手順9で記入する

## 規約

- パッケージマネージャ: pnpm（バージョンは `package.json` の `packageManager`）
- ビルドツール: Vite のライブラリモード。型定義は `vite-plugin-dts` で出力する。`src/ui/styles.css` は変換せずに `dist/ui/styles.css` へ置く
- 配布形式: ESM のみ
- TypeScript: 6.0系を使う（7.0系には `vite-plugin-dts` が使う JS API がないため）
- 相対 import には拡張子 `.js` を付ける（`.ts`、`.tsx` のファイルを指す場合も `.js`）。tsconfig の `NodeNext` で強制される。`moduleResolution: nodenext` の利用者でも型定義を解決できるようにするため
- テスト: Vitest と Testing Library。DOM環境は jsdom（全体の既定）。DOMのない環境で確かめるテストは、ファイル先頭に `// @vitest-environment node` を書く
- テストファイルはソースの隣に置く（`src/core/slug.ts` と `src/core/slug.test.ts`）
- 開発とテストで使う React は 19（peer の下限は 18）
- 改行コード: LF（`.gitattributes`、`.editorconfig`）。インデントはスペース2つ
- コメントの言語: 日本語（公開APIの JSDoc を含む）
- 開発時の警告とエラーの文言: 英語（`DESIGN.md` 11章）
