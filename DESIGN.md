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

- リンクのある項目はページ。リンク文字列がタイトルになる（リンクの外の文字は無視する。記法は除く）
- リンクのない項目はグループ見出し
- リスト以外の要素（見出し、段落）は無視する。リストが複数あれば、出てくる順につなげる。番号付きリストも同じに扱う
- リンク先は docs ルートからの相対パスで解決し、`%xx` をデコードしてページIDにする（`./` や、先頭の `/` も書ける）
- 次の項目は解釈できない項目として、その下に入れ子になった項目ごと無視する（開発時は警告を出す。11章）
  - 中身が空、またはリンクの文字が空
  - リンクが2つ以上ある
  - `.md` 以外へのリンク、外部へのリンク、docsルートの外を指すリンク、`#` 付きのリンク
- 目次に載っていないページも、リンクや `useHelpPage` からは開ける（目次と検索には出ない）
- 目次にないページのタイトルは、本文の最初の `#` 見出し、なければページID

### 3.2 ページID

docsルートからの相対パスから拡張子 `.md` を除いたもの。区切りは常に `/`。

- `orders.md` → `orders`
- `stock/colors.md` → `stock/colors`

見出しまで指す場合は `orders#一括更新` と書く（これを「ターゲット」と呼ぶ）。

### 3.3 見出しID

見出しの文字列から、次の規則で生成する（自前実装。GitHubの挙動に近づける）。

1. 前後の空白を除き、小文字にする（英字以外の大文字も対象。全角英字など）
2. 文字（各国語、結合文字を含む）、数字（`①` なども含む）、`-`、`_`、空白以外を取り除く
3. 空白（全角を含む）を1文字ずつ `-` に置き換える（連続しても詰めない）
4. 同じページ内で重複したら `-1`、`-2` と連番を付ける

日本語はそのまま残る（例: `## 一括更新` → `一括更新`）。
残る文字がない見出し（例: `## !!!`）は空のIDになる。

1〜3 を `slug.ts` に実装し、`markdown-to-jsx` の `options.slugify` に渡す。
4 の連番はライブラリが自動で行うので、自前では実装しない。
見出しの一覧は、`parser()` が返す見出しノードの `id` をそのまま使う（描画結果と必ず一致させるため）。

見出しの一覧（5.3節の `headings`）には、本文直下の見出し（h1〜h6）だけを含める。
引用、リスト、独自タグの中の見出しは含めない（IDは付くので、リンクで飛ぶことはできる）。

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

エラーは `errors.ts` に置き、利用者が自作する取得元からも投げられるよう公開する。文言は英語（11章）。

| クラス | 持つ情報 |
|---|---|
| `HelpNotFoundError` | `pageId`（目次のときは `_index`） |
| `HelpLoadError` | `pageId`、`status`（HTTPのステータス。HTTPの応答がなければ undefined）、`cause`（元のエラー） |

ページIDに空、`.`、`..` のセグメントがあるとき（`../secret` など）は、取得せずに `HelpNotFoundError` を投げる（docs の外を読ませないため）。

### 4.1 `bundled(modules)`：ビルドに含める

```ts
const source = bundled(
  import.meta.glob("./docs/**/*.md", { query: "?raw", import: "default" })
);
```

- 引数は `Record<string, string | (() => Promise<string>)>`（即時読み込み、遅延読み込みの両方を受ける）
  - 型は、これと同じ意味のジェネリクス（`<T extends string | (() => Promise<string>)>(modules: Record<string, T>)`）にする。この型をそのまま書くと、`import.meta.glob` の型がこの型から推論され、上の例が型エラーになるため
- キーの共通の接頭辞と `.md` を取り除いてページIDにする。接頭辞はディレクトリ単位で求める（`order.md` と `orders.md` から `./docs/order` にしない）
- `.md` で終わらないキーは無視する（開発時は警告）
- 遅延読み込みが失敗したとき、文字列以外が返ったとき（`query: "?raw"` や `import: "default"` の付け忘れ）は `HelpLoadError`
- 画像は v0.1 では絶対URLと `public/` 配下のパスのみ対応（制限事項としてREADMEに書く）。`resolveAsset` は持たない

### 4.2 `remote(baseUrl, options?)`：外部に置く

```ts
const source = remote("/help");
const source2 = remote("https://files.example.co.jp/app-help", {
  fetchInit: { credentials: "include" },
});
```

