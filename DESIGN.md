# md-help-kit 設計書（v0.1）

パッケージ名 `md-help-kit` は仮称。

## 1. 目的

Reactアプリに「アプリ内ヘルプ」を組み込むためのnpmパッケージ。
`.md` ファイルを置くだけで、ヘルプドロワー、目次、画面との連動、ページ間リンク、検索が揃う。

解決したい課題は次の2つ。

- ヘルプ機能（ドロワー、目次、画面連動、検索）を、アプリごとに毎回手書きしている
- マニュアルの文言を直すだけなのに、アプリの再ビルドとリリース手続きが必要になる

### 想定する利用者

- 組み込む人: React（SPA、Viteなど）でアプリを作る開発者
- ヘルプを書く人: 開発者。mdはGitで管理する
- 読む人: アプリのエンドユーザー

### 設計の原則

- **依存を最小にする**: 本体の依存は1つだけ。重い機能は差し込み口を用意し、使う人が自分で入れる
- **mdだけで完結する**: 目次もmdで書く。CLIや専用のビルド工程を必須にしない
- **取得元に依存しない**: ビルドに含めても外部に置いても、同じ挙動になる

### v0.1でやらないこと

- MDX対応
- 検索用の索引ファイル、形態素解析
- ヘルプの編集画面
- SSR対応（ただし import 時に `window` へ触れない）

## 2. 全体構成

1パッケージ、入口を分ける。

| 入口 | 中身 | スタイル |
|---|---|---|
| `md-help-kit` | コア層。状態、取得元、解析、素の描画 | なし（ヘッドレス） |
| `md-help-kit/ui` | UI層。完成品のドロワー、ボタン、標準部品 | あり |
| `md-help-kit/ui/styles.css` | UI層のCSS | |
| `md-help-kit/mermaid` | Mermaid図の描画部品（任意） | |

UI層はコア層の公開APIだけを使って実装する（内部モジュールを直接参照しない）。
これにより、コア層のAPIが実用に足りることを保証する。

配布形式は ESM のみとする。

### 依存

| 種別 | パッケージ | 備考 |
|---|---|---|
| peer | `react`、`react-dom` | 18以上 |
| dependencies | `markdown-to-jsx` | これ1つだけ |
| peer（任意） | `mermaid` | `md-help-kit/mermaid` を使う人だけが入れる。`peerDependenciesMeta` で optional 指定 |

- mdの解析（目次、見出し、検索用の本文抽出）と描画は、すべて `markdown-to-jsx` で行う
- React向けの入口 `markdown-to-jsx/react` を使う（v9以降。メインの入口のReact用コードは非推奨）
- 見出しIDの生成は自前で実装する（3.3）
- 依存を追加したくなった場合は、まず差し込み口（6章）で解決できないかを検討する

`markdown-to-jsx` の使い方は14章にまとめた。

## 3. ドキュメントの置き方

```
docs/
  _index.md        目次（必須）
  orders.md
  stock.md
  stock/colors.md
  img/filter.png
```

### 3.1 `_index.md`（目次）

リンクのネストしたリストで、ページ一覧、表示順、階層、タイトルを定義する。

```md
- [受注一覧](orders.md)
- [在庫照会](stock.md)
  - [在庫数の色について](stock/colors.md)
- 管理者向け
  - [設定](settings.md)
```

- リンクのある項目はページ。リンク文字列がタイトルになる
- リンクのない項目はグループ見出し
- リスト以外の要素（見出し、段落）は無視する
- 目次に載っていないページも、リンクや `useHelpPage` からは開ける（目次と検索には出ない）
- 目次にないページのタイトルは、本文の最初の `#` 見出し、なければページID

### 3.2 ページID

docsルートからの相対パスから拡張子 `.md` を除いたもの。区切りは常に `/`。

- `orders.md` → `orders`
- `stock/colors.md` → `stock/colors`

見出しまで指す場合は `orders#一括更新` と書く（これを「ターゲット」と呼ぶ）。

### 3.3 見出しID

見出しの文字列から、次の規則で生成する（自前実装。GitHubの挙動に近づける）。

