// 在庫照会の画面
import { useHelpPage } from "md-help-kit";
import { HelpButton } from "md-help-kit/ui";
import type { ReactNode } from "react";

const items = [
  { code: "P-001", name: "段ボール箱（大）", stock: 0, reorderPoint: 50 },
  { code: "P-002", name: "緩衝材", stock: 35, reorderPoint: 40 },
  { code: "P-003", name: "梱包テープ", stock: 220, reorderPoint: 60 },
  { code: "P-004", name: "送り状", stock: 18, reorderPoint: 100 },
  { code: "P-005", name: "段ボール箱（小）", stock: 140, reorderPoint: 80 },
];

/** 在庫数の色（ヘルプの stock/colors に説明がある）。色だけに頼らないよう、文字も付ける */
function level(stock: number, reorderPoint: number): { className: string; text: string } | null {
  if (stock === 0) return { className: "demo-badge demo-badge-out", text: "欠品" };
  if (stock <= reorderPoint) return { className: "demo-badge demo-badge-low", text: "少" };
  return null;
}

export function StockScreen(): ReactNode {
  useHelpPage("stock");
  return (
    <section className="demo-screen" aria-labelledby="stock-title">
      <h1 id="stock-title">在庫照会</h1>
      <div className="demo-table">
        <table>
          <thead>
            <tr>
              <th scope="col">品番</th>
              <th scope="col">品名</th>
              <th scope="col" className="demo-number">
                在庫数
              </th>
              <th scope="col" className="demo-number">
                発注点
              </th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const badge = level(item.stock, item.reorderPoint);
              return (
                <tr key={item.code}>
                  <td>{item.code}</td>
                  <td>{item.name}</td>
                  <td className="demo-number">
                    {badge === null ? item.stock : <span className={badge.className}>{item.stock}（{badge.text}）</span>}
                  </td>
                  <td className="demo-number">{item.reorderPoint}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="demo-note">
        {/* target を指定すると、画面の宣言とは別のページを開く */}
        <HelpButton target="stock/colors" className="demo-help-link">
          在庫数の色について
        </HelpButton>
      </p>
    </section>
  );
}
