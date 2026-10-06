// MermaidBlock（DESIGN.md 6.4節）。codeBlocks.mermaid に登録して使う
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { HelpCodeBlockProps } from "../core/index.js";

type Mermaid = (typeof import("mermaid"))["default"];

let loading: Promise<Mermaid> | null = null;

/** mermaid は初めて描画するときに読み込む（使わないページでは読み込まない） */
function loadMermaid(): Promise<Mermaid> {
  if (loading === null) {
    loading = import("mermaid").then((module) => module.default);
    // 読み込みに失敗したら、次の描画で読み込み直す
    loading.catch(() => {
      loading = null;
    });
  }
  return loading;
}

// mermaid は同時の描画に弱いため、1つずつ順番に描画する
let queue: Promise<unknown> = Promise.resolve();
let renderCount = 0;

async function renderSvg(code: string, dark: boolean): Promise<string> {
  const mermaid = await loadMermaid();
  const run = queue.then(async () => {
    const id = `mhk-mermaid-${++renderCount}`;
    // mermaid の設定は全体で共有なので、描画のたびに設定し直す
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: dark ? "dark" : "default",
      // 画像として表示するため、ラベルは HTML ではなく SVG の文字で描く
      htmlLabels: false,
      flowchart: { htmlLabels: false },
      suppressErrorRendering: true,
    });
    try {
      const { svg } = await mermaid.render(id, code);
      return svg;
    } finally {
      // 記法の誤りのときなどに mermaid が残す一時的な要素を取り除く
      for (const prefix of ["", "d", "i"]) document.getElementById(`${prefix}${id}`)?.remove();
    }
  });
  queue = run.catch(() => {});
  return run;
}

/** 描画する場所の配色がダークか。color-scheme（ドロワーでは --mhk-color-scheme）で判定する */
function isDark(element: Element): boolean {
  const scheme = getComputedStyle(element).colorScheme ?? "";
  const dark = /\bdark\b/.test(scheme);
  const light = /\blight\b/.test(scheme);
  if (dark && !light) return true;
  if (dark && light) return darkMedia()?.matches ?? false;
  return false;
}

function darkMedia(): MediaQueryList | null {
  return typeof matchMedia === "function" ? matchMedia("(prefers-color-scheme: dark)") : null;
}

/** 代替テキスト。図のタイトル（accTitle）があればそれ、なければ元のコード */
function altText(code: string): string {
  return /^\s*accTitle\s*:\s*(.+)$/m.exec(code)?.[1]?.trim() ?? code;
}

type State =
  | { status: "loading" }
  | { status: "done"; src: string }
  | { status: "error"; message: string };

/**
 * Mermaid の図を描画するコードブロック。
 * 図は画像（<img>）として表示するので、図の中でスクリプトや外部の取得は起きない。
 * 記法の誤りや mermaid の読み込みの失敗では、図の代わりにエラー文と元のコードを表示する。
 */
export function MermaidBlock({ code }: HelpCodeBlockProps): ReactNode {
  const rootRef = useRef<HTMLDivElement>(null);
  const [dark, setDark] = useState<boolean | null>(null);
  const [state, setState] = useState<State>({ status: "loading" });

  // 配色を判定し、OS の設定や data-mhk-theme（html などの祖先、ドロワー自身）が変わったら判定し直す。
  // 配色が変わらなければ state も変わらないので、描き直さない
  useEffect(() => {
    const root = rootRef.current;
    if (root === null) return;
    const update = () => setDark(isDark(root));
    update();
    const media = darkMedia();
    media?.addEventListener("change", update);
    const observer = new MutationObserver(update);
    observer.observe(root.ownerDocument.documentElement, {
      attributes: true,
      attributeFilter: ["data-mhk-theme"],
      subtree: true,
    });
    return () => {
      media?.removeEventListener("change", update);
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (dark === null) return;
    let cancelled = false;
    renderSvg(code, dark).then(
      (svg) => {
        if (!cancelled) {
          setState({ status: "done", src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}` });
        }
      },
      (error: unknown) => {
        if (!cancelled) {
          setState({ status: "error", message: error instanceof Error ? error.message : String(error) });
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [code, dark]);

  return (
    <div ref={rootRef} className="mhk-mermaid" aria-busy={state.status === "loading" ? true : undefined}>
      {state.status === "done" && <img src={state.src} alt={altText(code)} />}
      {state.status === "error" && (
        <div className="mhk-mermaid-error">
          <p className="mhk-mermaid-message">{state.message}</p>
          <pre>
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
