# md-help-kit

English | [日本語](./README.ja.md)

In-app help for React apps, written in plain Markdown.
Put `.md` files in a folder and you get a help drawer, a table of contents, help that follows the current screen, links between pages, and search.

- **Markdown only**: the table of contents is a Markdown file too. No CLI or extra build step.
- **Bundled or remote**: ship the docs inside your build, or serve them from a static folder and update them without redeploying the app. Both behave the same.
- **One dependency**: only [`markdown-to-jsx`](https://github.com/quantizor/markdown-to-jsx). Heavy features (diagrams, syntax highlighting, math) plug in through extension points.
- **Headless core, optional UI**: use the ready-made drawer, or build your own UI on top of the hooks.

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Quick start](#quick-start)
- [Writing the docs](#writing-the-docs)
- [Sources](#sources)
- [Core API](#core-api)
- [UI](#ui)
- [Rich content](#rich-content)
- [Search](#search)
- [Security](#security)
- [Development warnings](#development-warnings)
- [Notes and limitations](#notes-and-limitations)
- [Example app](#example-app)
- [Development](#development)

## Requirements

- React 18 or later (`react` and `react-dom`)
- A bundler that understands ES modules. The package is ESM only.
- `md-help-kit/mermaid` only: `mermaid` 11 or 12

## Installation

```sh
npm install md-help-kit
# Only if you use Mermaid diagrams
npm install mermaid
```

## Quick start

Put your help pages in a folder:

```
src/help/docs/
  _index.md        table of contents (required)
  orders.md
  stock.md
  stock/colors.md
```

Create the source once, outside any component (a new source on every render throws the cache away):

```ts
// src/help/source.ts
import { bundled } from "md-help-kit";

export const helpSource = bundled(
  import.meta.glob("./docs/**/*.md", { query: "?raw", import: "default" }),
);
```

Wrap your app and add the drawer and a button:

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

Tell the help which page belongs to each screen:

```tsx
import { useHelpPage } from "md-help-kit";

function OrdersScreen() {
  useHelpPage("orders");
  // ...
}
```

Clicking the button now opens the drawer on `orders.md`. When the user moves to another screen while the drawer is open, the drawer follows.

## Writing the docs

### `_index.md` (table of contents)

The table of contents is a nested list of links.
It defines the pages, their order, their hierarchy, and their titles.

```md
- [Orders](orders.md)
- [Stock](stock.md)
  - [Stock colors](stock/colors.md)
- For administrators
  - [Settings](settings.md)
```

- An item with a link is a page. The link text is the page title.
- An item without a link is a group heading.
- Anything other than lists (headings, paragraphs) is ignored. Several lists are joined in order. Ordered lists work the same way.
- Link targets are relative to the docs root (`./orders.md` and `/orders.md` also work).
- The following items are skipped together with their children (with a warning in development):
  - empty items or empty link text
  - items with two or more links
  - links to non-`.md` files, to external URLs, outside the docs root, or with a `#`
- Pages that are not in the table of contents can still be opened from links and `useHelpPage`. They do not appear in the contents or in search. Their title is the first `#` heading, or the page ID.

### Page IDs and targets

A page ID is the path from the docs root without `.md`, always separated by `/`:

- `orders.md` → `orders`
- `stock/colors.md` → `stock/colors`

A **target** can also point to a heading: `orders#bulk-update`.

### Heading IDs

Headings get IDs similar to GitHub's:

1. Trim and lowercase
2. Remove everything except letters (any language), marks, numbers, `-`, `_`, and spaces
3. Replace each space with `-` (consecutive spaces are not collapsed)
4. Duplicates within a page get `-1`, `-2`, and so on

Non-Latin text is kept as is. For example, `## 一括更新` becomes `一括更新`, and `## Bulk update` becomes `bulk-update`.

### Links

| Link | Behavior |
|---|---|
| `./stock.md`, `stock/colors.md#red`, `/orders.md` | Opens the page inside the drawer. Relative paths resolve from the current page, and paths starting with `/` resolve from the docs root. |
| `#bulk-update` | Scrolls to the heading on the same page |
| `http://`, `https://`, `mailto:` | Opens in a new tab (`rel="noreferrer noopener"`) |
| anything else | Rendered as an ordinary link, without special handling |

- `%xx` escapes in the path and after `#` are decoded.
- Page links keep the path you wrote as their `href`. A click always navigates inside the drawer, even with Ctrl or another modifier key held, because a Markdown path is not an app URL.
- "Anything else" includes paths above the docs root, URLs starting with `//`, other schemes, and relative links to files other than `.md`. The extension check is for a lowercase `.md` only.

### Images

- `remote`: relative image paths resolve against the page's URL.
- `bundled`: only absolute URLs and paths under your app's `public/` folder work, such as `/help/img/filter.png`. Relative paths are not supported yet.

## Sources

A source tells the provider where the Markdown comes from.
Table of contents parsing, headings, links, and search work the same for every source.

### `bundled(modules)`: include the docs in your build

```ts
const source = bundled(
  import.meta.glob("./docs/**/*.md", { query: "?raw", import: "default" }),
);
```

- Accepts `Record<string, string | (() => Promise<string>)>`. Both eager and lazy imports work.
- The common directory prefix and `.md` are removed to get page IDs. Keys that do not end with `.md` are ignored, with a warning in development.
- If a lazy import fails, or a module does not provide a string, loading fails with `HelpLoadError`. A missing string usually means `query: "?raw"` or `import: "default"` was forgotten.
- `import.meta.glob` is a Vite feature. With other bundlers, build the object yourself.

### `remote(baseUrl, options?)`: load the docs over HTTP

```ts
const source = remote("/help");
const source2 = remote("https://files.example.com/app-help", {
  fetchInit: { credentials: "include" },
});
```

- Loads `${baseUrl}/_index.md` and `${baseUrl}/${id}.md`. Each path segment is URL-encoded.
- Uses `fetch` with `cache: "no-cache"`, so edited files show up on the next load.
- `options.fetchInit` is merged over the default settings. Nested objects such as `headers` are replaced, not merged.
- Errors:
  - A 404 response throws `HelpNotFoundError`. So does a `200` response with `Content-Type: text/html`, because many SPA servers answer unknown paths with the app's HTML (a warning is shown in development).
  - Other failures throw `HelpLoadError`.
- Relative image paths resolve against the page URL. If `baseUrl` is relative, so is the result.
- If the docs are on another origin, configure CORS on that server.

### Custom sources

Implement `HelpSource` to load docs from anywhere, for example your own API:

```ts
import { HelpLoadError, HelpNotFoundError, type HelpSource } from "md-help-kit";

async function load(id: string): Promise<string> {
  // IDs come from useHelpPage, navigate, and links. Reject IDs that leave the docs root.
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
  // Optional: resolve relative image paths for display
  resolveAsset: (pageId, path) => new URL(path, `${location.origin}/api/manuals/${pageId}`).href,
};
```

| Member | Description |
|---|---|
| `loadIndex()` | Returns the content of `_index.md` |
| `loadPage(id)` | Returns the Markdown of a page. Throw `HelpNotFoundError` if it does not exist. |
| `resolveAsset?(pageId, path)` | Turns a relative path in a page (images) into a URL to display. The result is not checked again. |

`HelpNotFoundError` has `pageId`, which is `_index` for the table of contents.
`HelpLoadError` has `pageId` and `status`. `status` is the HTTP status, or `undefined` when there was no HTTP response. Both accept the standard `cause` option.

## Core API

`md-help-kit` is the headless core. It has no styles.

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

| Prop | Type | Description |
|---|---|---|
| `source` | `HelpSource` | Required. When it changes, the cache and history are discarded and the contents and current page are loaded again. Screen declarations and the open state are kept. Do not create it during render. |
| `defaultPage` | `string` | Page to open when the current screen has no page. Defaults to the first page in the table of contents. |
| `indexLoading` | `"mount" \| "open"` | When to load the table of contents. With `"mount"` (default), it loads when the provider mounts. With `"open"`, it loads the first time `open`, `toggle`, `navigate`, or `search` is used. Changes after mount are ignored. |
| `components` | `Record<string, ComponentType<any>>` | Custom tags usable in Markdown ([Custom tags](#custom-tags)) |
| `codeBlocks` | `Record<string, ComponentType<HelpCodeBlockProps>>` | Renderers per code block language ([Code blocks](#code-blocks)) |
| `allowedTags` | `string[]` | Extra HTML tags allowed in Markdown ([Security](#security)) |

Define `components` and `codeBlocks` outside your components, or memoize them, so the content is not rebuilt on every render.

### `useHelpPage(target)`

Declares "the help for this screen is this page":

```tsx
useHelpPage("orders");
useHelpPage("orders#bulk-update");
useHelpPage(isAdmin ? "settings" : null); // null declares nothing
```

- Registered on mount and removed on unmount.
- If several components declare a page, the most recently mounted one wins. Declarations form a stack, so removing one returns to the previous one.
  - For components mounted together, the order of render decides. A child beats its parent, and a later sibling beats an earlier one.
  - Changing the target does not move a declaration in the stack.
  - This is how a dialog can point the help at its own section while it is open.
- While the drawer is open, it follows changes of the screen's page. The previous page goes into the history. When the screen's target becomes `null`, the drawer keeps showing what it shows.

### `useHelp()`

Returns the state and actions of the help (`HelpApi`):

| Member | Description |
|---|---|
| `isOpen` | Whether the drawer is open |
| `open(target?)` | Opens the drawer. Without a target, it picks the screen's page, `defaultPage`, or the first page in the contents, in that order. |
| `close()`, `toggle()` | Closes the drawer, or opens and closes it |
| `index` | The table of contents tree (`HelpIndexNode[]`). See below. |
| `indexStatus` | `"idle"`, `"loading"`, `"ready"`, or `"error"`. `idle` means loading has not started yet (with `indexLoading: "open"`). |
| `current` | The page being shown, or `null` before anything has been opened. See below. |
| `screenTarget` | The target declared by the current screen |
| `navigate(target)` | Moves to a target. `"#heading"` means a heading on the current page. |
| `back()`, `canGoBack` | Goes back in the drawer's own history. The browser history is not touched. |
| `reload()` | Discards all caches and loads the contents and current page again. This also retries after a failure. |
| `search(query)` | Returns `Promise<HelpSearchHit[]>` ([Search](#search)) |

- `index` items have the type `HelpIndexNode`:
  - `{ type: "page", id, title, children }`
  - `{ type: "group", title, children }`
- `current` has the type `HelpCurrentPage`:
  - `{ id, title, markdown, headings, headingId, status }`
  - `status` is `"loading"`, `"ready"`, `"not-found"`, or `"error"`.
  - `headings` lists the top-level headings (`{ depth, text, id }`).
- Loaded pages are cached in memory.
- Moving to a heading on the same page only scrolls. It is not added to the history.
- `useHelp`, `useHelpPage`, and `HelpContent` throw when used outside `HelpProvider`.

### `HelpContent`

Renders the current page without any styles:

```tsx
<HelpContent className="my-prose" overrides={{ table: MyTable }} />
```

- Renders only while `current.status` is `"ready"`, inside `<div className={className}>`. In every other state it renders nothing, so you can show your own loading and error states.
- Headings get IDs, links follow the rules in [Links](#links), and images go through `source.resolveAsset`.
- `overrides` replaces standard elements (`a`, `table`, `img`, `blockquote`, and so on).
  - Only lowercase names are used. Register custom tags with `components` instead.
  - If you replace `a` or `img`, the link handling and image resolution still happen, and your component receives the results (`href`, `target`, `rel`, `onClick`, the resolved `src`) as props.
- When the page changes, and on every navigation, it scrolls to the target heading, or to the top of the page, with `scrollIntoView({ block: "start" })`.

With `useHelp` and `HelpContent` you can build a completely custom help UI. `md-help-kit/ui` is built this way, using only the public core API.

## UI

```tsx
import { HelpButton, HelpDrawer, jaLabels } from "md-help-kit/ui";
import "md-help-kit/ui/styles.css";
```

### `HelpDrawer`

A ready-made drawer with a header (back, title, contents, close), a search box, the page, and the table of contents.

```tsx
<HelpDrawer side="left" labels={jaLabels} theme="dark" />
```

| Prop | Type | Description |
|---|---|---|
| `side` | `"right" \| "left"` | Which edge to show the drawer on. Default `"right"`. |
| `labels` | `HelpLabelsInput` | UI text ([Labels](#labels)) |
| `theme` | `"light" \| "dark"` | Fixes the drawer to light or dark. By default it follows the OS and `data-mhk-theme` ([Styling](#styling)). |

Behavior:

- **Layout**:
  - Not modal: users can keep working in the app while the help is open.
  - Rendered into `document.body` through a portal. Nothing is rendered while it is closed.
  - Only the drawer's own body scrolls; jumping to a heading never scrolls your page.
- **Views**: page, contents, and search results.
  - The contents view shows the whole table of contents, with the current page's h2 and h3 headings nested under it.
  - Typing in the search box searches after 200 ms. Choosing a result jumps to that heading and clears the search box.
- **Status messages**: it shows loading, not found (with a link to the contents), and load error (with a retry button) states.
- **Keyboard**:
  - <kbd>Esc</kbd> closes the drawer, but only while focus is inside it, so your app's own <kbd>Esc</kbd> handling is not affected.
  - If the search box has text, <kbd>Esc</kbd> clears it first.
  - Focus goes back to where it was before entering the drawer.
  - Opening the drawer does not move focus into it.
- **Accessibility**: the drawer has `role="complementary"` and an `aria-label`.
- **Motion**: it slides in, except with `prefers-reduced-motion: reduce`.

### `HelpButton`

```tsx
<HelpButton />                                    // toggles the drawer
<HelpButton target="stock/colors">About colors</HelpButton>
```

- Without `target`, it calls `toggle()`.
- With `target`:
  - If the drawer is closed, it opens that page.
  - If the drawer is open on that page, it closes the drawer.
  - Otherwise, it moves to that page.
- The default content is a help icon with `aria-label` from `labels.openHelp`. Pass `children` to replace it.
- `aria-expanded` reflects the drawer state. Other button attributes, such as `className`, are passed through.

### Labels

The UI text is English by default. Japanese labels are included as `jaLabels`.

```tsx
<HelpDrawer labels={jaLabels} />
<HelpButton labels={jaLabels} />
<HelpDrawer labels={{ ...jaLabels, title: "使い方" }} />
<HelpDrawer labels={{ title: "Guide", alerts: { warning: "Careful" } }} />
```

Only the keys you pass are replaced.

- **Keys**: `title`, `openHelp`, `back`, `close`, `contents`, `search`, `loading`, `notFound`, `goToContents`, `loadError`, `retry`, `searching`, `noResults`, `searchError`, `alerts`
- **`alerts` keys**: `note`, `tip`, `important`, `warning`, `caution`
- **Types**: `HelpLabels` (all keys) and `HelpLabelsInput` (partial)

### Styling

`md-help-kit/ui/styles.css` is a single plain CSS file. It loads no fonts and uses the OS fonts.
All class names and variables start with `mhk-`, and page styles are limited to `.mhk-prose`, so they do not leak into your app.

The defaults are defined on `:where(:root)`, so any rule of yours overrides them:

```css
:root {
  --mhk-width: 420px;
  --mhk-accent: #8a3ffc;
}
```

| Variable | Default (light) | Use |
|---|---|---|
| `--mhk-width` | `360px` | Drawer width |
| `--mhk-z-index` | `1000` | Drawer stacking order |
| `--mhk-radius` | `8px` | Corner radius |
| `--mhk-font` | system fonts | Font family |
| `--mhk-bg`, `--mhk-fg` | `#ffffff`, `#1d2430` | Background and text |
| `--mhk-border` | `#d9dee5` | Borders |
| `--mhk-accent` | `#0b62bd` | Links, focus, active states |
| `--mhk-fg-muted` | `#566170` | Secondary text |
| `--mhk-bg-subtle` | `#f3f5f8` | Code, table headers, hover |
| `--mhk-quote-border` | `#b4bcc8` | Blockquote rule |
| `--mhk-alert-<kind>` | per kind | Alert text and icon (`note`, `tip`, `important`, `warning`, `caution`) |
| `--mhk-alert-<kind>-bg`, `--mhk-alert-<kind>-border` | per kind | Alert background and border |

Notes:

- To change an alert color, set all three of `--mhk-alert-<kind>`, `-bg`, and `-border`. The background and border do not follow the text color.
- **Light and dark**:
  - The styles follow `prefers-color-scheme`.
  - To fix the theme, put `data-mhk-theme="light"` or `"dark"` on an ancestor such as `<html>`, or use the drawer's `theme` prop.
  - Your own overrides apply to both themes. Wrap them in a media query or a `[data-mhk-theme]` selector to target one.

## Rich content

### Custom tags

Register React components in `components` and use them as tags in Markdown.
No build step is needed, so this also works with `remote` docs.

```tsx
const screens = ["orders", "stock", "settings"];

function OpenScreen({ to, children }: { to?: unknown; children?: ReactNode }) {
  const navigate = useNavigate();
  // Props come from Markdown: check them before use
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
<OpenScreen to="settings">Open the settings screen</OpenScreen>

<Shortcut keys={["Ctrl", "E"]} />
```

- Tag names must start with an uppercase letter. Only registered names work.
- Unregistered tags are shown as text, with a warning in development.
- **Props**:
  - String attributes are passed as strings.
  - Arrays, objects, and booleans written in `{...}` are passed as parsed values. They are parsed as JSON, so object keys need double quotes, like `{{"a": 1}}`.
  - Numbers are passed as strings: `n={3}` gives `"3"`.
  - Functions and variables are **never evaluated**. They are passed as strings.
- The content between the tags is rendered as Markdown and passed as `children`.
- Markdown is untrusted input. Treat props as strings or unknown values, and validate them.

### Code blocks

Replace how code blocks are rendered, per language:

```tsx
import type { HelpCodeBlockProps } from "md-help-kit";

function CodeBlock({ code, lang }: HelpCodeBlockProps) {
  return <MyHighlighter code={code} language={lang || "text"} />;
}

const codeBlocks = { "*": CodeBlock };
```

- `codeBlocks.mermaid` handles ` ```mermaid ` blocks, `codeBlocks.math` handles ` ```math ` blocks, and so on.
- `codeBlocks["*"]` handles every language without its own entry. It also handles blocks without a language, including indented code; then `lang` is an empty string.
- Language names are case-insensitive.
- Without an entry, blocks render as a plain `<pre><code>`.

### Alerts

Use GitHub's alert syntax. It also renders as an alert in GitHub and VS Code previews.

```md
> [!WARNING]
> Completed rows cannot be changed.
```

- The kinds are `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`. Other kinds render as a normal blockquote that keeps `[!XXX]` as text.
- The core marks the blockquote with `data-mhk-alert="warning"` and so on. The UI adds the icon, the label (from `labels.alerts`), and the colors.

### Mermaid diagrams

```tsx
import { MermaidBlock } from "md-help-kit/mermaid";

const codeBlocks = { mermaid: MermaidBlock };
```

- **Loading**:
  - Install `mermaid` (11 or 12) yourself.
  - It is loaded with a dynamic `import()` the first time a diagram is rendered, so pages without diagrams do not load it.
- **Safety**:
  - Diagrams are drawn with `securityLevel: "strict"` and shown as an `<img>` with an SVG data URL. Scripts and external requests cannot run inside the image.
  - For the same reason, labels are drawn as SVG text (`htmlLabels: false`): diagram text cannot be selected, and Markdown inside labels is not supported.
- **Alternative text**: the diagram's `accTitle` if present, otherwise the source code.
- **Errors**: syntax errors, and failures to load `mermaid`, show the error message and the source instead of the diagram.
- **Theme**: diagrams use the `default` or `dark` theme to match the place where they are drawn.
  - They are redrawn when the OS setting or a `data-mhk-theme` attribute changes.
  - If your app switches themes another way, for example with a class that changes the variables, diagrams update the next time the page is shown.

## Search

The drawer's search box uses `search(query)` from `useHelp()`:

```ts
const hits = await help.search("bulk update");
// [{ pageId, pageTitle, headingId, headingText, snippet }, ...]
```

- **Loading**: the first search loads every page in the table of contents in parallel and caches them. Pages that fail to load are skipped and retried on the next search.
- **Matching**:
  - Matching is case-insensitive, and full-width and half-width forms match each other (NFKC).
  - Space-separated words must all appear in the same heading section.
  - Only the text is searched. Markdown syntax, code blocks, image alt text, URLs, and tag attributes are not.
- **Results**: one hit per page × heading section.
  - Order: title matches first, then heading matches, then body matches; within each group, contents order.
  - Each hit has a short snippet around the first match.
- **Scale**: there is no index file. This is meant for help sites with a modest number of pages.

## Security

`markdown-to-jsx` interprets HTML in Markdown, so the package limits what can get through.
The library's own protections stay on, and an allow list is added on top. These limits always apply inside `HelpContent` and cannot be turned off.

- **HTML tags**: allow-listed.
  - Allowed by default: `details`, `summary`, `kbd`, `br`, `sub`, `sup`, `mark`.
  - Add more with `allowedTags`.
  - The following are never allowed, even if listed (a warning is shown in development):
    - `script`, `noscript`, `iframe`, `frame`, `frameset`, `object`, `embed`, `applet`, `template`
    - `style`, `link`, `meta`, `base`, `title`
    - `form`, `input`, `button`, `select`, `option`, `textarea`
    - `xmp`, `plaintext`, `noembed`, `noframes`
- **Other tags**: tags that are neither allowed nor registered are shown as text, not rendered.
- **Attributes**: `on*` attributes are removed, and `style` is removed from HTML tags. The alignment that Markdown tables put on `th` and `td` is kept.
- **URLs**:
  - Only `http:`, `https:`, `mailto:`, and relative URLs are allowed in links, images, and URL attributes (`href`, `src`, `srcset`, and so on). `javascript:` and `data:` are not.
  - A link with a disallowed URL becomes plain text, and an image becomes its alt text.
- **Raw HTML**: HTML that the library would write directly (inside `<pre>`, for example) is shown as text.
- **Custom tag attributes**: they are never evaluated as JavaScript.

## Development warnings

When `process.env.NODE_ENV !== "production"`, the package warns in the console with messages starting with `[md-help-kit]`. For example:

- a page ID that does not exist (from `useHelpPage`, `navigate`, or a link on the current page)
- a link to a heading that does not exist
- an unparseable item in `_index.md`
- a tag that is neither registered nor allowed, or a forbidden tag in `allowedTags`
- a key that does not end with `.md` in `bundled`, or HTML returned instead of Markdown by `remote`

Links on the page being shown are checked by loading their targets, and only in development.
Warnings need your bundler to replace `process.env.NODE_ENV`, as Vite and most bundlers do. Where `process` is not defined, no warnings are shown.

## Notes and limitations

- **Creating sources**: create sources outside render, or memoize them. A new source drops the cache and reloads everything.
- **Mermaid's global settings**: `MermaidBlock` calls `mermaid.initialize()` before each diagram, with `startOnLoad: false`, `securityLevel: "strict"`, a theme, and other settings. `mermaid`'s settings are global. If your app also uses `mermaid`, set your own settings again before rendering your own diagrams.
- **Line breaks in CJK text**: as in other Markdown renderers, a line break inside a paragraph is rendered as a space. Japanese and Chinese text shows a visible gap there, so write each paragraph on one line.
- **Images in `bundled`**: relative image paths are not supported yet. Use absolute URLs or paths under `public/`.
- **Non-Markdown links**: relative links to files other than `.md`, such as `manual.pdf`, are rendered as ordinary links. They are not resolved against the docs location, so use absolute URLs for downloads.
- **Cross-origin `remote`**: CORS must be configured on the server that hosts the docs.
- **SSR**: not supported yet. Importing the package does not touch `window` or `document`, so importing it on the server is safe.
- **Not included in this version**: MDX, a search index or morphological analysis, and an editor for the help.

## Example app

`example/` is a small business-app-like demo (orders, stock, settings) that uses every feature:

- `useHelpPage` on each screen and in a dialog
- switching between `bundled` and `remote`, English and Japanese labels, themes, and drawer sides
- custom tags (`OpenScreen`, `Shortcut`) and Mermaid diagrams

```sh
pnpm install
pnpm example   # http://localhost:5173/
```

The example reads the library from `src/` directly, so no build is needed.
`example/docs/prose-sample.md` shows every Markdown element in one page and is the visual reference for the page styles.

## Development

```sh
pnpm install
pnpm test        # Vitest (pnpm test:watch for watch mode)
pnpm typecheck   # tsc for the library, the configs, and the example
pnpm build       # library build into dist/
pnpm example     # demo app
```

The specification is in [`DESIGN.md`](./DESIGN.md) (in Japanese).
