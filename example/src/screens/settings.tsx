// 設定の画面（管理者向け）
import { useHelpPage } from "md-help-kit";
import { type ReactNode, useState } from "react";

export function SettingsScreen(): ReactNode {
  useHelpPage("settings");
  const [saved, setSaved] = useState(false);
  return (
    <section className="demo-screen" aria-labelledby="settings-title">
      <h1 id="settings-title">設定</h1>
      <form
        className="demo-form"
        onChange={() => setSaved(false)}
        onSubmit={(event) => {
          event.preventDefault();
          setSaved(true);
        }}
      >
        <fieldset>
          <legend>在庫の警告</legend>
          <label className="demo-check">
            <input type="checkbox" name="notify" defaultChecked />
            在庫が発注点以下になったら通知する
          </label>
          <label className="demo-field">
            <span>通知先</span>
            <input type="text" name="to" defaultValue="stock@example.com" />
          </label>
        </fieldset>
        <fieldset>
          <legend>一覧の表示</legend>
          <label className="demo-field">
            <span>表示する件数</span>
            <select name="pageSize" defaultValue="50">
              <option value="20">20件</option>
              <option value="50">50件</option>
              <option value="100">100件</option>
            </select>
          </label>
        </fieldset>
        <div className="demo-actions">
          <button type="submit" className="demo-primary">
            保存
          </button>
          {saved && <span role="status">保存しました。</span>}
        </div>
      </form>
    </section>
  );
}
