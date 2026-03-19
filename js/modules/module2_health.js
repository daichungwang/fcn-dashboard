import { getPoolItem } from "../core/pool.js?v=5";

function getHealthStatus(position, pool) {
  const worst = getPoolItem(pool, position.worst_of);

  if (!worst) {
    return { label: "待確認", color: "#999", category: "unknown" };
  }

  if (worst.category === "high_vol") {
    return { label: "危險", color: "#e53935", category: worst.category };
  }

  if (worst.category === "defensive") {
    return { label: "健康", color: "#43a047", category: worst.category };
  }

  return { label: "觀察", color: "#fbc02d", category: worst.category };
}

export function renderModule2Health(positions, pool) {
  if (!positions || positions.length === 0) {
    return `<p>目前沒有持倉</p>`;
  }

  let healthy = 0;
  let watch = 0;
  let danger = 0;

  const cards = positions.map(p => {
    const h = getHealthStatus(p, pool);

    if (h.label === "健康") healthy++;
    if (h.label === "觀察") watch++;
    if (h.label === "危險") danger++;

    return `
      <div style="
        border:1px solid #ddd;
        border-radius:10px;
        padding:12px;
        margin-bottom:12px;
      ">
        <strong>${p.id}</strong><br>
        標的：${p.symbols.join(", ")}<br>
        Worst-of：${p.worst_of}<br>
        類別：${h.category}<br>
        狀態：<span style="color:${h.color}; font-weight:bold">${h.label}</span>
      </div>
    `;
  }).join("");

  const total = positions.length;

  return `
    <div style="
      border:1px solid #ccc;
      border-radius:10px;
      padding:12px;
      margin-bottom:16px;
    ">
      <strong>持倉健康總覽</strong><br>
      健康：${healthy}（${Math.round(healthy/total*100)}%）｜
      觀察：${watch}（${Math.round(watch/total*100)}%）｜
      危險：${danger}（${Math.round(danger/total*100)}%）
    </div>

    ${cards}
  `;
}