- `loadIndex` は `${baseUrl}/_index.md`、`loadPage(id)` は `${baseUrl}/${id}.md` を取得する（`baseUrl` の末尾の `/` は取り除く）
- パスの各セグメントは `encodeURIComponent` する
- `fetch` は標準で `cache: "no-cache"`（毎回サーバーに更新確認。差し替えが即反映される）
- `options.fetchInit` で `fetch` の設定を上書きできる（認証付き、別オリジンなど）。標準の設定に重ねて上書きする（`headers` などは丸ごと置き換わる）
- 404 は `HelpNotFoundError`、それ以外の失敗（ネットワークの失敗、404 以外のエラー状態、本文の読み込みの失敗）は `HelpLoadError`
- 200 でも `Content-Type` が `text/html` のときは `HelpNotFoundError`（開発時は警告）。SPAのサーバーは、存在しないパスにもアプリのHTMLを返すことがあるため
- 相対パスの画像は、ページのURLを基準に解決する（`resolveAsset` を実装）
  - `/` で始まるパスは、ページのURLのサーバーのルートから（URLの標準どおり。bundled の `public/` 配下のパスと同じ意味になる）
  - 絶対URL（スキーム付き、`//` 始まり）はそのまま返す
  - `baseUrl` が相対（`/help` など）なら、結果も相対のまま返す（表示中の文書を基準に解決させるため）
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
| `source` | `HelpSource` | 必須。変わったらキャッシュと履歴を捨て、目次と表示中のページを取得し直す（画面の宣言と開閉は引き継ぐ）。レンダーのたびに作り直さないこと |
| `defaultPage` | `string` | 画面に紐付くページがないときに開くページ。省略時は目次の先頭（深さ優先でたどった最初のページ） |
| `indexLoading` | `"mount" \| "open"` | 目次を取得する時期。`"mount"`（既定）は HelpProvider のマウント時、`"open"` は最初に `open`、`toggle`、`navigate`、`search` のいずれかを使ったとき。マウント後の変更は反映しない |
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
  - 同時にマウントされた親子では、子の宣言を優先する。React の effect は子から実行されるため、マウントの順ではなくレンダーの順で判定する（兄弟では後にあるものが優先）
  - 宣言中にターゲットが変わっても、スタック上の位置は変えない
- ドロワーが開いている間に画面のページが変わったら、表示も追従する（直前のページは履歴に積む）。画面のターゲットが null になったときは、表示を変えない
- `useHelp` と `useHelpPage` を HelpProvider の外で使ったら、エラーを投げる

### 5.3 `useHelp()`

```ts
interface HelpApi {
  isOpen: boolean;
  open(target?: string): void;   // 省略時は画面のページ → defaultPage の順
  close(): void;
  toggle(): void;

  index: HelpIndexNode[];        // 目次ツリー
  indexStatus: "idle" | "loading" | "ready" | "error";  // idle はまだ取得を始めていない（indexLoading: "open"）

  current: {
    id: string;
    title: string;
    markdown: string;
    headings: HelpHeading[];     // { depth, text, id }
    headingId: string | null;    // ターゲットが見出しまで指しているときの見出しID
    status: "loading" | "ready" | "not-found" | "error";
  } | null;

  screenTarget: string | null;   // 画面が宣言しているターゲット
  navigate(target: string): void;
  back(): void;
  canGoBack: boolean;
  reload(): void;                // キャッシュを捨て、目次と現在のページを取得し直す

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
  - `reload()` は、ページと検索用の前処理のキャッシュをすべて捨て、目次と現在のページを取得し直す（目次の取得失敗の再試行にも使う）
- 履歴（`back`）はドロワー内だけの簡易スタック。ブラウザの履歴には触れない
  - 別のページに移るとき（`navigate`、画面への追従、`open`）は、直前のページを積む。閉じても履歴は残す
  - 同じページ内の見出しへの移動は、取得し直さず（スクロールだけ）、履歴にも積まない
- `open()` で開くページは、引数、画面のページ、`defaultPage`、目次の先頭の順に選ぶ。目次の先頭に決まったときに目次がまだなければ、取得を待って開く。どれも決まらないときは `current` を変えない（一度も開いていなければ null）
- `navigate("#見出し")` のようにページIDが空のターゲットは、現在のページの見出しとして扱う

### 5.4 `HelpContent`

現在のページを描画する、スタイルなしのコンポーネント。

```tsx
<HelpContent className="..." overrides={{ a: MyLink }} />
```

- `markdown-to-jsx` で描画する（表、タスクリスト、取り消し線に対応）
- `current.status` が `ready` のときだけ、`<div className={className}>` の中に描画する。それ以外（取得中、ページなし、取得失敗、何も開いていない）は何も描画しない（状態ごとの表示はドロワーが担当する。9.1節）
- 見出しに 3.3 のIDを付ける
- リンクは 5.5 の規則で処理する
- 画像は `source.resolveAsset` で解決する
  - 対象は、mdの画像と、許可した `<img>` の `src`。スキームがなく `//` で始まらないものを渡す
  - 解決後のURLは検査し直さない（取得元は利用者のコードで、信頼できるため）
