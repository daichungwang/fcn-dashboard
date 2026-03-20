export function renderModule3(data) {
  const container = document.getElementById("module3-decision");
  if (!container) return;

  const pool = data.pool || [];

  // === 分類 ===
  const groups = {
    core: [],
    defensive: [],
    balanced: [],
    income: [],
    avoid: []
  };

  pool.forEach(s => {
    const cat = s.category || "balanced";
    if (groups[cat]) groups[cat].push(s);
  });

  // === 建議邏輯 ===
  function getRecommend(list) {
    return list.filter(s => (s.pref || 0) >= 80);
  }

  // === 卡片 ===
  function renderCard(title, key, list) {
    const recommend = getRecommend(list);
    const percent = list.length
      ? Math.round((recommend.length / list.length) * 100)
      : 0;

    return `
      <div style="
        background:#fff;
        border-radius:12px;
        padding:12px;
        margin-bottom:12px;
        box-shadow:0 2px 6px rgba(0,0,0,0.1);
      ">

        <div onclick="toggleM3('${key}')" style="
          display:flex;
          justify-content:space-between;
          font-weight:bold;
          cursor:pointer;
        ">
          <div>${title}</div>
          <div>${recommend.length}/${list.length}（${percent}%）</div>
        </div>

        <div id="m3-${key}" style="display:none;margin-top:10px;">
          ${
            recommend.length === 0
              ? "<p>無建議</p>"
              : recommend.map(s => `
                <div style="
                  padding:8px;
                  border-top:1px solid #eee;
                ">
                  ${s.symbol} ｜ pref ${s.pref} ｜ risk ${s.risk}
                </div>
              `).join("")
          }
        </div>

      </div>
    `;
  }

  // === 主畫面 ===
  container.innerHTML = `
    <div style="padding:16px">

      <h3>Module3-A｜分類決策</h3>

      ${renderCard("核心", "core", groups.core)}
      ${renderCard("防守", "defensive", groups.defensive)}
      ${renderCard("平衡", "balanced", groups.balanced)}
      ${renderCard("收益", "income", groups.income)}
      ${renderCard("避免", "avoid", groups.avoid)}

    </div>
  `;

  // === 展開功能 ===
  window.toggleM3 = function (key) {
    const el = document.getElementById("m3-" + key);
    if (!el) return;
    el.style.display = el.style.display === "none" ? "block" : "none";
  };
}