1. 前後の空白を除き、英字を小文字にする
2. 文字（各国語を含む）、数字、`-`、`_`、空白以外を取り除く
3. 空白を `-` に置き換える
4. 同じページ内で重複したら `-1`、`-2` と連番を付ける

日本語はそのまま残る（例: `## 一括更新` → `一括更新`）。

1〜3 を `slug.ts` に実装し、`markdown-to-jsx` の `options.slugify` に渡す。
4 の連番はライブラリが自動で行うので、自前では実装しない。
見出しの一覧は、`parser()` が返す見出しノードの `id` をそのまま使う（描画結果と必ず一致させるため）。

## 4. 取得元（HelpSource）

```ts
export interface HelpSource {
  /** _index.md の中身を返す */
  loadIndex(): Promise<string>;
  /** ページIDに対応するmdの中身を返す。存在しなければ HelpNotFoundError を投げる */
  loadPage(id: string): Promise<string>;
  /** md内の相対パス（画像など）を、表示用URLに解決する。省略時は変換しない */
  resolveAsset?(pageId: string, path: string): string;
}
```

目次の解析、見出しの抽出、リンクの解決、検索は、すべて取得元に依存しない共通処理にする。

### 4.1 `bundled(modules)`：ビルドに含める

```ts
const source = bundled(
  import.meta.glob("./docs/**/*.md", { query: "?raw", import: "default" })
);
```

- 引数は `Record<string, string | (() => Promise<string>)>`（即時読み込み、遅延読み込みの両方を受ける）
- キーの共通の接頭辞と `.md` を取り除いてページIDにする
- 画像は v0.1 では絶対URLと `public/` 配下のパスのみ対応（制限事項としてREADMEに書く）

### 4.2 `remote(baseUrl, options?)`：外部に置く

```ts
const source = remote("/help");
const source2 = remote("https://files.example.co.jp/app-help", {
  fetchInit: { credentials: "include" },
});
```

- `loadIndex` は `${baseUrl}/_index.md`、`loadPage(id)` は `${baseUrl}/${id}.md` を取得する
- パスの各セグメントは `encodeURIComponent` する
- `fetch` は標準で `cache: "no-cache"`（毎回サーバーに更新確認。差し替えが即反映される）
- `options.fetchInit` で `fetch` の設定を上書きできる（認証付き、別オリジンなど）
- 404 は `HelpNotFoundError`、それ以外の失敗は `HelpLoadError`
- 相対パスの画像は、ページのURLを基準に解決する（`resolveAsset` を実装）
- 別オリジンに置く場合、CORSの設定は利用者の責任（READMEに書く）

## 5. コア層のAPI

### 5.1 `HelpProvider`

```tsx
<HelpProvider
  source={source}
  defaultPage="orders"
  components={{ OpenScreen, Shortcut }}
  codeBlocks={{ mermaid: MermaidBlock }}
>
  <App />
</HelpProvider>
```

| prop | 型 | 説明 |
|---|---|---|
| `source` | `HelpSource` | 必須 |
| `defaultPage` | `string` | 画面に紐付くページがないときに開くページ。省略時は目次の先頭 |
| `components` | `Record<string, ComponentType<any>>` | md内で使える独自タグ（6.1） |
| `codeBlocks` | `Record<string, ComponentType<HelpCodeBlockProps>>` | 言語名ごとのコードブロック描画（6.2） |
| `allowedTags` | `string[]` | md内で使えるHTMLタグの追加（7章） |

### 5.2 `useHelpPage(target)`

「この画面のヘルプはこれ」と宣言するフック。

```tsx
useHelpPage("orders");
useHelpPage("orders#一括更新");
useHelpPage(isAdmin ? "settings" : null); // null は宣言なし
```

- マウント時に登録、アンマウント時に解除する
- 複数のコンポーネントが宣言した場合、最後にマウントされたものが有効（スタックで管理し、解除されたら1つ前に戻る）
- ドロワーが開いている間に画面のページが変わったら、表示も追従する

### 5.3 `useHelp()`

