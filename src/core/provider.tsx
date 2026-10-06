// HelpProvider（DESIGN.md 5.1節）
import { type ComponentType, createContext, type ReactNode, useEffect, useMemo, useState } from "react";
import { createHelpStore, type HelpStore, type IndexLoading } from "./store.js";
import type { HelpCodeBlockProps, HelpSource } from "./types.js";

export interface HelpProviderProps {
  /** ヘルプのmdの取得元。レンダーのたびに作り直さないこと（変わるとキャッシュを捨てて取得し直す） */
  source: HelpSource;
  /** 画面に紐付くページがないときに開くページ。省略時は目次の先頭 */
  defaultPage?: string;
  /**
   * 目次を取得する時期。
   * - mount（既定）: HelpProvider のマウント時
   * - open: 最初に open、toggle、navigate、search のいずれかを使ったとき
   *
   * マウント後の変更は反映しない。
   */
  indexLoading?: IndexLoading;
  /** md内で使える独自タグ（6.1節） */
  components?: Readonly<Record<string, ComponentType<any>>>;
  /** 言語名ごとのコードブロックの描画（6.2節） */
  codeBlocks?: Readonly<Record<string, ComponentType<HelpCodeBlockProps>>>;
  /** md内で使える HTML タグの追加（7章） */
  allowedTags?: readonly string[];
  children?: ReactNode;
}

/** HelpContent が描画に使う設定 */
export type HelpRenderConfig = Pick<HelpProviderProps, "components" | "codeBlocks" | "allowedTags">;

export const HelpStoreContext = createContext<HelpStore | null>(null);
export const HelpRenderConfigContext = createContext<HelpRenderConfig>({});

export function HelpProvider({
  source,
  defaultPage,
  indexLoading,
  components,
  codeBlocks,
  allowedTags,
  children,
}: HelpProviderProps): ReactNode {
  const [store] = useState(() => createHelpStore({ source, defaultPage, indexLoading }));

  useEffect(() => {
    store.setSource(source);
  }, [store, source]);
  useEffect(() => {
    store.setDefaultPage(defaultPage);
  }, [store, defaultPage]);
  useEffect(() => {
    store.start();
  }, [store]);

  const renderConfig = useMemo(
    () => ({ components, codeBlocks, allowedTags }),
    [components, codeBlocks, allowedTags],
  );

  return (
    <HelpStoreContext.Provider value={store}>
      <HelpRenderConfigContext.Provider value={renderConfig}>{children}</HelpRenderConfigContext.Provider>
    </HelpStoreContext.Provider>
  );
}
