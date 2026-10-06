// useHelp と useHelpPage（DESIGN.md 5.2節、5.3節）
import { useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { HelpStoreContext } from "./provider.js";
import type { HelpStore } from "./store.js";
import type { HelpApi } from "./types.js";

function useStore(hookName: string): HelpStore {
  const store = useContext(HelpStoreContext);
  if (store === null) throw new Error(`${hookName}() must be used inside <HelpProvider>.`);
  return store;
}

/** ヘルプの状態と操作を返す */
export function useHelp(): HelpApi {
  const store = useStore("useHelp");
  const state = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  return useMemo(
    () => ({
      ...state,
      open: store.open,
      close: store.close,
      toggle: store.toggle,
      navigate: store.navigate,
      back: store.back,
      reload: store.reload,
      search: store.search,
    }),
    [store, state],
  );
}

// useHelpPage を呼んだコンポーネントがレンダーされた順。
// effect は子から先に実行されるため、マウントの順ではなくレンダーの順で優先を決める（同時にマウントされた親子では子が優先）
let renderOrder = 0;

/**
 * 「この画面のヘルプはこれ」と宣言する。null は宣言なし。
 * 複数のコンポーネントが宣言したときは、最後にマウントされたものが有効。
 */
export function useHelpPage(target: string | null): void {
  const store = useStore("useHelpPage");
  const [order] = useState(() => ++renderOrder);

  // アンマウント時に解除する。ターゲットの変更は下の effect で行い、スタック上の位置は変えない
  useEffect(() => () => store.removeScreen(order), [store, order]);
  useEffect(() => {
    store.setScreen(order, target);
  }, [store, order, target]);
}
