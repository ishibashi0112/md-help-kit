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

雛形の作成後に記入する（インストール、テスト、ビルド、example の起動）。

## 規約

着手前に記入する（パッケージマネージャ、ビルドツール、改行コード、コメントの言語）。