- 独自タグとコードブロックは 6章、HTMLタグの制限は 7章に従う
- `overrides` で標準の要素（`a`、`table` など）を差し替えられる
  - 名前が小文字のものだけが有効（大文字始まりは無視し、開発時は警告。独自タグは `components` で登録する）
  - `a` と `img` を差し替えても、リンクの扱いと画像の解決はこちらで行い、その結果（`href`、`target`、`rel`、`onClick`、解決済みの `src`）を props で渡す
- スクロール: ページが変わったときと、移動したとき（同じ見出しへの移動を含む）に、`headingId` があればその見出しを、なければ本文の先頭を `scrollIntoView({ block: "start" })` で表示する
- HelpProvider の外で使ったら、エラーを投げる

### 5.5 リンクの解決規則

| リンク先 | 動作 |
|---|---|
| `./stock.md`、`stock/colors.md#赤`、`/orders.md` | ドロワー内でページ遷移（相対パスは現在のページから、`/` で始まるパスは docs ルートから解決） |
| `#一括更新` | 同じページ内の見出しへスクロール |
| `http://`、`https://`、`mailto:` | 新しいタブで開く（`rel="noreferrer noopener"`） |
| その他 | 何もせず通常のリンクとして描画 |

- パスと `#` の後ろの `%xx` はデコードする
- ページへのリンクの `href` は、mdに書いたパスのままにする。クリックは、修飾キー（Ctrl など）を押していてもドロワー内の移動にする（mdのパスは、アプリのURLとしては開けないため）
- `#見出し` のリンクは `navigate("#見出し")` にする（履歴に積まず、スクロールだけ）
- 次のものは「その他」とする: docs ルートより上を指すパス、`//` で始まるもの、http、https、mailto 以外のスキーム、`.md` 以外への相対パス（拡張子は小文字の `.md` のみ）

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
  - 配列とオブジェクトはJSONとして解析される。オブジェクトのキーは `"` で囲む（`{{"a": 1}}`）。`{{a: 1}}` と書くと文字列のまま渡る
  - 数値は解析されず、文字列として渡る（`n={3}` は `"3"`）
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
  - 言語名のないコードブロック（字下げのコードを含む）にも適用する。そのときの `lang` は空文字
