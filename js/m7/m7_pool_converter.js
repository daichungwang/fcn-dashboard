// ==========================================
// M7 Pool Converter
// fundamental_data → m7_new_stock_pool
// 保留原始邏輯 + stock profile 升級版
// ==========================================

import fs from "fs";
import path from "path";
import { STOCK_PROFILE } from "./m7_stock_profile.js";

const INPUT_FILE = path.resolve("./data/m7/m7_fundamental_data.json");
const OUTPUT_FILE = path.resolve("./data/m7/m7_new_stock_pool.json");

// PEG 計算
function calcPEG(price, eps_now, eps_next) {
  if (!price || !eps_now || !eps_next) return null;

  const pe = price / eps_next;
  const growth = (eps_next / eps_now - 1) * 100;

  if (growth <= 0) return null;

  return pe / growth;
}

// Quality 分數
function qualityScore(level) {
  if (level === "高") return 5;
  if (level === "中") return 2;
  return -5;
}

// PEG 分數
function pegScore(peg, valuationModel = "PEG") {
  if (valuationModel !== "PEG") return 0;
  if (peg === null) return 0;

  if (peg < 0.8) return 4;
  if (peg <= 1.0) return 2;
  if (peg <= 1.3) return 0;
  if (peg <= 1.6) return -2;
  return -4;
}

// 波動分數
function volScore(level) {
  if (level === "低") return 2;
  if (level === "中") return 0;
  return -3;
}

// Pool 判斷
function poolResult(score) {
  if (score >= 6) return "Core";
  if (score >= 3) return "Conditional";
  return "Reject";
}

// Strike ladder
function buildStrikeLadder(quality) {
  if (quality === "高") return [65, 70, 75];
  if (quality === "中") return [60, 65, 70];
  return [55, 60, 65];
}

// KI range
function buildKIRange() {
  return [50, 55, 60];
}

function toRows(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.data)) return raw.data;
  return [];
}

// 把 array 轉成 symbol-keyed object 與你原本 convertPool 相容
function arrayToSymbolMap(rows) {
  const out = {};
  for (const row of rows) {
    const symbol = row.symbol || row.股號;
    if (!symbol) continue;
    out[symbol] = row;
  }
  return out;
}

// 主函數：沿用你原本 convertPool 風格
function convertPool(data) {
  let output = {};

  for (let symbol in data) {
    let s = data[symbol];
    const profile = STOCK_PROFILE[symbol] || {};

    const 現價 = s.現價 ?? s.price ?? null;
    const 目前EPS = s.目前EPS ?? s.eps_now ?? null;
    const 明年EPS = s.明年EPS ?? s.eps_next ?? null;
    const 品質等級 = s.品質等級 ?? s.quality_level ?? "中";
    const 波動等級 = s.波動等級 ?? s.vol_level ?? s.risk_level ?? "中";
    const 名稱 = s.名稱 ?? s.name ?? symbol;

    const peg = calcPEG(現價, 目前EPS, 明年EPS);

    const valuationModel = profile.valuation_model || "PEG";
    const qScore = qualityScore(品質等級);
    const pScore = pegScore(peg, valuationModel);
    const vScore = volScore(波動等級);

    const total = qScore + pScore + vScore;
    const result = poolResult(total);

    output[symbol] = {
      "symbol": symbol,
      "名稱": 名稱,

      "sector": profile.sector || s.sector || "",
      "subsector": profile.subsector || s.subsector || "",
      "category": profile.category || s.category || "",
      "valuation_model": valuationModel,
      "allow_fcn": profile.allow_fcn ?? true,

      "現價": 現價,
      "目前EPS": 目前EPS,
      "明年EPS": 明年EPS,
      "PEG": peg,

      "品質等級": 品質等級,
      "品質分數": qScore,

      "PEG分數": pScore,

      "波動等級": 波動等級,
      "波動分數": vScore,

      "新股票池總分": total,
      "新股票池結果": result,

      "可接受Strike階梯": buildStrikeLadder(品質等級),
      "10年線KI參考區間": buildKIRange(),

      "是否納入新股票池": total >= 3 && (profile.allow_fcn ?? true),

      "1週漲跌幅": s["1週漲跌幅"] ?? s.ret_1w ?? null,
      "1月漲跌幅": s["1月漲跌幅"] ?? s.ret_1m ?? null,
      "3月漲跌幅": s["3月漲跌幅"] ?? s.ret_3m ?? null,
      "量比": s["量比"] ?? s.volume_ratio ?? null,

      "備註": s["備註"] ?? "",
      "最後更新日期": new Date().toISOString().slice(0, 10)
    };
  }

  return output;
}

function run() {
  if (!fs.existsSync(INPUT_FILE)) {
    throw new Error("找不到 /data/m7/m7_fundamental_data.json");
  }

  const raw = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));
  const rows = toRows(raw);
  const symbolMap = arrayToSymbolMap(rows);

  const output = convertPool(symbolMap);

  fs.writeFileSync(
    OUTPUT_FILE,
    JSON.stringify(
      {
        generated_at: new Date().toISOString(),
        count: Object.keys(output).length,
        data: output
      },
      null,
      2
    ),
    "utf-8"
  );

  console.log(`✅ m7_new_stock_pool.json 已產出，共 ${Object.keys(output).length} 筆`);
}

run();

export { convertPool };
