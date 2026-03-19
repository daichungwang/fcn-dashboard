import { getPoolItem } from "../core/pool.js?v=6";

function calcBufferPct(stock) {
  if (!stock || !stock.entry_price || !stock.ki_price) return null;
  return ((stock.entry_price - stock.ki_price) / stock.entry_price) * 100;
}

function getWorstStock(stocks) {
  if (!stocks || stocks.length === 0) return null;

  let worst = null;

  for (const stock of stocks) {
    const bufferPct = calcBufferPct(stock);

    if (bufferPct === null) continue;

    const stockWithBuffer = {
      ...stock,
      buffer_pct: bufferPct
    };

    if (!worst || stockWithBuffer.buffer_pct < worst.buffer_pct) {
      worst = stockWithBuffer;
    }
  }

  return worst;
}

function getHealthStatusByBuffer(bufferPct, poolCategory) {
  if (bufferPct === null) {
    return {
      label: "待確認",
      color: "#9e9e9e",
      riskHint: "缺少價格資料，暫時無法判斷"
    };
  }

  if (bufferPct <= 10) {
    return {
      label: "危險",
      color: "#e53935",
      riskHint: "距離下限價空間很小，需優先處理"
    };
  }

  if (bufferPct <= 20) {
    return {
      label: "觀察",
      color: "#fbc02d",
      riskHint: "已進入追蹤區，需持續注意變化"
    };
  }

  if (poolCategory === "high_vol") {
    return {
      label: "觀察",
      color: "#fbc02d",
      riskHint: "雖有緩衝，但最差標的是高波動股，仍需留意"
    };
  }

  return {
    label: "健康",
    color: "#43a047",
    riskHint: "距離下限價仍有安全空間"
  };
}

export function renderModule2Health(positions, pool) {
  if (!positions || positions.length === 0) {
    return `<p>目前沒有持倉</p>`;
  }

  const enriched = positions.map(position => {
    const worstStock = getWorstStock(position.stocks || []);
    const poolItem = worstStock ? getPoolItem(pool, worstStock.symbol) : null;
    const poolCategory = poolItem ? poolItem.category : "unknown";
    const health = getHealthStatusByBuffer(
      worstStock ? worstStock.buffer_pct : null,
      poolCategory
    );

    return {
      ...position,
      worst_stock: worstStock,
      worst_category: poolCategory,
      health
    };
  });

  enriched.sort((a, b) => {
    const aBuffer = a.worst_stock?.buffer_pct ?? 999;
    const bBuffer = b.worst_stock?.buffer_pct ?? 999;
    return aBuffer - bBuffer;
  });

  let healthy = 0;
  let watch = 0;
  let danger = 0;

  for (const item of enriched) {
    if (item.health.label === "健康") healthy += 1;
    if (item.health.label === "觀察") watch += 1;
    if (item.health.label === "危險") danger += 1;
  }

  const total = enriched.length;
  const topRisk = enriched[0];

  const warning = topRisk && topRisk.worst_stock
    ? `
      <div style="
        background:#ffebee;
        border:1px solid #e53935;
        border-radius:10px;
        padding:12px;
        margin-bottom:16px;
      ">
        <strong>⚠️ 最需處理：</strong> ${topRisk.id}<br>
        Worst-of：${topRisk.worst_stock.symbol}<br>
        距下限價：${topRisk.worst_stock.buffer_pct.toFixed(1)}%<br>
        狀態：<span style="color:${topRisk.health.color}; font-weight:bold">${topRisk.health.label}</span>
      </div>
    `
    : "";

  const summary = `
    <div style="
      border:1px solid #ccc;
      border-radius:10px;
      padding:12px;
      margin-bottom:16px;
    ">
      <strong>持倉健康總覽</strong><br>
      健康：${healthy}（${Math.round((healthy / total) * 100)}%）｜
      觀察：${watch}（${Math.round((watch / total) * 100)}%）｜
      危險：${danger}（${Math.round((danger / total) * 100)}%）
    </div>
  `;

  const cards = enriched.map(position => {
    const worst = position.worst_stock;

    return `
      <div style="
        border:1px solid #ddd;
        border-radius:10px;
        padding:12px;
        margin-bottom:12px;
      ">
        <strong>${position.id}</strong><br>
        標的：${(position.stocks || []).map(s => s.symbol).join(", ")}<br>
        Worst-of：${worst ? worst.symbol : "未判定"}<br>
        Worst 類別：${position.worst_category}<br>
        距下限價：${worst ? worst.buffer_pct.toFixed(1) + "%" : "未提供"}<br>
        狀態：<span style="color:${position.health.color}; font-weight:bold">${position.health.label}</span><br>
        風險提示：${position.health.riskHint}
      </div>
    `;
  }).join("");

  return `
    ${warning}
    ${summary}
    ${cards}
  `;
}
