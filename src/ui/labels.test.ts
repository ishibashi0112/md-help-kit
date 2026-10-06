import { describe, expect, it } from "vitest";
import { jaLabels, resolveLabels } from "./labels.js";

describe("resolveLabels", () => {
  it("省略したら英語の標準", () => {
    expect(resolveLabels().title).toBe("Help");
    expect(resolveLabels().alerts.warning).toBe("Warning");
  });

  it("渡した項目だけを標準に重ねる（注意書きのラベルも項目ごと）", () => {
    const labels = resolveLabels({ title: "使い方", alerts: { warning: "要注意" } });
    expect(labels.title).toBe("使い方");
    expect(labels.close).toBe("Close");
    expect(labels.alerts).toEqual({
      note: "Note",
      tip: "Tip",
      important: "Important",
      warning: "要注意",
      caution: "Caution",
    });
  });

  it("jaLabels はすべての項目を日本語で持つ", () => {
    expect(resolveLabels(jaLabels)).toEqual(jaLabels);
    expect(jaLabels.alerts).toEqual({
      note: "補足",
      tip: "ヒント",
      important: "重要",
      warning: "警告",
      caution: "危険",
    });
  });
});
