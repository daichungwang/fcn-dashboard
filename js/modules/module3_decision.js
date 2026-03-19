import { totalDecisionScore } from "../core/scoring.js";

export function renderModule3Decision(positions) {
  if (!positions || positions.length === 0) {
    return `<p>目前沒有決策資料</p>`;
  }

  return positions.map(p => {
    const result = totalDecisionScore(p);

    return `
      <div style="margin-bottom:12px;">
        <strong>${p.id}</strong>｜
        利率分數：${result.couponScore}｜
        天期分數：${result.tenorScore}｜
        總分：${result.totalScore}｜
        建議：${result.decision}
      </div>
    `;
  }).join("");
}
