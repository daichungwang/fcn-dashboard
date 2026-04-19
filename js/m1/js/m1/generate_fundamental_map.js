// ==========================================
// M1 Fundamental Map Generator (80 stocks)
// 振宇 FCN 系統 - Proxy Engine
// ==========================================

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ------------------------------------------
// 1️⃣ Category Base
// ------------------------------------------
function getCategoryBase(category) {
  switch ((category || "").toLowerCase()) {
    case "core":
      return { capex: 11, rev: 18, opg: 22, opq: 9000 };
    case "growth":
      return { capex: 9, rev: 20, opg: 24, opq: 3000 };
    case "income":
      return { capex: 6, rev: 10, opg: 12, opq: 3500 };
    case "defensive":
      return { capex: 3, rev: 5, opg: 6, opq: 5000 };
    default:
      return { capex: 5, rev: 16, opg: 18, opq: 800 }; // speculative
  }
}

// ------------------------------------------
// 2️⃣ Style Adjustment
// ------------------------------------------
function applyStyle(base, styles = []) {
  styles.forEach(s => {
    switch (s) {
      case "high_capex":
        base.capex += 4;
        base.opq += 1000;
        break;
      case "high_growth":
        base.rev += 8;
        base.opg += 10;
        break;
      case "quality":
        base.opq += 2500;
        base.opg += 3;
        break;
      case "platform":
        base.rev += 3;
        base.opq += 2000;
        break;
      case "capex":
        base.capex += 5;
        break;
      case "growth":
        base.rev += 5;
        base.opg += 6;
        break;
      case "cashflow":
        base.opq += 2000;
        base.rev -= 1;
        break;
      case "low_vol":
        base.opq += 1500;
        base.capex -= 1;
        break;
      case "index":
        base.capex = 0;
        base.rev = 0;
        base.opg = 0;
        base.opq = 1;
        break;
      case "high_beta":
        base.rev += 4;
        base.opg += 4;
        base.opq -= 300;
        break;
      case "turnaround":
        base.rev += 2;
        base.opg -= 3;
        base.opq -= 500;
        break;
      case "cyclical":
        base.capex += 1;
        base.rev += 2;
        base.opg -= 1;
        break;
      case "monopoly":
        base.opq += 3000;
        base.opg += 2;
        break;
      case "ecosystem":
        base.opq += 2500;
        base.rev += 2;
        break;
      case "ip":
        base.opq += 1000;
        base.rev += 4;
        break;
    }
  });
}

// ------------------------------------------
// 3️⃣ Sector Adjustment
// ------------------------------------------
function applySector(base, sector) {
  const s = (sector || "").toUpperCase();

  if (["AI_SEMI", "FOUNDRY", "CLOUD"].includes(s)) {
    base.capex += 1;
    base.rev += 2;
  }

  if (["ETF", "BANK", "INSURANCE"].includes(s)) {
    base.capex -= 2;
    base.rev -= 2;
    base.opq += 1000;
  }

  if (["CRYPTO", "FINTECH"].includes(s)) {
    base.rev += 2;
    base.opg += 2;
    base.opq -= 200;
  }

  if (["TRAVEL", "CRUISE", "AIRLINE"].includes(s)) {
    base.rev += 1;
    base.opg += 1;
    base.opq -= 300;
  }
}

// ------------------------------------------
// 4️⃣ Main Generator
// ------------------------------------------
export function generateFundamentalMap(candidateList) {
  const map = {};

  candidateList.forEach(stock => {
    const symbol = stock.symbol;
    const category = stock.category;
    const styles = stock.style || [];
    const sector = stock.sector;

    let base = getCategoryBase(category);

    // clone
    base = { ...base };

    applyStyle(base, styles);
    applySector(base, sector);

    // clamp
    base.capex = clamp(base.capex, 0, 18);
    base.rev = clamp(base.rev, 0, 35);
    base.opg = clamp(base.opg, 0, 45);
    base.opq = clamp(base.opq, 1, 15000);

    map[symbol] = {
      capex_ratio_prev_y: Math.round(base.capex),
      revenue_growth_q: Math.round(base.rev),
      operating_income_growth_q: Math.round(base.opg),
      operating_income_q: Math.round(base.opq)
    };
  });

  return map;
}
