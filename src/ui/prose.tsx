// 本文（.mhk-prose）の要素の差し替え（DESIGN.md 9.5節）。HelpContent の overrides に渡す
import {
  type BlockquoteHTMLAttributes,
  type ComponentType,
  createContext,
  type InputHTMLAttributes,
  type ReactNode,
  type TableHTMLAttributes,
  useContext,
} from "react";
import { alertIcons } from "./icons.js";
import { type HelpLabels, resolveLabels } from "./labels.js";

/** 注意書きのラベルを渡すため。overrides の部品を作り直さずに文言を切り替えられる */
export const LabelsContext = createContext<HelpLabels>(resolveLabels());

/** 表を横スクロールできる枠で包む。キーボードでもスクロールできるよう、枠にフォーカスできるようにする */
function Table(props: TableHTMLAttributes<HTMLTableElement>): ReactNode {
  return (
    <div className="mhk-table" tabIndex={0}>
      <table {...props} />
    </div>
  );
}

type BlockquoteProps = BlockquoteHTMLAttributes<HTMLQuoteElement> & { "data-mhk-alert"?: string };

/** 注意書きは、種別ごとのアイコンとラベルを付けた箱にする。普通の引用はそのまま */
function Blockquote(props: BlockquoteProps): ReactNode {
  const labels = useContext(LabelsContext);
  const kind = props["data-mhk-alert"];
  if (kind === undefined || !(kind in labels.alerts)) return <blockquote {...props} />;
  const Icon = alertIcons[kind];
  return (
    <div className="mhk-alert" data-mhk-alert={kind} role="note">
      <p className="mhk-alert-title">
        {Icon && <Icon />}
        {labels.alerts[kind as keyof HelpLabels["alerts"]]}
      </p>
      <div className="mhk-alert-body">{props.children}</div>
    </div>
  );
}

/** タスクリストのチェックボックスは操作できないようにする */
function Input(props: InputHTMLAttributes<HTMLInputElement>): ReactNode {
  return <input {...props} disabled />;
}

export const proseOverrides: Readonly<Record<string, ComponentType<any>>> = {
  table: Table,
  blockquote: Blockquote,
  input: Input,
};
