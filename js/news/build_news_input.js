import { normalizeNewsWithAI } from "./ai_normalizer.js";

/* =========================
   Rule-based fallback
========================= */
function fallbackRule(raw, index) {
  const text = (raw.title + " " + raw.summary).toLowerCase();

  let type = "macro";
  let subtype = "中性";
  let score = 0;
  let sectors = [];

  if (text.includes("rate") || text.includes("fed")) {
    subtype = "利率變動";
    score = text.includes("cut") ? 2 : -2;
    sectors = ["AI_SEMI", "PLATFORM", "ETF"];
  }

  if (text.includes("oil")) {
    subtype = "油價變動";
    score = text.includes("rise") ? -2 : 2;
    sectors = ["ENERGY", "TRAVEL"];
  }

  if (text.includes("ai")) {
    type = "industry";
    subtype = "AI需求";
    score = 2;
    sectors = ["AI_SEMI", "AI_APPLICATION"];
  }

  return {
    id: "N" + String(index).padStart(3, "0"),
    title: raw.title || "",
    summary: raw.summary || "",
    source: raw.source || "",
    published_at: raw.published_at || "",
    type,
    subtype,
    sid_label: score > 0 ? "利多" : score < 0 ? "利空" : "中性",
    sid_score: score,
    affected_sectors: sectors,
    affected_subsectors: [],
    affected_categories: [],
    duration: 7,
    confidence: 0.4,
    is_active: true
  };
}

/* =========================
   Main Builder（升級版）
========================= */
export async function buildNewsInput(rawNewsList = []) {
  const result = [];

  for (let i = 0; i < rawNewsList.length; i++) {
    const raw = rawNewsList[i];

    try {
      // ⭐ AI 優先
      const normalized = await normalizeNewsWithAI(raw, i + 1);
      result.push(normalized);
      console.log(`🤖 AI OK: ${normalized.id}`);
    } catch (err) {
      console.warn(`⚠️ AI失敗 → fallback`, err);

      // ⭐ fallback 啟動
      const fallback = fallbackRule(raw, i + 1);
      result.push(fallback);
    }
  }

  console.log("🧾 最終 news_input =", result);
  return result;
}
