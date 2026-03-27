import { normalizeNewsWithAI } from "./ai_normalizer.js";
import { getCached, setCached } from "./news_cache.js";

/* =========================
   Builder（低成本版）
========================= */
export async function buildNewsInput(rawNewsList = []) {
  const result = [];

  // ⭐ 限量（只取前10）
  const limited = rawNewsList.slice(0, 10);

  for (let i = 0; i < limited.length; i++) {
    const raw = limited[i];

    try {
      // ⭐ cache 命中
      const cached = getCached(raw.title);
      if (cached) {
        console.log("⚡ cache 命中:", raw.title);
        result.push(cached);
        continue;
      }

      // ⭐ AI call
      const normalized = await normalizeNewsWithAI(raw, i + 1);

      // ⭐ 存 cache
      setCached(raw.title, normalized);

      result.push(normalized);
      console.log("🤖 AI:", normalized.id);

    } catch (err) {
      console.warn("⚠️ fallback:", raw.title);

      result.push({
        id: "N" + String(i + 1).padStart(3, "0"),
        title: raw.title,
        summary: raw.summary,
        source: raw.source,
        published_at: raw.published_at,
        type: "macro",
        subtype: "中性",
        sid_label: "中性",
        sid_score: 0,
        affected_sectors: [],
        affected_subsectors: [],
        affected_categories: [],
        duration: 7,
        confidence: 0.3,
        is_active: true
      });
    }
  }

  console.log("💰 成本控制後 news_input =", result);
  return result;
}
