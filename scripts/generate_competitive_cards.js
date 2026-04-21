// ==========================================
// generate_competitive_cards.js
// 將 universe_150.json 批次轉成 competitive_cards.json
// ==========================================

const fs = require("fs");
const path = require("path");
const vm = require("vm");

// ---------- 路徑 ----------
const ROOT = path.resolve(__dirname, "..");
const INPUT_PATH = path.join(ROOT, "data", "m1", "universe_150.json");
const ENGINE_PATH = path.join(ROOT, "js", "m1", "m1_competition_engine.js");
const OUTPUT_PATH = path.join(ROOT, "data", "m1", "competitive_cards.json");

// ---------- 工具 ----------
function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`讀取 JSON 失敗: ${filePath}\n${err.message}`);
  }
}

function writeJson(filePath, data) {
  try {
    const json = JSON.stringify(data, null, 2);
    fs.writeFileSync(filePath, json, "utf8");
  } catch (err) {
    throw new Error(`寫入 JSON 失敗: ${filePath}\n${err.message}`);
  }
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.stocks)) return data.stocks;
  if (Array.isArray(data?.items)) return data.items;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function loadEngine(enginePath) {
  const code = fs.readFileSync(enginePath, "utf8");

  const sandbox = {
    window: {},
    console,
    Date
  };

  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: enginePath });

  const engine = sandbox.window?.M1CompetitionEngine;
  if (!engine || typeof engine.enrichPoolWithCompetition !== "function") {
    throw new Error("找不到 window.M1CompetitionEngine.enrichPoolWithCompetition");
  }

  return engine;
}

// ---------- 主流程 ----------
function main() {
  console.log("==========================================");
  console.log("Generate competitive_cards.json");
  console.log("==========================================");

  console.log(`讀取股票池: ${INPUT_PATH}`);
  const universeRaw = readJson(INPUT_PATH);
  const universe = asArray(universeRaw);

  if (!universe.length) {
    throw new Error("universe_150.json 沒有可用資料");
  }

  console.log(`載入 engine: ${ENGINE_PATH}`);
  const engine = loadEngine(ENGINE_PATH);

  console.log(`開始產生研究卡，共 ${universe.length} 檔...`);
  const cards = engine.enrichPoolWithCompetition(universe);

  if (!Array.isArray(cards)) {
    throw new Error("engine 輸出不是陣列");
  }

  console.log(`寫入檔案: ${OUTPUT_PATH}`);
  writeJson(OUTPUT_PATH, cards);

  console.log("完成！");
  console.log(`共輸出 ${cards.length} 筆 research cards`);
}

// ---------- 執行 ----------
try {
  main();
} catch (err) {
  console.error("發生錯誤：");
  console.error(err.message);
  process.exit(1);
}
