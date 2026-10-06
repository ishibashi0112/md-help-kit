// md の中で使う独自タグ（DESIGN.md 6.1節）。HelpProvider の components に登録する
import { Fragment, type ReactNode } from "react";
import { isScreen, updateDemoState } from "./demo-state.js";

/**
 * アプリの画面を開くボタン。`<OpenScreen to="stock">在庫照会を開く</OpenScreen>`
 *
 * 画面が変わると、その画面の useHelpPage の宣言に合わせてヘルプの表示も移る。
 * 知らない画面のときは、ボタンにせず中身だけを表示する。
 */
export function OpenScreen({ to, children }: { to?: unknown; children?: ReactNode }): ReactNode {
  if (!isScreen(to)) return <span>{children}</span>;
  return (
    <button type="button" className="demo-open-screen" onClick={() => updateDemoState({ screen: to })}>
      {children}
    </button>
  );
}

/**
 * キーの組み合わせ。`<Shortcut keys={["Ctrl", "E"]} />`
 *
 * keys は md の中で配列として書く。文字列で書かれたときは `+` で区切る。
 */
export function Shortcut({ keys }: { keys?: unknown }): ReactNode {
  const list = Array.isArray(keys)
    ? keys.map(String)
    : typeof keys === "string"
      ? keys.split("+").map((key) => key.trim())
      : [];
  return (
    <span className="demo-shortcut">
      {list.map((key, index) => (
        <Fragment key={index}>
          {index > 0 && " + "}
          <kbd>{key}</kbd>
        </Fragment>
      ))}
    </span>
  );
}