```ts
interface HelpApi {
  isOpen: boolean;
  open(target?: string): void;   // 省略時は画面のページ → defaultPage の順
  close(): void;
  toggle(): void;

  index: HelpIndexNode[];        // 目次ツリー
  indexStatus: "loading" | "ready" | "error";

  current: {
    id: string;
    title: string;
    markdown: string;
    headings: HelpHeading[];     // { depth, text, id }
    status: "loading" | "ready" | "not-found" | "error";
  } | null;

  screenTarget: string | null;   // 画面が宣言しているターゲット
  navigate(target: string): void;
  back(): void;
  canGoBack: boolean;
  reload(): void;                // 現在のページを取得し直す

  search(query: string): Promise<HelpSearchHit[]>;
}

type HelpIndexNode =
  | { type: "page"; id: string; title: string; children: HelpIndexNode[] }
  | { type: "group"; title: string; children: HelpIndexNode[] };

interface HelpSearchHit {
  pageId: string;
  pageTitle: string;
  headingId: string | null;      // 一致箇所の直近の見出し
  headingText: string | null;
  snippet: string;               // 一致箇所の前後を切り出した文字列
}
```

- 取得したページはメモリにキャッシュする（`reload()` で破棄）
- 履歴（`back`）はドロワー内だけの簡易スタック。ブラウザの履歴には触れない

### 5.4 `HelpContent`

現在のページを描画する、スタイルなしのコンポーネント。

```tsx
<HelpContent className="..." overrides={{ a: MyLink }} />
```

- `markdown-to-jsx` で描画する（表、タスクリスト、取り消し線に対応）
- 見出しに 3.3 のIDを付ける
- リンクは 5.5 の規則で処理する
- 画像は `source.resolveAsset` で解決する
- 独自タグとコードブロックは 6章、HTMLタグの制限は 7章に従う
- `overrides` で標準の要素（`a`、`table` など）を差し替えられる

### 5.5 リンクの解決規則

| リンク先 | 動作 |
|---|---|
| `./stock.md`、`stock/colors.md#赤` | ドロワー内でページ遷移（現在のページからの相対パスで解決） |
| `#一括更新` | 同じページ内の見出しへスクロール |
| `http://`、`https://`、`mailto:` | 新しいタブで開く（`rel="noreferrer noopener"`） |
| その他 | 何もせず通常のリンクとして描画 |

## 6. 差し込み口（リッチな表現）

本体の依存を増やさずに表現力を確保するための仕組み。
本体は「どこに何を差し込めるか」だけを決め、重いライブラリは利用者が必要な分だけ入れる。

### 6.1 独自タグ（`components`）

md内に、登録済みのコンポーネントをタグとして書ける。
ビルドが不要なので、外部配置のmdでも使える。

```md
<OpenScreen to="settings">設定画面を開く</OpenScreen>

<Shortcut keys={["Ctrl", "E"]} />
```

- タグ名は大文字始まり。`components` に登録した名前だけが有効
- 文字列の属性は文字列として、`{...}` で書いた配列、オブジェクト、真偽値は解析済みの値としてpropsに渡る
- 関数や変数を書いた属性は、実行されず文字列のまま渡る（`evalUnserializableExpressions` は絶対に有効にしない）
- タグの中身はmdとして描画され、`children` に渡る
- 登録されていないタグは、描画せず文字として表示する（開発時は警告）

### 6.2 コードブロック（`codeBlocks`）

言語名ごとに、コードブロックの描画を差し替える。

```ts
interface HelpCodeBlockProps {
  code: string;   // コードブロックの中身
  lang: string;   // 言語名
}
```

- `codeBlocks.mermaid` を登録すれば ` ```mermaid ` が図になる
- `codeBlocks.math` を登録すれば ` ```math ` が数式になる（KaTeXなどは利用者が用意）
- `codeBlocks["*"]` は、個別登録のない全言語に適用する（コードの色付け用）
- 登録がなければ、素の `<pre><code>` で描画する

### 6.3 注意書き（アラート記法）

注意書きは独自タグではなく、GitHubのアラート記法で書く。
VS CodeやGitHubのプレビューでも注意書きとして表示されるため。

