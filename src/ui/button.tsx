// HelpButton（DESIGN.md 9.2節）
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useMemo } from "react";
import { useHelp } from "../core/index.js";
import { HelpIcon } from "./icons.js";
import { type HelpLabelsInput, resolveLabels } from "./labels.js";

export interface HelpButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "type"> {
  /**
   * 開くページを固定する。ドロワーが開いていて、そのページを表示中なら閉じ、別のページなら移動する。
   * 省略時は toggle()
   */
  target?: string;
  /** 文言。children を渡さないときの aria-label に使う */
  labels?: HelpLabelsInput;
  /** ボタンの中身。省略時はヘルプのアイコン */
  children?: ReactNode;
}

export function HelpButton({
  target,
  labels: labelsInput,
  children,
  className,
  ...rest
}: HelpButtonProps): ReactNode {
  const help = useHelp();
  const labels = useMemo(() => resolveLabels(labelsInput), [labelsInput]);

  const onClick = () => {
    if (target === undefined) {
      help.toggle();
      return;
    }
    const pageId = target.split("#")[0];
    if (help.isOpen && help.current?.id === pageId) help.close();
    else help.open(target);
  };

  return (
    <button
      type="button"
      className={className === undefined ? "mhk-button" : `mhk-button ${className}`}
      aria-label={children === undefined ? labels.openHelp : undefined}
      aria-expanded={help.isOpen}
      {...rest}
      onClick={onClick}
    >
      {children ?? <HelpIcon />}
    </button>
  );
}
