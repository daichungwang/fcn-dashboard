function calcDistanceToKiPct(stock) {
  if (!stock) return null;

  const currentPrice = Number(stock.price);
  const kiPrice = Number(stock.ki_price);

  if (!Number.isFinite(currentPrice) || !Number.isFinite(kiPrice) || kiPrice <= 0) {
    return null;
  }

  return ((currentPrice - kiPrice) / kiPrice) * 100;
}

function getPoolMap(pool) {
  const map = {};
  if (!Array.isArray(pool)) return map;

  pool.forEach((item) => {
    if (item && item.symbol) {
      map[item.symbol] = item;
    }
  });

  return map;
}

function enrichStocks(position, poolMap) {
  const stocks = Array.isArray(position.stocks) ? position.stocks : [];

  return stocks.map((stock) => {
    const poolInfo = poolMap[stock.symbol] || {};
    const distanceToKiPct = calcDistanceToKiPct(stock);

    return {
      ...stock,
      sector: poolInfo.sector || "-",
      category: poolInfo.category || "unknown",
      risk_level: poolInfo.risk_level || "unknown",
      fcn_preference: poolInfo.fcn_preference || "unknown",
      risk_score: poolInfo.risk_score ?? null,
      distance_to_ki_pct: distanceToKiPct
    };
  });
}

function getWorstStock(stocks) {
  if (!Array.isArray(stocks) || stocks.length === 0) return null;

  const valid = stocks.filter((s) => s.distance_to_ki_pct !== null);

  if (valid.length === 0) return null;

  valid.sort((a, b) => a.distance_to_ki_pct - b.distance_to_ki_pct);
  return valid[0];
}

function getHealthStatus(distancePct) {
  if (distancePct === null) {
    return {
      label: "待確認",
      color: "#9e9e9e",
      rank: 99,
      hint: "缺少價格資料，暫時無法判斷"
    };
  }

  if (distancePct <= 5) {
    return {
      label: "危險",
      color: "#d32f2f",
      rank: 1,
      hint: "已非常接近下限價，需優先處理"
    };
  }

  if (distancePct <= 15) {
    return {
      label: "追蹤",
      color: "#f57c00",
      rank: 2,
      hint: "距離下限價不遠，需持續追蹤"
    };
  }

  return {
    label: "健康",
    color: "#388e3c",
    rank: 3,
    hint: "距離下限價仍有安全空間"
  };
}

function enrichPositions(positions, pool) {
  const poolMap = getPoolMap(pool);

  return (Array.isArray(positions) ? positions : []).map((position) => {
    const stocks = enrichStocks(position, poolMap);
    const worstStock = getWorstStock(stocks);
    const health = getHealthStatus(worstStock ? worstStock.distance_to_ki_pct : null);

    return {
      ...position,
      stocks,
      worst_stock: worstStock,
      health
    };
  });
}

function sortByRisk(list) {
  return [...list].sort((a, b) => {
    const aRank = a.health?.rank ?? 99;
    const bRank = b.health?.rank ?? 99;
    if (aRank !== bRank) return aRank - bRank;

    const aDist = a.worst_stock?.distance_to_ki_pct ?? 9999;
    const bDist = b.worst_stock?.distance_to_ki_pct ?? 9999;
    return aDist - bDist;
  });
}

function formatPct(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "未提供";
  return `${Number(v).toFixed(1)}%`;
}

function formatPrice(v) {
  if (v === null || v === undefined || Number.isNaN(Number(v))) return "未提供";
  return `$${Number(v).toFixed(2)}`;
}

function stockLine(stock) {
  return `
    <div style="font-size:14px; line-height:1.6; margin-top:6px; color:#444;">
      ${stock.symbol}｜${stock.sector}｜${stock.category}｜${stock.risk_level}
      <br>
      現價：${formatPrice(stock.price)}｜下限價：${formatPrice(stock.ki_price)}｜執行價：${formatPrice(stock.strike_price)}
      <br>
      距下限價：${formatPct(stock.distance_to_ki_pct)}
    </div>
  `;
}

