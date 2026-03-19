import { totalDecisionScore } from "../core/scoring.js";
import { getPoolItem, getCategoryScore } from "../core/pool.js";

export function renderModule3Decision(positions, pool) {
  if (!positions || positions.length === 0) {
    return `<p>目前沒有決策資料</p>`;
  }

  return positions.map(p => {
    const result = totalDecisionScore(p);

    const worst = getPoolItem(pool, p.worst_of);
    const worstCategory = worst ? worst.category : "unknown";
    const worstScore = worst ? getCategoryScore(worst.category) : 0;

    const finalScore = result.totalScore === -999 ? -999 : result.totalScore + worstScore;

    let finalDecision = result.decision;
    if (finalScore === -999) finalDecision = "不做";
    else if (finalScore >= 10) finalDecision = "可做";
    else if (finalScore < 4) finalDecision = "不做";
    else finalDecision = "觀察";

    return `
      <div style="margin-bottom:16px;">
        <strong>${p.id}</strong>｜
        利率分數：${result.couponScore}｜
        天期分數：${result.tenorScore}｜
        KI分數：${result.kiScore}｜
        Strike分數：${result.strikeScore}｜
        Worst類別：${worstCategory}｜
        Worst分數：${worstScore}｜
        最終總分：${finalScore}｜
        建議：${finalDecision}
      </div>
    `;
  }).join("");
}
