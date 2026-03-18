document.addEventListener("DOMContentLoaded", () => {

  Promise.all([
    fetch("positions.json").then(res => res.json()),
    fetch("pool.json").then(res => res.json())
  ])
  .then(([positions, pool]) => {

    // 建立快速查表
    const poolMap = {};
    pool.forEach(p => {
      poolMap[p.symbol] = p;
    });

    const results = positions.map(fcn => {

      const stocks = fcn.stocks;
      const rate = fcn.rate;
      const duration = fcn.duration;
      const strike = fcn.strike || 65;
      const barrier = fcn.barrier || strike;

      // ===== 股票名稱 =====
      const stockNames = stocks.map(s => s.symbol).join(" / ");

      // ===== 排序（Worst-of）=====
      const sorted = [...stocks].sort((a, b) => a.score - b.score);

      let worstList = [];
      if (stocks.length === 3) worstList = [sorted[0]];
      else if (stocks.length >= 4) worstList = [sorted[0], sorted[1]];
      else worstList = [sorted[0]];

      // ===== 同級判斷 =====
      let penalty = 0;
      if (worstList.length === 2) {
        if (worstList[0].score === worstList[1].score) {
          penalty = -2;
        } else {
          // 不同級 → 只取最差
          worstList = [worstList[0]];
        }
      }

      const worstSymbols = worstList.map(s => s.symbol).join(" / ");

      // ===== Pool 風險分數 =====
      let poolScore = 0;
      let highRiskCount = 0;

      worstList.forEach(s => {
        const p = poolMap[s.symbol];
        if (p) {
          poolScore += p.score;
          if (p.category === "高波動") highRiskCount++;
        }
      });

      // 高波動集中風險
      if (highRiskCount >= 2) {
        poolScore -= 2;
      }

      // ===== 利率 =====
      let rateScore =
        rate < 10 ? -999 :
        rate < 12 ? -4 :
        rate < 15 ? -2 :
        rate < 16 ? 0 :
        rate < 18 ? 3 :
        rate < 20 ? 5 :
        rate < 24 ? 8 : 10;

      // ===== 天期（版本A）=====
      let durationScore =
        duration <= 3 ? 5 :
        duration <= 5 ? 2 :
        duration === 6 ? 0 :
        duration <= 9 ? -2 :
        duration <= 12 ? -5 : -999;

      // ===== KI =====
      let kiScore =
        barrier <= 55 ? 8 :
        barrier <= 60 ? 4 :
        barrier <= 65 ? 0 :
        barrier <= 70 ? -4 :
        barrier <= 75 ? -8 : -999;

      // ===== Strike =====
      let strikeScore =
        strike <= 60 ? 10 :
        strike <= 65 ? 5 :
        strike <= 67 ? -1 :
        strike <= 70 ? -3 :
        strike <= 75 ? -5 :
        strike <= 80 ? -10 : -999;

      // ===== Gap =====
      const gap = strike - barrier;
      let gapScore =
        gap >= 15 ? 3 :
        gap >= 10 ? 0 : -5;

      // ===== 總分 =====
      const total =
        rateScore +
        durationScore +
        kiScore +
        strikeScore +
        gapScore +
        penalty +
        poolScore;

      // ===== 顏色 =====
      let level = "";
      if (total >= 10) level = "🟢";
      else if (total >= 6) level = "⚠️";
      else level = "❌";

      return {
        id: fcn.id,
        total,
        rate,
        duration,
        worst: worstSymbols,
        level
      };

    });

    // 排序
    results.sort((a, b) => b.total - a.total);

    let html = "";

    results.forEach(r => {
      html += `
      <div style="margin-bottom:10px">
      ${r.level} ${r.id}（${r.total}分）<br>
      → 利率：${r.rate}%<br>
      → 天期：${r.duration}月<br>
      → Worst-of：${r.worst}
      </div>
      `;
    });

    const best = results[0];

    html += `
    <hr>
    🏆 最佳選擇：${best.id}
    `;

    document.getElementById("healthBox").innerHTML = html;

  });

});
