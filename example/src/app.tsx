// デモアプリ。利用者と同じ書き方で md-help-kit を使う
import { bundled, HelpProvider, remote, useHelp } from "md-help-kit";
import { MermaidBlock } from "md-help-kit/mermaid";
import { HelpButton, HelpDrawer, jaLabels } from "md-help-kit/ui";
import { type ReactNode, useEffect } from "react";
import { type DemoState, type Screen, updateDemoState, useDemoState } from "./demo-state.js";
import { OpenScreen, Shortcut } from "./help-components.js";
import { OrdersScreen } from "./screens/orders.js";
import { SettingsScreen } from "./screens/settings.js";
import { StockScreen } from "./screens/stock.js";

// 取得元、独自タグ、コードブロックは、レンダーのたびに作り直さないよう、モジュールの中で作る
const sources = {
  // example/docs/ をビルドに含める（ページは開いたときに読み込む）
  bundled: bundled(import.meta.glob("../docs/**/*.md", { query: "?raw", import: "default" })),
  // 同じ example/docs/ を、開発サーバーが /help/ で配信している（vite.config.ts）
  remote: remote("/help"),
};
const components = { OpenScreen, Shortcut };
const codeBlocks = { mermaid: MermaidBlock };

const screens: { id: Screen; label: string }[] = [
  { id: "orders", label: "受注一覧" },
  { id: "stock", label: "在庫照会" },
  { id: "settings", label: "設定" },
];

export function App(): ReactNode {
  const state = useDemoState();

  // テーマは html の data-mhk-theme で固定する（アプリの CSS も同じ属性を見る）
  useEffect(() => {
    const root = document.documentElement;
    if (state.theme === "system") delete root.dataset.mhkTheme;
    else root.dataset.mhkTheme = state.theme;
  }, [state.theme]);

  return (
    <HelpProvider source={sources[state.source]} components={components} codeBlocks={codeBlocks}>
      <Shell state={state} />
    </HelpProvider>
  );
}

function Shell({ state }: { state: DemoState }): ReactNode {
  const { isOpen } = useHelp();
  const labels = state.lang === "ja" ? jaLabels : undefined;
  return (
    // ドロワーはモーダルではないので、開いている間は画面をずらし、ドロワーに隠れないようにする
    <div className="demo-app" data-help-open={isOpen ? state.side : undefined}>
      <header className="demo-header">
        <div className="demo-brand">
          受注管理
          <small>md-help-kit デモ</small>
        </div>
        <nav className="demo-nav" aria-label="画面">
          {screens.map((screen) => (
            <button
              key={screen.id}
              type="button"
              aria-current={screen.id === state.screen ? "page" : undefined}
              onClick={() => updateDemoState({ screen: screen.id })}
            >
              {screen.label}
            </button>
          ))}
        </nav>
        <div className="demo-switches">
          <Choice
            label="取得元"
            value={state.source}
            options={[
              ["bundled", "bundled"],
              ["remote", "remote"],
            ]}
            onChange={(source) => updateDemoState({ source })}
          />
          <Choice
            label="文言"
            value={state.lang}
            options={[
              ["en", "English"],
              ["ja", "日本語"],
            ]}
            onChange={(lang) => updateDemoState({ lang })}
          />
          <Choice
            label="テーマ"
            value={state.theme}
            options={[
              ["system", "OSに従う"],
              ["light", "ライト"],
              ["dark", "ダーク"],
            ]}
            onChange={(theme) => updateDemoState({ theme })}
          />
          <Choice
            label="表示する側"
            value={state.side}
            options={[
              ["right", "右"],
              ["left", "左"],
            ]}
            onChange={(side) => updateDemoState({ side })}
          />
        </div>
        <HelpButton labels={labels} />
      </header>
      <main className="demo-main">
        {state.screen === "orders" && <OrdersScreen />}
        {state.screen === "stock" && <StockScreen />}
        {state.screen === "settings" && <SettingsScreen />}
      </main>
      <HelpDrawer side={state.side} labels={labels} />
    </div>
  );
}

function Choice<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly (readonly [T, string])[];
  onChange: (value: T) => void;
}): ReactNode {
  return (
    <label className="demo-choice">
      <span>{label}</span>
      <select
        value={value}
        onChange={(event) => {
          const next = options.find(([option]) => option === event.target.value);
          if (next !== undefined) onChange(next[0]);
        }}
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </label>
  );
}