- 言語名の大文字小文字は区別しない（` ```Mermaid ` も `codeBlocks.mermaid`）
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
  - 種別は大文字に揃えて付く（`[!warning]` も `WARNING`）。`[!XXX]` の行は本文から取り除かれる
  - ライブラリは5種類に限らず、任意の `[!XXX]` に種別を付ける。5種類への絞り込みはこのパッケージで行う
  - 5種類以外は普通の引用にし、取り除かれた `[!XXX]` を最初の段落として文字で残す（GitHub と同じ見た目。大文字で表示する）
- コア層は種別を `data-mhk-alert` 属性（小文字。`data-mhk-alert="warning"`）として出すだけ。見た目はUI層のCSSが担当する（9.5）
  - ラベルとアイコンはコア層では付けない。UI層が `HelpContent` の `overrides.blockquote` で付ける（`data-mhk-alert` が props で渡る）

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
  - `allowedTags` は小文字にそろえて照合する。大文字始まりのタグは独自タグとして扱い、HTMLタグの許可リストとは照合しない（`<KBD>` は文字になる）
  - 次のタグは、`allowedTags` に追加しても許可しない（開発時は警告）
    - 実行、埋め込み: `script`、`noscript`、`iframe`、`frame`、`frameset`、`object`、`embed`、`applet`、`template`
    - ページ全体に影響する: `style`、`link`、`meta`、`base`、`title`
    - 入力欄: `form`、`input`、`button`、`select`、`option`、`textarea`
    - GFM の tagfilter の対象: `xmp`、`plaintext`、`noembed`、`noframes`
- **独自タグ**: `components` に登録したものだけ。名前が大文字始まりのものだけが有効（小文字始まりの名前は無視し、開発時は警告）
- **それ以外のタグ**: 描画せず、文字として表示する。HTMLブロックと自己終了タグのノードについて、タグ名を見て判定する
  - 表示は `<タグ名>`、中身（mdとして描画）、`</タグ名>` の順。中身がなければ `<タグ名 />`。属性は表示しない（元の書き方を正確に復元できないため）
  - 閉じタグだけが単独で書かれた場合も `<タグ名 />` になる（ライブラリの解析結果から区別できないため）
- **属性**: 許可したHTMLタグの `style` は捨てる。mdの表が列の寄せのために `th`、`td` に付ける `style` は対象外（9.5の寄せ指定を保つため）。独自タグの `style` は捨てない
- **URL**: リンクと画像のURLは、`http:`、`https:`、`mailto:`、相対パスのみ許可する（`data:` も不可）。ライブラリの `sanitizer` オプションは指定しない（指定すると標準の保護がまるごと置き換わるため。許可リストは `renderRule` で上乗せする）
  - 相対パスは、スキームがなく、`//` や `\\` で始まらないもの。判定の前に、ブラウザと同じく前後の空白と制御文字、途中のタブと改行を取り除く
  - 対象は、mdのリンクと画像に加えて、許可したHTMLタグと独自タグのURL属性（`href`、`src`、`srcset`、`action`、`formaction`、`poster`、`cite`、`background`、`longdesc`、`ping`、`xlink:href`）
  - 許可しないURLのリンクは、リンクにせず文字だけを表示する。画像は描画せず、代替テキストを文字で表示する。タグの属性は取り除く
- **HTMLの直接の書き込み**: ライブラリが中身をHTMLとして直接書き込む場合（`<pre>` など）も、HTMLとして解釈させず、文字として表示する
- **禁止する設定**: `tagfilter: false` と `evalUnserializableExpressions: true` は、利用者が指定できないようにする（それぞれ効く側で固定する。14章）

これらの制限は `HelpContent` の中で必ず適用し、利用者が誤って外せないようにする。
テストでは、上記の各項目について「通らないこと」を確認する（10章）。

## 8. 検索（v0.1）

- 初回の検索時に、目次に載っている全ページを取得する（以後はキャッシュ）
  - 並行して取得する。取得に失敗したページは結果から除き、次の検索で取得し直す
  - 目次が取得できていなければ、そのエラーで reject する
- 検索語と本文の両方を NFKC 正規化し、小文字化してから部分一致で探す（全角と半角の違いを吸収）
  - 半角カナの濁点なども1文字として照合する（`ｶﾞ` と `ガ`）
- 空白区切りの複数語は AND 条件。1つの見出し区間（見出しの文字とその本文）にすべての語があるときに一致とする
- 本文は解析結果から文字だけを取り出して照合する（md記法やタグは対象外）
  - コードブロック、画像の代替テキスト、リンク先のURL、タグの属性も対象外
  - インラインコード、リンクの文字、表、注意書き、タグの中の文字は対象
- 結果は「ページ × 見出し区間」単位で返す。タイトル一致、見出し一致、本文一致の順に並べる
  - 見出し区間は、本文直下の見出し（h1〜h6）で区切る。最初の見出しより前の本文は、`headingId` が null の区間
  - タイトル一致: ページのタイトルにすべての語がある。ページごとに1件（`headingId` は null）
  - 見出し一致: 見出しの文字にすべての語がある区間
  - 本文一致: 見出しと本文を合わせて、すべての語がある区間
  - 同じ区間は1回だけ返す（上位の種類を優先）。同じ種類の中は、目次の順、ページ内の順に並べる
- 抜粋（`snippet`）は、本文で最も手前にある一致箇所の前20字、後ろ40字を切り出し、切った側に「…」を付ける
  - 本文に一致がないとき（タイトル一致、見出しだけの一致）は、本文の先頭60字
- 空の検索語は結果なし。件数の上限は設けない

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
文言は英語で、先頭に `[md-help-kit]` を付ける（エラーの文言も英語）。
`process` がない環境（利用者のバンドラが `process.env.NODE_ENV` を置き換えない場合）では出さない。

