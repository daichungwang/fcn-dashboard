const fs = require("fs");
const path = require("path");

const engine = require("../js/m1/m1_competition_engine.js");

const ROOT = path.resolve(__dirname, "..");
const INPUT_PATH = path.join(ROOT, "data", "m1", "universe_150.json");
const OUTPUT_PATH = path.join(ROOT, "data", "m1", "competitive_cards.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function asArray(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (Array.isArray(data?.stocks)) return data.stocks;
  if (Array.isArray(data?.items)) return data.items;
  if (data && typeof data === "object") return Object.values(data);
  return [];
}

function main() {
  console.log("==========================================");
  console.log("Generate competitive_cards.json");
  console.log("==========================================");

  const universeRaw = readJson(INPUT_PATH);
  const universe = asArray(universeRaw);

  if (!universe.length) {
    throw new Error("universe_150.json 沒有可用資料");
  }

  const cards = engine.enrichPoolWithCompetition(universe);

  if (!Array.isArray(cards)) {
    throw new Error("engine 輸出不是陣列");
  }

  writeJson(OUTPUT_PATH, cards);

  console.log(`完成！共輸出 ${cards.length} 筆 research cards`);
}

try {
  main();
} catch (err) {
  console.error("發生錯誤：");
  console.error(err.message);
  process.exit(1);
}