```md
> [!WARNING]
> 完了済みの行は変更できません。
```

- 種別は `NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION` の5つ
- `markdown-to-jsx` が引用ブロックのノードに種別（`alert`）を付けるので、それを見て描画する
- コア層は種別を `data-mhk-alert` 属性として出すだけ。見た目はUI層のCSSが担当する（9.5）

### 6.4 同梱する部品

| 部品 | 入口 | 追加の依存 |
|---|---|---|
| `MermaidBlock` | `md-help-kit/mermaid` | `mermaid`（任意のpeer） |

`MermaidBlock` の仕様:

- `mermaid` は初回の描画時に動的 import する（使わないページでは読み込まれない）
- `securityLevel: "strict"` で初期化する
- 記法の誤りは、図の代わりにエラー文と元のコードを表示する

## 7. 安全性

`markdown-to-jsx` はmd内のHTMLを解釈するため、通すものを明示的に絞る。
ライブラリ標準の保護に、許可リストを上乗せする二段構えにする。

**ライブラリが標準で行うこと（設定を変えない）**

- `script`、`iframe`、`style` などの危険なタグを無効化する（`tagfilter`。標準で有効）
- `on` で始まる属性を除去する
- `javascript:` などの危険なURLを除去する

**このパッケージが上乗せすること（`sanitize.ts`、`renderRule` で実装）**

- **HTMLタグ**: 許可リスト方式。標準で許可するのは `details`、`summary`、`kbd`、`br`、`sub`、`sup`、`mark`。`allowedTags` で追加できる
- **独自タグ**: `components` に登録したものだけ
- **それ以外のタグ**: 描画せず、文字として表示する。HTMLブロックと自己終了タグのノードについて、タグ名を見て判定する
- **属性**: 許可したHTMLタグの `style` は捨てる
- **URL**: リンクと画像のURLは、`http:`、`https:`、`mailto:`、相対パスのみ許可する（`data:` も不可）
- **禁止する設定**: `tagfilter: false` と `evalUnserializableExpressions: true` は、利用者が指定できないようにする

これらの制限は `HelpContent` の中で必ず適用し、利用者が誤って外せないようにする。
テストでは、上記の各項目について「通らないこと」を確認する（10章）。

## 8. 検索（v0.1）

- 初回の検索時に、目次に載っている全ページを取得する（以後はキャッシュ）
- 検索語と本文の両方を NFKC 正規化し、小文字化してから部分一致で探す（全角と半角の違いを吸収）
- 空白区切りの複数語は AND 条件
- 本文は解析結果から文字だけを取り出して照合する（md記法やタグは対象外）
- 結果は「ページ × 見出し区間」単位で返す。タイトル一致、見出し一致、本文一致の順に並べる

## 9. UI層

```tsx
import { HelpDrawer, HelpButton } from "md-help-kit/ui";
import "md-help-kit/ui/styles.css";

<HelpButton />
<HelpDrawer />
```

### 9.1 `HelpDrawer`

- 画面右端に表示する。`side="left"` も可
- モーダルにしない。ヘルプを開いたままアプリを操作できる
- `document.body` へポータルで描画する
- 構成: ヘッダー（戻る、タイトル、閉じる）、検索欄、本文、ページ内目次、全体目次への切り替え
- 状態ごとの表示: 読み込み中、ページなし（目次へ戻る導線を出す）、取得失敗（再試行ボタン）
- `Esc` で閉じる。開いたときに検索欄へフォーカスしない（作業の邪魔をしない）
- `role="complementary"` と `aria-label` を付ける

### 9.2 `HelpButton`

- クリックで `toggle()`。`target` prop で開くページを固定できる
- `children` で中身を差し替えられる

### 9.3 スタイル

- 素のCSSファイル1枚。CSS-in-JSやTailwindに依存しない
- クラス名とCSS変数は接頭辞 `mhk-` を付ける
- 調整用の変数: `--mhk-width`、`--mhk-bg`、`--mhk-fg`、`--mhk-border`、`--mhk-accent`、`--mhk-font`、`--mhk-radius`、`--mhk-z-index`
- ライトとダーク: `prefers-color-scheme` に追従し、`data-mhk-theme="light|dark"` で固定もできる

