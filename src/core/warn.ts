// 開発時の警告（DESIGN.md 11章）

// 型のためだけの宣言。`process.env.NODE_ENV` は利用者側のバンドラが置き換える
declare const process: { env: { NODE_ENV?: string } };

/** 開発時（`NODE_ENV` が production 以外）だけ `console.warn` を出す。文言は英語 */
export function devWarn(message: string): void {
  if (isDevelopment()) console.warn(`[md-help-kit] ${message}`);
}

const warned = new Set<string>();

/** devWarn と同じだが、同じ文言は1回だけ出す（描画のたびに繰り返さないため） */
export function devWarnOnce(message: string): void {
  if (warned.has(message)) return;
  warned.add(message);
  devWarn(message);
}

/** devWarnOnce で出した記録を消す。テスト用 */
export function resetDevWarnings(): void {
  warned.clear();
}

function isDevelopment(): boolean {
  try {
    return process.env.NODE_ENV !== "production";
  } catch {
    // バンドラが置き換えず、process もない環境では本番として扱う
    return false;
  }
}
