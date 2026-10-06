// デモの画面と切り替えの状態。URL のクエリに持ち、再読み込みしても残す
import { useMemo, useSyncExternalStore } from "react";

export type Screen = "orders" | "stock" | "settings";

export interface DemoState {
  /** 表示中の画面 */
  screen: Screen;
  /** ヘルプの取得元 */
  source: "bundled" | "remote";
  /** ドロワーとボタンの文言 */
  lang: "en" | "ja";
  /** ライトとダーク。system は OS の設定に従う */
  theme: "system" | "light" | "dark";
  /** ドロワーを表示する側 */
  side: "right" | "left";
}

// 先頭が既定値。既定値はクエリに書かない
const choices: { [K in keyof DemoState]: readonly DemoState[K][] } = {
  screen: ["orders", "stock", "settings"],
  source: ["bundled", "remote"],
  lang: ["ja", "en"],
  theme: ["system", "light", "dark"],
  side: ["right", "left"],
};

const keys = Object.keys(choices) as (keyof DemoState)[];

function parse(search: string): DemoState {
  const params = new URLSearchParams(search);
  const pick = <K extends keyof DemoState>(key: K): DemoState[K] => {
    const value = params.get(key);
    return choices[key].find((choice) => choice === value) ?? choices[key][0]!;
  };
  return {
    screen: pick("screen"),
    source: pick("source"),
    lang: pick("lang"),
    theme: pick("theme"),
    side: pick("side"),
  };
}

export function isScreen(value: unknown): value is Screen {
  return choices.screen.some((screen) => screen === value);
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  addEventListener("popstate", listener);
  return () => {
    listeners.delete(listener);
    removeEventListener("popstate", listener);
  };
}

export function useDemoState(): DemoState {
  const search = useSyncExternalStore(subscribe, () => location.search);
  return useMemo(() => parse(search), [search]);
}

/** 状態を変えて URL に書く。画面の移動はブラウザの履歴に積み、切り替えは置き換える */
export function updateDemoState(patch: Partial<DemoState>): void {
  const current = parse(location.search);
  const next = { ...current, ...patch };
  const params = new URLSearchParams();
  for (const key of keys) {
    if (next[key] !== choices[key][0]) params.set(key, next[key]);
  }
  const query = params.toString();
  const url = `${location.pathname}${query === "" ? "" : `?${query}`}`;
  if (next.screen !== current.screen) history.pushState(null, "", url);
  else history.replaceState(null, "", url);
  for (const listener of listeners) listener();
}