### 9.4 文言

`labels` prop で差し替える。標準は英語、日本語は `jaLabels` を同梱する。

```tsx
import { jaLabels } from "md-help-kit/ui";
<HelpDrawer labels={jaLabels} />
```

### 9.5 本文スタイル

Markdownは構造だけを決め、見た目は決めない。`markdown-to-jsx` の出力は素のHTML要素なので、
本文の見た目はUI層のCSSで定義する。幅の狭いドロワー（標準360px）で読みやすいことを最優先にする。

本文は `.mhk-prose` クラスの中に描画し、スタイルはすべてこのクラスの配下に限定する（アプリ側のCSSと干渉させない）。

| 要素 | 仕様 |
|---|---|
| 基本 | 14px、行間1.7。日本語の禁則と折り返しを考慮し `overflow-wrap: anywhere` |
| 見出し | h1 は20px、h2 は16pxで下に細い罫線、h3 は14px太字、h4 は13px。上の余白を広く、下を狭く取り、まとまりを示す |
| 見出しの位置 | `scroll-margin-top` を付け、目次から飛んだときに固定ヘッダーに隠れないようにする |
| リンク | アクセント色。外部リンクには小さな矢印の印を付ける |
| リスト | 字下げは控えめ（1.4em）。入れ子は2段まで想定 |
| タスクリスト | 行頭の点を消し、チェックボックスを表示（操作不可） |
| 表 | 横スクロールできる枠で包む。13px、横罫線のみ、見出し行は背景色つきで折り返さない。列の左右中央寄せはmdの指定に従う |
| インラインコード | 等幅、0.9em、薄い背景と角丸 |
| コードブロック | 等幅、12.5px、薄い背景、横スクロール。言語名は表示しない |
| 引用 | 左に太さ3pxの罫線、文字色を一段薄く |
| 注意書き | 種別ごとの色で、薄い背景と細い枠線、角丸の箱にする。先頭にアイコンとラベルを置く |
| `kbd` | キーの形（枠線、下側をやや濃く）、等幅、0.85em |
| `details` | 枠線つき。`summary` は太字で、開閉の印を付ける |
| 画像 | 幅は最大100%、細い枠線と角丸 |
| 水平線 | 細い罫線、上下に広めの余白 |

実装上の注意:

- 表を枠で包むため、`overrides` で `table` を差し替える
- 注意書きの色は変数で調整できるようにする: `--mhk-alert-note`、`--mhk-alert-tip`、`--mhk-alert-important`、`--mhk-alert-warning`、`--mhk-alert-caution`
- 注意書きのラベル（「注意」「警告」など）は `labels` に含め、言語を切り替えられるようにする
- 色は意味を色だけに頼らない（アイコンとラベルを必ず併記する）
- 見た目の基準は `example/` に置く見本ページ（全要素を1ページに並べたmd）とし、変更時はこれで確認する

## 10. テスト

Vitest と Testing Library を使う。

- 単体: `parse-index`、`headings`、`slug`、`links`、`search`、`source-bundled` のID正規化、`source-remote` のURL組み立てとエラー変換
- 結合: 画面連動（マウント順と解除）、ページ間リンクの遷移、戻る、404時の表示、独自タグとコードブロックの差し替え
- 安全性: 許可していないタグ、`on*` 属性、`style` 属性、`javascript:` などのURLが、いずれも描画されないこと

## 11. 開発時の警告

`process.env.NODE_ENV !== "production"` のときだけ `console.warn` を出す。

- `useHelpPage` や `navigate` に、存在しないページIDが渡された
- 表示中のページに、存在しないページへのリンクがある
- 見出しIDが見つからない
- `_index.md` に解釈できない項目がある
- mdに、登録も許可もされていないタグがある

## 12. ディレクトリ構成