- `useHelpPage` や `navigate` に、存在しないページIDが渡された（ページの取得が HelpNotFoundError になったときに出す。宣言だけでは取得しない）
- ページを開いていないときに、ページIDのないターゲット（`#見出し`）で移動しようとした
- 表示中のページに、存在しないページへのリンクがある（開発時だけ、ページを表示したときにリンク先を取得して確かめる。取得したページはキャッシュに入る）
- 表示中のページに、存在しない見出しへの `#` のリンクがある
- 見出しIDが見つからない（移動先の見出しが、描画した本文にない）
- 目次に載っているページが存在しない（検索のために取得したとき）
- `HelpContent` の `overrides` に、大文字始まりの名前がある
- `_index.md` に解釈できない項目がある
- mdに、登録も許可もされていないタグがある（同じタグ名につき1回だけ）
- `allowedTags` に、常に禁止するタグがある（7章）
- `components` に、小文字始まりの名前がある（7章）
- `bundled` に、`.md` で終わらないキーがある（4.1節）
- `remote` で、mdの代わりにHTMLが返ってきた（4.2節）

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
    warn.ts             開発時の警告（11章）
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
同じ理由で、解析結果（AST）も `core/markdown.ts` の中でこのパッケージ用の簡易構造（見出し、リスト、リンク、文字）に変換してから渡し、ライブラリの型を外へ出さない。

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
v9.10.3 の同梱 `llms.txt` と、実際の動作でも確認した（13章の手順1）。
実装の最初に、パッケージ同梱の `llms.txt`（入口、設定、解析結果の形をまとめた要約）を読み、下記と食い違いがあれば実装前に報告すること。

| やりたいこと | 使う機能 |
|---|---|
| 解析結果を取り出す（目次、見出し、検索） | `parser(markdown, options)`。描画には `astToJSX(ast, options)` を使い、解析を1回で済ませる |
| 見出しIDを日本語対応にする | `parser()` の `options.slugify` に自前の関数を渡す（`astToJSX()` に渡しても効かない）。重複時の連番は自動 |
| コードブロックを差し替える | `options.renderRule` で `RuleType.codeBlock` を判定。`node.lang` と `node.text` が取れる |
| 独自タグを割り当てる | `options.overrides` にコンポーネントを登録する |
| 標準の要素を差し替える（`a`、`table`、`img`） | `options.overrides` |
| 注意書きを判定する | 引用ブロックのノードの `alert` |
| 許可していないタグを文字にする | 標準機能はない。`renderRule` で `RuleType.htmlBlock` と `RuleType.htmlSelfClosing` の `node.tag` を見て判定する |

注意点:

- 参照定義か脚注があるときは、解析結果の先頭に、それらをまとめたノード（`RuleType.refCollection`）が入る（ないときは入らない）。見出しや本文の抽出では読み飛ばす
- 設定は、`parser()` と `astToJSX()` のどちらで効くかが分かれる。`slugify` と `evalUnserializableExpressions` は `parser()` で、`tagfilter`、`overrides`、`renderRule` は `astToJSX()` で効く。安全性の設定（7章）は、それぞれ効く側で固定する（`astToJSX()` に `tagfilter: false` を渡すと、`<script>` が実際のタグとして描画される）
- `sanitizer` オプションを指定すると、URLに対する標準の保護（`javascript:` などの除去）がまるごと置き換わる。このパッケージでは指定しない（7章）
- mdの表は、列の寄せを `th`、`td` の `style`（`text-align`）で出力する
- 注意書きの引用ブロックは、標準の描画では英語の種別名を入れた `<header>` と、`markdown-alert-*` クラスが付く。6.3の描画にするため、`renderRule` で引用ブロックの描画を差し替える
- 独自タグは、開始タグと終了タグの間に空行があっても中身がmdとして解釈される（大文字始まりのタグの場合）
- 中身を解析しないHTMLブロック（`<pre>` など）は、子ノードが空で、中身は非推奨の `text` にだけ入る。描画では、ライブラリが中身を `dangerouslySetInnerHTML` で書き込むことがあるため、`createElement` オプションで横取りして文字にする（7章）
- HTMLブロックは、描画時にライブラリが解析し直すことがある。そのとき作られたノードにも `renderRule` は呼ばれるので、属性の制限は描画時に行う
- 項目の先頭の `[ ]` と `[x]` は、タスクリストのチェックボックスとして解釈される（`- [x](a.md)` はリンクにならない）
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
