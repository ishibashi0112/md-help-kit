// HelpContent（DESIGN.md 5.4節）。現在のページを描画する、スタイルなしのコンポーネント
import {
  type AnchorHTMLAttributes,
  type ComponentType,
  createContext,
  createElement,
  type ImgHTMLAttributes,
  type MouseEvent,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
} from "react";
import { classifyLink } from "./links.js";
import { collectLinkTargets, renderMarkdown } from "./markdown.js";
import { HelpRenderConfigContext, HelpStoreContext } from "./provider.js";
import { isComponentName } from "./sanitize.js";
import type { HelpStore } from "./store.js";
import { devWarnOnce, isDevelopment } from "./warn.js";

export interface HelpContentProps {
  className?: string;
  /**
   * 標準の要素（a、table、img、blockquote など）の差し替え。名前が小文字のものだけが有効。
   * a と img を差し替えたときも、リンクの扱い（5.5節）と画像の解決はこちらで行い、その結果を props で渡す
   */
  overrides?: Readonly<Record<string, ComponentType<any>>>;
}

interface ContentContextValue {
  store: HelpStore;
  pageId: string;
  overrides: Readonly<Record<string, ComponentType<any>>>;
}

const ContentContext = createContext<ContentContextValue | null>(null);

/**
 * 現在のページを描画する。ページの取得が終わっていない、ページがない、取得に失敗したときは何も描画しない
 * （状態ごとの表示はドロワーが担当する）。
 */
export function HelpContent({ className, overrides }: HelpContentProps): ReactNode {
  const store = useContext(HelpStoreContext);
  if (store === null) throw new Error("HelpContent must be used inside <HelpProvider>.");
  const config = useContext(HelpRenderConfigContext);
  const { current } = useSyncExternalStore(store.subscribe, store.getState, store.getState);
  const navigation = useSyncExternalStore(store.subscribe, store.getNavigation, store.getNavigation);
  const rootRef = useRef<HTMLDivElement>(null);

  const pageId = current?.id;
  const headingId = current?.headingId ?? null;
  const doc = current?.status === "ready" ? store.getDocument(current.id) : undefined;

  const userOverrides = useMemo(() => {
    const result: Record<string, ComponentType<any>> = {};
    for (const [name, component] of Object.entries(overrides ?? {})) {
      if (isComponentName(name)) {
        devWarnOnce(
          `HelpContent overrides: "${name}" was ignored because only standard elements (lowercase) can be overridden. Register custom tags in components.`,
        );
      } else {
        result[name] = component;
      }
    }
    return result;
  }, [overrides]);

  const content = useMemo(
    () =>
      doc &&
      renderMarkdown(doc, {
        allowedTags: config.allowedTags,
        components: config.components,
        codeBlocks: config.codeBlocks,
        overrides: { ...userOverrides, a: HelpLink, img: HelpImage },
      }),
    [doc, config, userOverrides],
  );

  const contextValue = useMemo(
    () => (pageId === undefined ? null : { store, pageId, overrides: userOverrides }),
    [store, pageId, userOverrides],
  );

  // ページが変わったときと、移動したときにスクロールする。見出しがあればその見出し、なければ本文の先頭
  // navigation は、同じ見出しへの移動でもスクロールし直すために依存に入れる
  useEffect(() => {
    const root = rootRef.current;
    if (root === null || doc === undefined) return;
    if (headingId === null) {
      root.scrollIntoView?.({ block: "start" });
      return;
    }
    const heading = findById(root, headingId);
    if (heading) {
      heading.scrollIntoView?.({ block: "start" });
    } else {
      devWarnOnce(`The heading "${headingId}" was not found in the help page "${pageId}".`);
    }
  }, [doc, pageId, headingId, navigation]);

  // 開発時だけ、リンク先の見出しとページが存在するかを確かめる（11章）
  useEffect(() => {
    const root = rootRef.current;
    if (!isDevelopment() || root === null || doc === undefined || pageId === undefined) return;

    const ids = new Set([...root.querySelectorAll("[id]")].map((element) => element.id));
    for (const href of collectLinkTargets(doc)) {
      const link = classifyLink(href, pageId);
      if (link.type === "anchor" && !ids.has(link.headingId)) {
        devWarnOnce(
          `The help page "${pageId}" has a link to the heading "${link.headingId}", which was not found.`,
        );
      }
      if (link.type === "page") {
        const target = link.target.split("#")[0] ?? "";
        void store.checkPage(target).then((exists) => {
          if (!exists) {
            devWarnOnce(
              `The help page "${pageId}" has a link to the help page "${target}", which does not exist.`,
            );
          }
        });
      }
    }
  }, [store, doc, pageId]);

  if (doc === undefined || contextValue === null) return null;
  return (
    <ContentContext.Provider value={contextValue}>
      <div ref={rootRef} className={className}>
        {content}
      </div>
    </ContentContext.Provider>
  );
}

function useContentContext(): ContentContextValue {
  const value = useContext(ContentContext);
  if (value === null) throw new Error("This component must be used inside <HelpContent>.");
  return value;
}

/** リンク。5.5節の規則で、ドロワー内の移動、見出しへのスクロール、新しいタブ、通常のリンクに分ける */
function HelpLink(props: AnchorHTMLAttributes<HTMLAnchorElement>): ReactNode {
  const { store, pageId, overrides } = useContentContext();
  const anchor = overrides.a ?? "a";
  const { href } = props;
  if (typeof href !== "string") return createElement(anchor, props);

  const link = classifyLink(href, pageId);
  switch (link.type) {
    case "page":
    case "anchor": {
      const target = link.type === "page" ? link.target : `#${link.headingId}`;
      // 修飾キーを押していても、ドロワー内で移動する（md のパスは、アプリの URL としては開けないため）
      const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        store.navigate(target);
      };
      return createElement(anchor, { ...props, onClick });
    }
    case "external":
      return createElement(anchor, { ...props, target: "_blank", rel: "noreferrer noopener" });
    default:
      return createElement(anchor, props);
  }
}

const SCHEME = /^[a-z][a-z\d+.-]*:/i;

/** 画像。相対パスは取得元の resolveAsset で表示用の URL にする */
function HelpImage(props: ImgHTMLAttributes<HTMLImageElement>): ReactNode {
  const { store, pageId, overrides } = useContentContext();
  const image = overrides.img ?? "img";
  const { src } = props;
  const resolveAsset = store.getSource().resolveAsset;
  if (typeof src !== "string" || resolveAsset === undefined || SCHEME.test(src) || src.startsWith("//")) {
    return createElement(image, props);
  }
  // 取得元は利用者のコードで信頼できるため、解決後のURLは検査し直さない
  return createElement(image, { ...props, src: resolveAsset.call(store.getSource(), pageId, src) });
}

function findById(root: HTMLElement, id: string): Element | undefined {
  return [...root.querySelectorAll("[id]")].find((element) => element.id === id);
}