```
src/
  core/
    types.ts
    errors.ts
    markdown.ts         markdown-to-jsx の呼び出しを1か所に集約する
    parse-index.ts      _index.md → HelpIndexNode[]
    headings.ts         md → HelpHeading[]
    slug.ts             見出しIDの生成
    links.ts            リンクの分類と相対パス解決
    sanitize.ts         タグ、属性、URLの制限
    search.ts
    source-bundled.ts
    source-remote.ts
    store.ts            状態管理（useSyncExternalStore）
    provider.tsx
    hooks.ts
    content.tsx
    index.ts
  ui/
    drawer.tsx
    button.tsx
    toc.tsx
    search-box.tsx
    labels.ts
    styles.css          ドロワーの外枠と、本文スタイル（.mhk-prose）
    index.ts
  mermaid/
    mermaid-block.tsx
    index.ts
example/                Vite製のデモSPA（bundled と remote を切り替えられる）
```

`markdown-to-jsx` を直接 import してよいのは `core/markdown.ts` だけにする。
将来レンダラを差し替える場合の影響を、このファイルに閉じ込めるため。

## 13. 実装の順序

1. `markdown-to-jsx` の `llms.txt` を読む（14章）。続けて、プロジェクトの雛形（TypeScript、ビルド、Vitest、入口ごとの `exports`）
2. 純粋関数とそのテスト（`slug`、`parse-index`、`headings`、`links`、`search`）
3. `sanitize` とそのテスト
4. `bundled` と `remote`
5. `store`、`HelpProvider`、`useHelp`、`useHelpPage`
6. `HelpContent`（独自タグ、コードブロックの差し込み口を含む）
7. UI層（`HelpDrawer`、`HelpButton`、CSS、本文スタイルと見本ページ）
8. `md-help-kit/mermaid`
9. `example/` のデモアプリ
10. README

各段階でテストを通してから次へ進む。

## 14. `markdown-to-jsx` の使い方

2026年10月時点の公式ドキュメント（v9系）で確認済み。
実装の最初に、パッケージ同梱の `llms.txt`（入口、設定、解析結果の形をまとめた要約）を読み、下記と食い違いがあれば実装前に報告すること。

| やりたいこと | 使う機能 |
|---|---|
| 解析結果を取り出す（目次、見出し、検索） | `parser(markdown)`。描画には `astToJSX(ast)` を使い、解析を1回で済ませる |
| 見出しIDを日本語対応にする | `options.slugify` に自前の関数を渡す。重複時の連番は自動 |
| コードブロックを差し替える | `options.renderRule` で `RuleType.codeBlock` を判定。`node.lang` と `node.text` が取れる |
| 独自タグを割り当てる | `options.overrides` にコンポーネントを登録する |
| 標準の要素を差し替える（`a`、`table`、`img`） | `options.overrides` |
| 注意書きを判定する | 引用ブロックのノードの `alert` |
| 許可していないタグを文字にする | 標準機能はない。`renderRule` で `RuleType.htmlBlock` と `RuleType.htmlSelfClosing` の `node.tag` を見て判定する |

注意点:

- 解析結果の先頭には、参照定義をまとめたノード（`RuleType.refCollection`）が入る。見出しや本文の抽出では読み飛ばす
- 独自タグは、開始タグと終了タグの間に空行があっても中身がmdとして解釈される（大文字始まりのタグの場合）
- このライブラリは有志による開発で、保守の中心は作者1人。直接 import するのは `core/markdown.ts` だけに限定し、差し替えの余地を残す（12章）

## 15. 次の版の候補

- アプリを操作する部品の標準化（`OpenScreen` など。画面遷移の方法はアプリごとに違うため、受け口の設計が必要）
- コードブロックのコピーボタン、画像の拡大表示
- MDXページの受け入れ（ページをReactコンポーネントとしても登録できるようにする）
- 検索の索引化と、目次と索引を生成するCLI
- bundled での相対パス画像
- コードの色付け部品の同梱（任意のpeer依存として）

## 16. 未確定事項

- パッケージ名
- 外部配置時のmdの置き場所（同一サーバーの静的フォルダか、別サーバーか）

ビルドツール、改行コード、コメントの言語は決定済み（`CLAUDE.md` の「規約」を参照）。
