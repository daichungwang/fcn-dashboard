import fs from "fs";
import { generateFundamentalMap } from "./js/m1/generate_fundamental_map.js";

const candidate = JSON.parse(
  fs.readFileSync("./data/m1/m1_candidate_80.json", "utf-8")
);

const result = generateFundamentalMap(candidate);

fs.writeFileSync(
  "./data/m1/m1_fundamental_map.json",
  JSON.stringify(result, null, 2)
);

console.log("✅ fundamental_map 已生成");
