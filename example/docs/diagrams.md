# 図の見本

言語名が `mermaid` のコードブロックは、`codeBlocks.mermaid` に登録した `MermaidBlock` で図になります。図はドロワーのライトとダークに合わせて描かれます。

## 受注の状態

```mermaid
flowchart LR
  accTitle: 受注の状態の移り変わり
  A[手配中] --> B[出荷待ち] --> C[完了]
  A -->|取消| D[取消済み]
```

## 一括更新の流れ

```mermaid
sequenceDiagram
  accTitle: 一括更新の流れ
  actor U as 担当者
  participant S as 受注一覧
  participant API as サーバー
  U->>S: 行を選んで「一括更新」
  S->>API: 変更後の状態を送る
  API-->>S: 完了済みの行を除いて更新
  S-->>U: 更新した件数を表示
```

## 記法の誤り

記法に誤りがあると、図の代わりにエラー文と元のコードを表示します。

```mermaid
flowchart TD
  A[受注] -->
```
