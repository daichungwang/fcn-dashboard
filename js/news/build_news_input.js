import { normalizeNewsWithAI } from "./ai_normalizer.js";

export async function buildNewsInput(rawList) {
  const result = [];

  for (let i = 0; i < rawList.length; i++) {
    const raw = rawList[i];

    const ai = await normalizeNewsWithAI(raw);

    result.push({
      id: "N" + String(i + 1).padStart(3, "0"),
      title: raw.title,
      summary: raw.summary,
      source: raw.source,
      published_at: raw.published_at,

      type: ai.type,
      subtype: ai.subtype,
      sid_label: ai.sid_label,
      sid_score: ai.sid_score,

      affected_sectors: ai.affected_sectors,
      affected_subsectors: [],
      affected_categories: [],

      duration: 7,
      confidence: 0.8,
      is_active: true
    });
  }

  return result;
}
