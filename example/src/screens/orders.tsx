// 受注一覧の画面。一括更新のダイアログを開いている間は、ダイアログの見出しをヘルプのページにする
import { useHelpPage } from "md-help-kit";
import { type ReactNode, useEffect, useRef, useState } from "react";

const statuses = ["手配中", "出荷待ち", "完了"] as const;
type Status = (typeof statuses)[number];

interface Order {
  id: string;
  customer: string;
  status: Status;
  shipDate: string;
}

const initialOrders: Order[] = [
  { id: "A-10231", customer: "山田商店", status: "出荷待ち", shipDate: "2026-10-12" },
  { id: "A-10232", customer: "北辰工業", status: "手配中", shipDate: "" },
  { id: "A-10233", customer: "みなと物産", status: "完了", shipDate: "2026-10-02" },
  { id: "A-10234", customer: "山田商店", status: "手配中", shipDate: "2026-10-15" },
  { id: "A-10235", customer: "青葉電機", status: "出荷待ち", shipDate: "2026-10-09" },
];

export function OrdersScreen(): ReactNode {
  useHelpPage("orders");
  const [orders, setOrders] = useState(initialOrders);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [message, setMessage] = useState("");
  const openButtonRef = useRef<HTMLButtonElement>(null);

  // Ctrl + E（Mac では ⌘ + E）で一括更新を開く
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "e") {
        event.preventDefault();
        setDialogOpen(true);
      }
    };
    addEventListener("keydown", onKeyDown);
    return () => removeEventListener("keydown", onKeyDown);
  }, []);

  const keyword = filter.trim();
  const visible = orders.filter(
    (order) => keyword === "" || order.id.includes(keyword) || order.customer.includes(keyword),
  );

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    openButtonRef.current?.focus();
  };

  const save = (status: Status) => {
    // 完了済みの行は変更しない
    const skipped = orders.filter((order) => selected.has(order.id) && order.status === "完了").length;
    setOrders(
      orders.map((order) =>
        selected.has(order.id) && order.status !== "完了" ? { ...order, status } : order,
      ),
    );
    setMessage(
      `${selected.size - skipped}件を更新しました。` +
        (skipped > 0 ? `完了済みの${skipped}件は変更していません。` : ""),
    );
    setSelected(new Set());
    closeDialog();
  };

  return (
    <section className="demo-screen" aria-labelledby="orders-title">
      <h1 id="orders-title">受注一覧</h1>
      <div className="demo-toolbar">
        <input
          type="search"
          aria-label="受注番号か顧客名で絞り込み"
          placeholder="受注番号か顧客名で絞り込み"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
        />
        <button ref={openButtonRef} type="button" onClick={() => setDialogOpen(true)}>
          一括更新
        </button>
      </div>
      {message !== "" && (
        <p className="demo-message" role="status">
          {message}
        </p>
      )}
      <div className="demo-table">
        <table>
          <thead>
            <tr>
              <th scope="col">
                <span className="demo-visually-hidden">選択</span>
              </th>
              <th scope="col">受注番号</th>
              <th scope="col">顧客</th>
              <th scope="col">状態</th>
              <th scope="col">出荷予定日</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((order) => (
              <tr key={order.id}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${order.id} を選択`}
                    checked={selected.has(order.id)}
                    onChange={() => toggle(order.id)}
                  />
                </td>
                <td>{order.id}</td>
                <td>{order.customer}</td>
                <td>{order.status}</td>
                <td>{order.shipDate === "" ? "未定" : order.shipDate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {dialogOpen && <BulkUpdateDialog count={selected.size} onSave={save} onCancel={closeDialog} />}
    </section>
  );
}

function BulkUpdateDialog({
  count,
  onSave,
  onCancel,
}: {
  count: number;
  onSave: (status: Status) => void;
  onCancel: () => void;
}): ReactNode {
  // 開いている間は、受注一覧の宣言より優先される（閉じると orders に戻る）
  useHelpPage("orders#一括更新");
  const [status, setStatus] = useState<Status>("出荷待ち");

  return (
    // ヘルプのドロワーはこの背景より手前に出るので、ダイアログを開いたままヘルプを読める
    <div className="demo-backdrop">
      <div
        className="demo-dialog"
        role="dialog"
        aria-labelledby="bulk-update-title"
        onKeyDown={(event) => {
          if (event.key === "Escape") onCancel();
        }}
      >
        <h2 id="bulk-update-title">一括更新</h2>
        <p>{count === 0 ? "行が選択されていません。" : `${count}件を選択中です。`}</p>
        <label className="demo-field">
          <span>変更後の状態</span>
          <select
            autoFocus
            value={status}
            onChange={(event) => setStatus(event.target.value as Status)}
          >
            {statuses.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <div className="demo-actions">
          <button type="button" onClick={onCancel}>
            キャンセル
          </button>
          <button
            type="button"
            className="demo-primary"
            disabled={count === 0}
            onClick={() => onSave(status)}
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
