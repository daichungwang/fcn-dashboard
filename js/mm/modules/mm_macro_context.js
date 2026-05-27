// MM A-zone Macro Context runtime renderer
// Source of truth: data/market_runtime.json
(function(){
  const MARKET_RUNTIME_PATH = "../data/market_runtime.json";

  const A1_MARKET_PULSE = [
    { label: "美股（S&P500）", symbol: "SPY" },
    { label: "NASDAQ", symbol: "QQQ" },
    { label: "費半 / SMH", symbol: "SMH" },
    { label: "道瓊", symbol: "DIA" },
    { label: "台股", symbol: "0050.TW", fallback: "^TWII" }
  ];

  const A2_MACRO_PULSE = [
    { label: "VIX", symbol: "^VIX", type: "value" },
    { label: "10Y Yield", symbol: "^TNX", type: "yield" },
    { label: "DXY", symbol: "DX-Y.NYB", type: "value" },
    { label: "USD/TWD", symbol: "TWD=X", type: "fx" },
    { label: "USD/JPY", symbol: "JPY=X", type: "fx" }
  ];

  function getRows(payload){
    if(!payload) return {};
    if(payload.rows && typeof payload.rows === "object") return payload.rows;
    return payload;
  }

  function getRuntimeItem(rows, row){
    return rows[row.symbol] || (row.fallback ? rows[row.fallback] : null) || null;
  }

  function num(v){
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function formatPct(v){
    const n = num(v);
    if(n === null) return "待接資料";
    const sign = n > 0 ? "+" : "";
    const arrow = n > 0 ? "↑ " : (n < 0 ? "↓ " : "");
    return `${arrow}${sign}${n.toFixed(1)}%`;
  }

  function formatMacroValue(v, type){
    const n = num(v);
    if(n === null) return "待接資料";
    if(type === "yield") return `${n.toFixed(2)}%`;
    if(type === "fx") return n.toFixed(2);
    return n.toFixed(2);
  }

  function lineHtml(label, value, extraClass){
    return `<div class="mm-a-line ${extraClass || ""}"><span>${label}</span><b>${value}</b></div>`;
  }

  function renderA1MarketPulse(rows, payload){
    const el = document.getElementById("a1-market-pulse");
    if(!el) return;
    el.innerHTML = A1_MARKET_PULSE.map(row => {
      const item = getRuntimeItem(rows, row);
      return lineHtml(row.label, item ? formatPct(item.ret_1d) : "待接資料", item ? "" : "is-missing");
    }).join("");

    const note = document.getElementById("a1-market-runtime-note");
    if(note){
      const available = A1_MARKET_PULSE.filter(row => getRuntimeItem(rows, row)).length;
      note.textContent = `Runtime coverage：${available}/${A1_MARKET_PULSE.length}｜source：data/market_runtime.json｜updated：${payload.generated_at || "待接資料"}`;
    }
  }

  function renderA2MacroPulse(rows, payload){
    const el = document.getElementById("a2-macro-pulse");
    if(!el) return;
    el.innerHTML = A2_MACRO_PULSE.map(row => {
      const item = getRuntimeItem(rows, row);
      return lineHtml(row.label, item ? formatMacroValue(item.price_now, row.type) : "待接資料", item ? "" : "is-missing");
    }).join("");

    const note = document.getElementById("a2-market-runtime-note");
    if(note){
      const available = A2_MACRO_PULSE.filter(row => getRuntimeItem(rows, row)).length;
      const missing = checkRuntimeMissing(rows);
      note.textContent = `Runtime coverage：${available}/${A2_MACRO_PULSE.length}｜Missing：${missing.length ? missing.join(", ") : "none"}｜updated：${payload.generated_at || "待接資料"}`;
    }
  }

  function checkRuntimeMissing(rows){
    const required = [...A1_MARKET_PULSE, ...A2_MACRO_PULSE];
    const missing = [];
    required.forEach(row => {
      if(!getRuntimeItem(rows, row)) missing.push(row.symbol);
    });
    return Array.from(new Set(missing));
  }

  async function loadMarketRuntime(){
    const res = await fetch(MARKET_RUNTIME_PATH, { cache: "no-store" });
    if(!res.ok) throw new Error(`Failed to load ${MARKET_RUNTIME_PATH}`);
    return await res.json();
  }

  async function initMacroContext(){
    try{
      const payload = await loadMarketRuntime();
      const rows = getRows(payload);
      renderA1MarketPulse(rows, payload);
      renderA2MacroPulse(rows, payload);
      window.MM_MACRO_CONTEXT = {
        payload,
        rows,
        missing: checkRuntimeMissing(rows),
        source: MARKET_RUNTIME_PATH
      };
    }catch(err){
      const a1 = document.getElementById("a1-market-pulse");
      const a2 = document.getElementById("a2-macro-pulse");
      if(a1) a1.innerHTML = lineHtml("Market Runtime", "讀取失敗", "is-missing");
      if(a2) a2.innerHTML = lineHtml("Macro Runtime", "讀取失敗", "is-missing");
      console.warn("MM macro context failed:", err);
    }
  }

  window.MM_MACRO_CONTEXT_RENDERER = {
    init: initMacroContext,
    checkRuntimeMissing,
    formatPct,
    formatMacroValue
  };

  document.addEventListener("DOMContentLoaded", initMacroContext);
})();
