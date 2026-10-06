# md-help-kit

[English](./README.md) | 日本語

React アプリにアプリ内ヘルプを組み込むためのパッケージです。ヘルプは普通の Markdown で書きます。
`.md` ファイルをフォルダに置くだけで、ヘルプのドロワー、目次、表示中の画面に合わせたヘルプ、ページ間のリンク、検索がそろいます。

- **Markdown だけで完結**: 目次も Markdown で書きます。CLI や専用のビルド工程は要りません。
- **ビルドに含めても、外部に置いても**: md をアプリのビルドに含めることも、静的なフォルダに置いてアプリを再リリースせずに更新することもできます。どちらでも同じように動きます。
- **依存は1つだけ**: [`markdown-to-jsx`](https://github.com/quantizor/markdown-to-jsx) だけです。図、コードの色付け、数式などの重い機能は、差し込み口から利用者が追加します。
- **UIなしのコアと、任意のUI**: 完成品のドロワーを使うことも、フックを使って独自のUIを作ることもできます。

## 目次

- [動作環境](#動作環境)
- [インストール](#インストール)
- [使い始める](#使い始める)
- [ヘルプの書き方](#ヘルプの書き方)
- [取得元](#取得元)
- [コアのAPI](#コアのapi)
- [UI](#ui)
- [リッチな表現](#リッチな表現)
- [検索](#検索)
- [安全性](#安全性)
- [開発時の警告](#開発時の警告)
- [注意点と制限](#注意点と制限)
- [デモアプリ](#デモアプリ)
- [開発](#開発)

## 動作環境

- React 18 以上（`react` と `react-dom`）
- ES モジュールを扱えるバンドラ。配布形式は ESM のみです
- `md-help-kit/mermaid` を使う場合のみ: `mermaid` 11 または 12

## インストール

```sh
npm install md-help-kit
# Mermaid の図を使う場合のみ
npm install mermaid
```

## 使い始める

ヘルプのページをフォルダに置きます。

```
src/help/docs/
  _index.md        目次（必須）
  orders.md
  stock.md
  stock/colors.md
```

取得元は、コンポーネントの外で1回だけ作ります（レンダーのたびに作り直すと、キャッシュが捨てられます）。

```ts
// src/help/source.ts
import { bundled } from "md-help-kit";

export const helpSource = bundled(
  import.meta.glob("./docs/**/*.md", { query: "?raw", import: "default" }),
);
```

アプリを `HelpProvider` で包み、ドロワーとボタンを置きます。

```tsx
// src/App.tsx
import { HelpProvider } from "md-help-kit";
import { HelpButton, HelpDrawer } from "md-help-kit/ui";
import "md-help-kit/ui/styles.css";
import { helpSource } from "./help/source";

export function App() {
  return (
    <HelpProvider source={helpSource}>
      <header>
        <HelpButton />
      </header>
      <Routes />
      <HelpDrawer />
    </HelpProvider>
  );
}
```

画面ごとに、どのページがその画面のヘルプかを宣言します。

```tsx
import { useHelpPage } from "md-help-kit";

function OrdersScreen() {
  useHelpPage("orders");
  // ...
}
```

これで、ボタンを押すと `orders.md` を表示したドロワーが開きます。ドロワーを開いたまま別の画面に移ると、ドロワーの表示も移ります。

## ヘルプの書き方

### `_index.md`（目次）

目次は、リンクを入れ子にしたリストで書きます。
ページの一覧、並び順、階層、タイトルをここで決めます。

```md
- [受注一覧](orders.md)
- [在庫照会](stock.md)
  - [在庫数の色について](stock/colors.md)
- 管理者向け
  - [設定](settings.md)
```

- リンクのある項目はページです。リンクの文字がページのタイトルになります。
- リンクのない項目はグループの見出しです。
- リスト以外（見出し、段落）は無視します。リストが複数あれば、出てくる順につなげます。番号付きリストも同じに扱います。
- リンク先は docs のルートからの相対パスです（`./orders.md` や `/orders.md` とも書けます）。
- 次の項目は、その下に入れ子になった項目ごと無視します（開発時は警告が出ます）。
  - 中身が空の項目、リンクの文字が空の項目
  - リンクが2つ以上ある項目
  - `.md` 以外へのリンク、外部へのリンク、docs のルートの外を指すリンク、`#` の付いたリンク
- 目次に載っていないページも、リンクや `useHelpPage` からは開けます。目次と検索には出ません。タイトルは本文の最初の `#` 見出し、なければページIDです。

### ページIDとターゲット

ページIDは、docs のルートからのパスから `.md` を除いたものです。区切りは常に `/` です。

- `orders.md` → `orders`
- `stock/colors.md` → `stock/colors`

見出しまで指すこともできます（`orders#一括更新`）。これを **ターゲット** と呼びます。

### 見出しID

見出しには、GitHub に近い規則でIDが付きます。

1. 前後の空白を除き、小文字にします
2. 文字（各国語）、結合文字、数字、`-`、`_`、空白以外を取り除きます
3. 空白を1文字ずつ `-` に置き換えます（連続しても詰めません）
4. 同じページの中で重複したら、`-1`、`-2` と連番を付けます

日本語はそのまま残ります。たとえば `## 一括更新` は `一括更新`、`## Bulk update` は `bulk-update` になります。

### リンク

| リンク先 | 動作 |
|---|---|
| `./stock.md`、`stock/colors.md#赤`、`/orders.md` | ドロワーの中でそのページを開きます。相対パスは表示中のページから、`/` で始まるパスは docs のルートから解決します |
| `#一括更新` | 同じページの見出しへスクロールします |
| `http://`、`https://`、`mailto:` | 新しいタブで開きます（`rel="noreferrer noopener"`） |
| その他 | 特別な扱いをせず、通常のリンクとして表示します |

- パスと `#` の後ろの `%xx` はデコードします。
- ページへのリンクの `href` は、md に書いたパスのままです。クリックすると、Ctrl などの修飾キーを押していても、常にドロワーの中で移動します（md のパスは、アプリのURLとしては開けないためです）。
- 「その他」には、docs のルートより上を指すパス、`//` で始まるURL、ほかのスキーム、`.md` 以外のファイルへの相対リンクが含まれます。拡張子は小文字の `.md` だけを見ます。

### 画像

- `remote`: 画像の相対パスは、ページのURLを基準に解決します。
- `bundled`: 絶対URLと、アプリの `public/` 配下のパス（`/help/img/filter.png` など）だけが使えます。相対パスにはまだ対応していません。

## 取得元

取得元は、Markdown をどこから読み込むかを `HelpProvider` に伝えるものです。
目次の解析、見出し、リンク、検索は、どの取得元でも同じように動きます。

### `bundled(modules)`: ビルドに含める

```ts
const source = bundled(
  import.meta.glob("./docs/**/*.md", { query: "?raw", import: "default" }),
);
```

- 引数は `Record<string, string | (() => Promise<string>)>` です。即時読み込みにも、遅延読み込みにも対応します。
- キーから、共通のディレクトリの接頭辞と `.md` を取り除いたものがページIDになります。`.md` で終わらないキーは無視します（開発時は警告が出ます）。
- 遅延読み込みに失敗したときや、モジュールが文字列を返さなかったときは、`HelpLoadError` で失敗します。文字列が返らない原因は、たいてい `query: "?raw"` か `import: "default"` の付け忘れです。
- `import.meta.glob` は Vite の機能です。ほかのバンドラでは、同じ形のオブジェクトを自分で作って渡してください。

### `remote(baseUrl, options?)`: HTTP で読み込む

```ts
const source = remote("/help");
const source2 = remote("https://files.example.com/app-help", {
  fetchInit: { credentials: "include" },
});
```

- `${baseUrl}/_index.md` と `${baseUrl}/${id}.md` を読み込みます。パスの各セグメントはエンコードします。
- `fetch` は `cache: "no-cache"` で呼びます。ファイルを差し替えると、次の読み込みから反映されます。
- `options.fetchInit` は標準の設定に重ねて上書きします。`headers` などの入れ子のオブジェクトは、まとめて置き換わります。
- エラー:
  - 404 の応答は `HelpNotFoundError` になります。`Content-Type: text/html` の `200` の応答も同じです。SPA のサーバーの多くは、存在しないパスにアプリの HTML を返すためです（開発時は警告が出ます）。
  - それ以外の失敗は `HelpLoadError` になります。
- 画像の相対パスは、ページのURLを基準に解決します。`baseUrl` が相対なら、結果も相対のままです。
- 別のオリジンに置く場合は、置いた側のサーバーで CORS を設定してください。

### 独自の取得元

`HelpSource` を実装すれば、自前の API など、どこからでも読み込めます。

```ts
import { HelpLoadError, HelpNotFoundError, type HelpSource } from "md-help-kit";

async function load(id: string): Promise<string> {
  // ID は useHelpPage、navigate、リンクから渡される。docs のルートの外を指す ID は断る
  const segments = id.split("/");
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new HelpNotFoundError(id);
  }
  const response = await fetch(`/api/manuals/${segments.map(encodeURIComponent).join("/")}`);
  if (response.status === 404) throw new HelpNotFoundError(id);
  if (!response.ok) throw new HelpLoadError(id, { status: response.status });
  return response.text();
}

export const source: HelpSource = {
  loadIndex: () => load("_index"),
  loadPage: load,
  // 任意: 画像の相対パスを、表示用のURLに解決する
  resolveAsset: (pageId, path) => new URL(path, `${location.origin}/api/manuals/${pageId}`).href,
};
```

| メンバー | 説明 |
|---|---|
| `loadIndex()` | `_index.md` の中身を返します |
| `loadPage(id)` | ページの Markdown を返します。存在しなければ `HelpNotFoundError` を投げてください |
| `resolveAsset?(pageId, path)` | ページの中の相対パス（画像）を、表示用のURLにします。結果は検査し直しません |

`HelpNotFoundError` は `pageId` を持ちます（目次のときは `_index`）。
`HelpLoadError` は `pageId` と `status` を持ちます。`status` は HTTP のステータスで、HTTP の応答がないときは `undefined` です。どちらも標準の `cause` オプションを受け取ります。

## コアのAPI

`md-help-kit` は、スタイルを持たないコアです。

### `HelpProvider`

```tsx
<HelpProvider
  source={source}
  defaultPage="orders"
  components={components}
  codeBlocks={codeBlocks}
>
  <App />
</HelpProvider>
```

| prop | 型 | 説明 |
|---|---|---|
| `source` | `HelpSource` | 必須。変わると、キャッシュと履歴を捨てて、目次と表示中のページを読み込み直します。画面の宣言と開閉の状態は引き継ぎます。レンダーの中で作らないでください |
| `defaultPage` | `string` | 表示中の画面にページがないときに開くページ。省略時は目次の先頭のページです |
| `indexLoading` | `"mount" \| "open"` | 目次を読み込む時期。`"mount"`（既定）は HelpProvider のマウント時、`"open"` は最初に `open`、`toggle`、`navigate`、`search` のいずれかを使ったときです。マウント後の変更は反映しません |
| `components` | `Record<string, ComponentType<any>>` | Markdown の中で使える独自タグ（[独自タグ](#独自タグ)） |
| `codeBlocks` | `Record<string, ComponentType<HelpCodeBlockProps>>` | 言語名ごとのコードブロックの描画（[コードブロック](#コードブロック)） |
| `allowedTags` | `string[]` | Markdown の中で使える HTML タグの追加（[安全性](#安全性)） |

`components` と `codeBlocks` は、コンポーネントの外で定義するか、メモ化してください。レンダーのたびに本文を組み立て直さないためです。

### `useHelpPage(target)`

「この画面のヘルプはこのページ」と宣言します。

```tsx
useHelpPage("orders");
useHelpPage("orders#一括更新");
useHelpPage(isAdmin ? "settings" : null); // null は宣言なし
```

- マウント時に登録し、アンマウント時に解除します。
- 複数のコンポーネントが宣言したときは、最後にマウントしたものが有効です。宣言はスタックで管理するので、解除すると1つ前の宣言に戻ります。
  - 同時にマウントしたコンポーネントでは、レンダーの順で決まります。親より子が、前の兄弟より後の兄弟が優先です。
  - 宣言中にターゲットを変えても、スタック上の位置は変わりません。
  - これを使うと、ダイアログを開いている間だけ、ヘルプをダイアログの説明に向けられます。
- ドロワーが開いている間に画面のページが変わると、ドロワーの表示も移ります（直前のページは履歴に積みます）。画面のターゲットが `null` になったときは、表示を変えません。

### `useHelp()`

ヘルプの状態と操作（`HelpApi`）を返します。

| メンバー | 説明 |
|---|---|
| `isOpen` | ドロワーが開いているか |
| `open(target?)` | ドロワーを開きます。ターゲットを省略したときは、画面のページ、`defaultPage`、目次の先頭のページの順に選びます |
| `close()`、`toggle()` | ドロワーを閉じます。または開閉を切り替えます |
| `index` | 目次のツリー（`HelpIndexNode[]`）。下記を参照 |
| `indexStatus` | `"idle"`、`"loading"`、`"ready"`、`"error"` のいずれか。`idle` は、まだ読み込みを始めていない状態です（`indexLoading: "open"` のとき） |
| `current` | 表示中のページ。まだ何も開いていないときは `null`。下記を参照 |
| `screenTarget` | 表示中の画面が宣言しているターゲット |
| `navigate(target)` | ターゲットへ移動します。`"#見出し"` は表示中のページの見出しです |
| `back()`、`canGoBack` | ドロワーの中だけの履歴で戻ります。ブラウザの履歴には触れません |
| `reload()` | キャッシュをすべて捨て、目次と表示中のページを読み込み直します。失敗したときの再試行にも使います |
| `search(query)` | `Promise<HelpSearchHit[]>` を返します（[検索](#検索)） |

- `index` の項目の型は `HelpIndexNode` です。
  - `{ type: "page", id, title, children }`
  - `{ type: "group", title, children }`
- `current` の型は `HelpCurrentPage` です。
  - `{ id, title, markdown, headings, headingId, status }`
  - `status` は `"loading"`、`"ready"`、`"not-found"`、`"error"` のいずれかです。
  - `headings` は本文直下の見出しの一覧です（`{ depth, text, id }`）。
- 読み込んだページはメモリにキャッシュします。
- 同じページの見出しへの移動は、スクロールするだけで、履歴には積みません。
- `useHelp`、`useHelpPage`、`HelpContent` を `HelpProvider` の外で使うと、エラーを投げます。

### `HelpContent`

表示中のページを、スタイルなしで描画します。

```tsx
<HelpContent className="my-prose" overrides={{ table: MyTable }} />
```

- `current.status` が `"ready"` のときだけ、`<div className={className}>` の中に描画します。それ以外の状態では何も描画しないので、読み込み中やエラーの表示は自由に作れます。
- 見出しにはIDが付き、リンクは[リンク](#リンク)の規則で処理し、画像は `source.resolveAsset` で解決します。
- `overrides` で標準の要素（`a`、`table`、`img`、`blockquote` など）を差し替えられます。
  - 名前が小文字のものだけが有効です。独自タグは `components` に登録してください。
  - `a` や `img` を差し替えても、リンクの扱いと画像の解決はこちらで行い、その結果（`href`、`target`、`rel`、`onClick`、解決済みの `src`）を props で渡します。
- ページが変わったときと、移動するたびに、ターゲットの見出し（なければページの先頭）を `scrollIntoView({ block: "start" })` で表示します。

`useHelp` と `HelpContent` を使えば、まったく独自のヘルプのUIを作れます。`md-help-kit/ui` も、コアの公開APIだけを使ってこの方法で作っています。

## UI

```tsx
import { HelpButton, HelpDrawer, jaLabels } from "md-help-kit/ui";
import "md-help-kit/ui/styles.css";
```

### `HelpDrawer`

完成品のドロワーです。ヘッダー（戻る、タイトル、目次、閉じる）、検索欄、本文、目次を持ちます。

```tsx
<HelpDrawer side="left" labels={jaLabels} theme="dark" />
```

| prop | 型 | 説明 |
|---|---|---|
| `side` | `"right" \| "left"` | 表示する側。既定は `"right"` |
| `labels` | `HelpLabelsInput` | UIの文言（[文言](#文言)） |
| `theme` | `"light" \| "dark"` | ドロワーをライトかダークに固定します。省略時は OS の設定と `data-mhk-theme` に従います（[スタイル](#スタイル)） |

動作:

- **配置**:
  - モーダルではありません。ヘルプを開いたまま、アプリを操作できます。
  - ポータルで `document.body` に描画します。閉じているときは何も描画しません。
  - スクロールするのはドロワーの中だけです。見出しへ移動しても、アプリの画面は動きません。
- **画面**: 「本文」「目次」「検索結果」の3つを切り替えます。
  - 目次には全体の目次を出し、表示中のページの下に、そのページの h2 と h3 を入れ子で並べます。
  - 検索欄に入力すると、200ミリ秒待って検索します。結果を選ぶと、その見出しへ移動し、検索欄を空にします。
- **状態ごとの表示**: 読み込み中、ページなし（目次への導線つき）、読み込みの失敗（再試行ボタンつき）を表示します。
- **キーボード**:
  - <kbd>Esc</kbd> でドロワーを閉じます。ただし、フォーカスがドロワーの中にあるときだけです。アプリ側の <kbd>Esc</kbd> の処理とは衝突しません。
  - 検索欄に文字があるときは、<kbd>Esc</kbd> でまず文字を消します。
  - 閉じたときは、ドロワーに入る前の要素にフォーカスを戻します。
  - ドロワーを開いても、フォーカスは移しません。
- **アクセシビリティ**: ドロワーには `role="complementary"` と `aria-label` を付けます。
- **動き**: 横から滑り込みます。`prefers-reduced-motion: reduce` のときは動かしません。

### `HelpButton`

```tsx
<HelpButton />                                    // ドロワーを開閉する
<HelpButton target="stock/colors">在庫数の色について</HelpButton>
```

- `target` を指定しないときは `toggle()` を呼びます。
- `target` を指定したとき:
  - ドロワーが閉じていれば、そのページを開きます。
  - そのページを表示中なら、ドロワーを閉じます。
  - それ以外は、そのページへ移動します。
- 標準の中身はヘルプのアイコンで、`aria-label` は `labels.openHelp` です。`children` で中身を差し替えられます。
- `aria-expanded` でドロワーの開閉を示します。`className` など、ほかのボタンの属性も渡せます。

### 文言

UIの文言は、標準では英語です。日本語の文言を `jaLabels` として同梱しています。

```tsx
<HelpDrawer labels={jaLabels} />
<HelpButton labels={jaLabels} />
<HelpDrawer labels={{ ...jaLabels, title: "使い方" }} />
<HelpDrawer labels={{ title: "Guide", alerts: { warning: "Careful" } }} />
```

渡した項目だけを置き換えます。

- **項目**: `title`、`openHelp`、`back`、`close`、`contents`、`search`、`loading`、`notFound`、`goToContents`、`loadError`、`retry`、`searching`、`noResults`、`searchError`、`alerts`
- **`alerts` の項目**: `note`、`tip`、`important`、`warning`、`caution`
- **型**: `HelpLabels`（全項目）、`HelpLabelsInput`（一部だけ）

### スタイル

`md-help-kit/ui/styles.css` は素の CSS ファイル1枚です。フォントは読み込まず、OS のフォントを使います。
クラス名と変数には `mhk-` を付けています。本文のスタイルは `.mhk-prose` の中に限っているので、アプリ側のCSSには影響しません。

既定の値は `:where(:root)` に置いているので、どんな指定でも上書きできます。

```css
:root {
  --mhk-width: 420px;
  --mhk-accent: #8a3ffc;
}
```

| 変数 | 既定（ライト） | 用途 |
|---|---|---|
| `--mhk-width` | `360px` | ドロワーの幅 |
| `--mhk-z-index` | `1000` | ドロワーの重なり順 |
| `--mhk-radius` | `8px` | 角丸 |
| `--mhk-font` | OS のフォント | フォント |
| `--mhk-bg`、`--mhk-fg` | `#ffffff`、`#1d2430` | 背景と文字 |
| `--mhk-border` | `#d9dee5` | 枠線 |
| `--mhk-accent` | `#0b62bd` | リンク、フォーカス、選択中の状態 |
| `--mhk-fg-muted` | `#566170` | 薄い文字 |
| `--mhk-bg-subtle` | `#f3f5f8` | コード、表の見出し行、ホバー |
| `--mhk-quote-border` | `#b4bcc8` | 引用の罫線 |
| `--mhk-alert-<種別>` | 種別ごと | 注意書きの文字とアイコン（`note`、`tip`、`important`、`warning`、`caution`） |
| `--mhk-alert-<種別>-bg`、`--mhk-alert-<種別>-border` | 種別ごと | 注意書きの背景と枠 |

注意:

- 注意書きの色を変えるときは、`--mhk-alert-<種別>`、`-bg`、`-border` の3つを設定してください。背景と枠は文字色に追従しません。
- **ライトとダーク**:
  - `prefers-color-scheme` に追従します。
  - 固定するには、`<html>` などの祖先に `data-mhk-theme="light"` か `"dark"` を付けるか、ドロワーの `theme` を使います。
  - 利用者の上書きは、ライトとダークの両方に効きます。片方だけを変えるときは、メディアクエリか `[data-mhk-theme]` のセレクタで囲んでください。

## リッチな表現

### 独自タグ

React のコンポーネントを `components` に登録すると、Markdown の中でタグとして使えます。
ビルドが不要なので、`remote` で置いた md でも使えます。

```tsx
const screens = ["orders", "stock", "settings"];

function OpenScreen({ to, children }: { to?: unknown; children?: ReactNode }) {
  const navigate = useNavigate();
  // props は Markdown から来るので、使う前に確かめる
  if (typeof to !== "string" || !screens.includes(to)) return <>{children}</>;
  return (
    <button type="button" onClick={() => navigate(`/${to}`)}>
      {children}
    </button>
  );
}

const components = { OpenScreen, Shortcut };

<HelpProvider source={source} components={components}>
```

```md
<OpenScreen to="settings">設定画面を開く</OpenScreen>

<Shortcut keys={["Ctrl", "E"]} />
```

- タグ名は大文字で始めます。登録した名前だけが有効です。
- 登録していないタグは、描画せずに文字として表示します（開発時は警告が出ます）。
- **props**:
  - 文字列の属性は、文字列として渡ります。
  - `{...}` で書いた配列、オブジェクト、真偽値は、解析した値として渡ります。JSON として解析するので、オブジェクトのキーは `"` で囲みます（`{{"a": 1}}`）。
  - 数値は文字列として渡ります（`n={3}` は `"3"`）。
  - 関数や変数は **実行しません**。文字列として渡ります。
- タグの中身は Markdown として描画し、`children` に渡します。
- Markdown は信頼できない入力として扱ってください。props は文字列か不明な値として受け取り、確かめてから使ってください。

### コードブロック

コードブロックの描画を、言語名ごとに差し替えます。

```tsx
import type { HelpCodeBlockProps } from "md-help-kit";

function CodeBlock({ code, lang }: HelpCodeBlockProps) {
  return <MyHighlighter code={code} language={lang || "text"} />;
}

const codeBlocks = { "*": CodeBlock };
```

- `codeBlocks.mermaid` は ` ```mermaid ` のブロックを、`codeBlocks.math` は ` ```math ` のブロックを描画します。ほかの言語も同じです。
- `codeBlocks["*"]` は、個別の登録がない全言語に使います。言語名のないブロック（字下げのコードを含む）にも使い、そのときの `lang` は空文字です。
- 言語名の大文字と小文字は区別しません。
- 登録がなければ、素の `<pre><code>` で描画します。

### 注意書き

GitHub のアラート記法で書きます。GitHub や VS Code のプレビューでも、注意書きとして表示されます。

```md
> [!WARNING]
> 完了済みの行は変更できません。
```

- 種別は `NOTE`、`TIP`、`IMPORTANT`、`WARNING`、`CAUTION` の5つです。それ以外は、`[!XXX]` を文字として残した普通の引用になります。
- コアは引用に `data-mhk-alert="warning"` などを付けるだけです。アイコン、ラベル（`labels.alerts`）、色は UI が付けます。

### Mermaid の図

```tsx
import { MermaidBlock } from "md-help-kit/mermaid";

const codeBlocks = { mermaid: MermaidBlock };
```

- **読み込み**:
  - `mermaid`（11 または 12）は利用者がインストールします。
  - 最初に図を描くときに動的 `import()` で読み込みます。図のないページでは読み込みません。
- **安全性**:
  - `securityLevel: "strict"` で描画し、SVG の data URL を使った `<img>` として表示します。画像の中では、スクリプトも外部への取得も動きません。
  - そのため、ラベルは SVG の文字で描きます（`htmlLabels: false`）。図の中の文字は選択できず、ラベルの中の Markdown の記法は使えません。
- **代替テキスト**: 図の `accTitle` があればそれ、なければ元のコードです。
- **誤り**: 記法の誤りや `mermaid` の読み込みの失敗では、図の代わりにエラー文と元のコードを表示します。
- **配色**: 描画する場所に合わせて、`default` か `dark` の配色で描きます。
  - OS の設定や `data-mhk-theme` 属性が変わると、描き直します。
  - アプリが別の方法（変数を書き換えるクラスなど）で配色を切り替えたときは、次にページを表示したときに反映されます。

## 検索

ドロワーの検索欄は、`useHelp()` の `search(query)` を使っています。

```ts
const hits = await help.search("一括更新");
// [{ pageId, pageTitle, headingId, headingText, snippet }, ...]
```

- **読み込み**: 最初の検索で、目次に載っている全ページを並行して読み込み、キャッシュします。読み込めなかったページは結果から除き、次の検索で読み込み直します。
- **照合**:
  - 大文字と小文字、全角と半角の違いは区別しません（NFKC）。
  - 空白で区切った複数の語は、すべて同じ見出しの区間にあるときに一致します。
  - 照合するのは文字だけです。Markdown の記法、コードブロック、画像の代替テキスト、URL、タグの属性は対象外です。
- **結果**: 「ページ × 見出しの区間」ごとに1件です。
  - 並び順は、タイトルの一致、見出しの一致、本文の一致の順です。同じ種類の中では目次の順です。
  - 各結果には、最初の一致箇所の前後を切り出した抜粋が付きます。
- **規模**: 索引ファイルは作りません。ページ数がほどほどのヘルプを想定しています。

## 安全性

`markdown-to-jsx` は Markdown の中の HTML を解釈するので、通すものを絞っています。
ライブラリ標準の保護はそのまま有効にし、その上に許可リストを重ねます。これらの制限は `HelpContent` の中で必ず適用し、外すことはできません。

- **HTML タグ**: 許可リスト方式です。
  - 標準で許可するのは `details`、`summary`、`kbd`、`br`、`sub`、`sup`、`mark` です。
  - `allowedTags` で追加できます。
  - 次のタグは、追加しても許可しません（開発時は警告が出ます）。
    - `script`、`noscript`、`iframe`、`frame`、`frameset`、`object`、`embed`、`applet`、`template`
    - `style`、`link`、`meta`、`base`、`title`
    - `form`、`input`、`button`、`select`、`option`、`textarea`
    - `xmp`、`plaintext`、`noembed`、`noframes`
- **それ以外のタグ**: 許可も登録もされていないタグは、描画せずに文字として表示します。
- **属性**: `on` で始まる属性を取り除き、HTML タグの `style` も取り除きます。Markdown の表が `th` と `td` に付ける列の寄せは残します。
- **URL**:
  - リンク、画像、URL の属性（`href`、`src`、`srcset` など）で使えるのは、`http:`、`https:`、`mailto:`、相対URLだけです。`javascript:` や `data:` は使えません。
  - 許可しないURLのリンクは文字だけを、画像は代替テキストを表示します。
- **HTML の直接の書き込み**: ライブラリが直接書き込む HTML（`<pre>` の中身など）は、文字として表示します。
- **独自タグの属性**: JavaScript として実行することはありません。

## 開発時の警告

`process.env.NODE_ENV !== "production"` のとき、`[md-help-kit]` で始まる警告をコンソールに出します（文言は英語です）。たとえば次のようなときです。

- 存在しないページID（`useHelpPage`、`navigate`、表示中のページのリンク）
- 存在しない見出しへのリンク
- `_index.md` の解釈できない項目
- 登録も許可もされていないタグ、`allowedTags` に入れた禁止のタグ
- `bundled` の `.md` で終わらないキー、`remote` で Markdown の代わりに返ってきた HTML

表示中のページのリンクは、開発時だけ、リンク先を読み込んで確かめます。
警告を出すには、バンドラが `process.env.NODE_ENV` を置き換える必要があります（Vite をはじめ多くのバンドラは置き換えます）。`process` がない環境では警告を出しません。

## 注意点と制限

- **取得元を作る場所**: 取得元はレンダーの外で作るか、メモ化してください。新しい取得元を渡すと、キャッシュを捨ててすべて読み込み直します。
- **mermaid の全体の設定**: `MermaidBlock` は図を描くたびに `mermaid.initialize()` を呼びます（`startOnLoad: false`、`securityLevel: "strict"`、配色などを設定します）。`mermaid` の設定はページ全体で共有なので、アプリでも `mermaid` を使う場合は、アプリの図を描く前に自分の設定をし直してください。
- **日本語の段落の途中の改行**: ほかの Markdown の描画と同じく、段落の途中の改行は空白になります。日本語や中国語では目に見える空きになるので、1つの段落は1行で書いてください。
- **`bundled` の画像**: 画像の相対パスにはまだ対応していません。絶対URLか、`public/` 配下のパスを使ってください。
- **Markdown 以外へのリンク**: `.md` 以外のファイル（`manual.pdf` など）への相対リンクは、通常のリンクとして表示します。docs の場所を基準には解決しないので、ダウンロードさせるファイルは絶対URLで書いてください。
- **別オリジンの `remote`**: md を置いたサーバーで CORS を設定する必要があります。
- **SSR**: まだ対応していません。ただし、読み込んだだけでは `window` や `document` に触れないので、サーバー側で import しても問題ありません。
- **この版で行わないこと**: MDX、検索用の索引や形態素解析、ヘルプの編集画面。

## デモアプリ

`example/` は、業務アプリ風のデモ（受注一覧、在庫照会、設定）です。すべての機能を使っています。

- 画面ごとと、ダイアログの中での `useHelpPage`
- `bundled` と `remote`、英語と日本語の文言、テーマ、ドロワーを表示する側の切り替え
- 独自タグ（`OpenScreen`、`Shortcut`）と Mermaid の図

```sh
pnpm install
pnpm example   # http://localhost:5173/
```

デモはライブラリを `src/` から直接読むので、事前のビルドは要りません。
`example/docs/prose-sample.md` は、Markdown の全要素を1ページに並べた見本で、本文のスタイルの基準です。

## 開発

```sh
pnpm install
pnpm test        # Vitest（監視モードは pnpm test:watch）
pnpm typecheck   # ライブラリ、設定ファイル、デモの型検査
pnpm build       # ライブラリを dist/ にビルド
pnpm example     # デモアプリ
```

仕様は [`DESIGN.md`](./DESIGN.md) にあります。