function renderPositionCard(position, idx, prefix = "m2") {
  const worst = position.worst_stock;
  const detailId = `${prefix}-${position.id}-${idx}`;
  const status = position.health;

  return `
    <div style="border:1px solid #ddd; border-radius:12px; padding:12px; margin-bottom:12px; background:#fff;">
      <div style="font-weight:bold; font-size:18px; margin-bottom:8px;">
        ${position.id}
      </div>

      <div style="font-size:15px; line-height:1.8;">
        標的：${position.stocks.map(s => s.symbol).join(", ")}<br>
        Worst-of：${worst ? worst.symbol : "未判定"}<br>
        Worst 類別：${worst ? worst.category : "unknown"}<br>
        距下限價：${worst ? formatPct(worst.distance_to_ki_pct) : "未提供"}<br>
        狀態：<span style="color:${status.color}; font-weight:bold;">${status.label}</span><br>
        風險提示：${status.hint}
      </div>

      <div
        onclick="toggleModule2Detail('${detailId}')"
        style="margin-top:10px; color:#1565c0; font-size:14px; cursor:pointer;"
      >
        點擊展開 / 收合明細
      </div>

      <div id="${detailId}" style="display:none; margin-top:10px;">
        ${position.stocks.map(stockLine).join("")}
      </div>
    </div>
  `;
}

function renderSection(title, list, expanded = false, sectionId = "") {
  const displayStyle = expanded ? "block" : "none";
  const toggleText = expanded ? "點擊收合" : "點擊展開";

  return `
    <div style="margin-top:18px;">
      <div
        style="font-size:24px; font-weight:bold; margin-bottom:10px;"
        ${sectionId ? `onclick="toggleModule2Section('${sectionId}')"` : ""}
      >
        ${title}（${list.length}）
        ${sectionId ? `<span style="font-size:14px; color:#1565c0; margin-left:8px;">${toggleText}</span>` : ""}
      </div>

      <div id="${sectionId}" style="display:${displayStyle};">
        ${list.length > 0 ? list.map((p, i) => renderPositionCard(p, i, sectionId)).join("") : `<p>目前無資料</p>`}
      </div>
    </div>
  `;
}

export function renderModule2Health(positions, pool) {
  const enriched = enrichPositions(positions, pool);
  const sorted = sortByRisk(enriched);

  const dangerList = sorted.filter((p) => p.health.label === "危險");
  const watchList = sorted.filter((p) => p.health.label === "追蹤");
  const healthyList = sorted.filter((p) => p.health.label === "健康");
  const unknownList = sorted.filter((p) => p.health.label === "待確認");

  const total = sorted.length;
  const dangerCount = dangerList.length;
  const watchCount = watchList.length + unknownList.length;
  const healthyCount = healthyList.length;

  const topRisk = dangerList[0] || watchList[0] || unknownList[0] || healthyList[0] || null;

  return `
    <div style="margin-bottom:16px; padding:12px; border:1px solid #ccc; border-radius:12px; background:#fff;">
      <div style="font-size:22px; font-weight:bold; margin-bottom:8px;">持倉健康總覽</div>
      持倉總數：${total} ｜ 
      危險：<span style="color:#d32f2f; font-weight:bold;">${dangerCount}</span> ｜ 
      追蹤：<span style="color:#f57c00; font-weight:bold;">${watchCount}</span> ｜ 
      健康：<span style="color:#388e3c; font-weight:bold;">${healthyCount}</span>
    </div>

    ${
      topRisk
        ? `
      <div style="margin-bottom:16px; padding:12px; border:1px solid #e57373; border-radius:12px; background:#ffebee;">
        <div style="font-size:22px; font-weight:bold; margin-bottom:8px;">最需處理</div>
        <div style="font-size:16px; line-height:1.8;">
          ${topRisk.id}<br>
          Worst-of：${topRisk.worst_stock ? topRisk.worst_stock.symbol : "未判定"}<br>
          距下限價：${topRisk.worst_stock ? formatPct(topRisk.worst_stock.distance_to_ki_pct) : "未提供"}<br>
          狀態：<span style="color:${topRisk.health.color}; font-weight:bold;">${topRisk.health.label}</span>
        </div>
      </div>
    `
        : ""
    }

    ${renderSection("危險持倉", dangerList, true, "module2-danger")}
    ${renderSection("追蹤持倉", [...watchList, ...unknownList], false, "module2-watch")}
    ${renderSection("健康持倉", healthyList, false, "module2-healthy")}
  `;
}

window.toggleModule2Section = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};

window.toggleModule2Detail = function(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.style.display = el.style.display === "none" ? "block" : "none";
};
