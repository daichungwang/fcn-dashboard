import fs from "fs";

const csv = fs.readFileSync("./source/fcn_raw.csv", "utf-8");
const lines = csv.split("\n").slice(1);

const map = {};

lines.forEach(line => {
  if (!line.trim()) return;

  const [
    id, tenor, yield_pa, ki, strike,
    symbol, price, ki_price, strike_price
  ] = line.split(",");

  if (!map[id]) {
    map[id] = {
      id,
      tenor: Number(tenor),
      yield: Number(yield_pa),
      ki: Number(ki),
      strike: Number(strike),
      stocks: []
    };
  }

  map[id].stocks.push({
    symbol,
    price: Number(price),
    ki_price: Number(ki_price),
    strike_price: Number(strike_price)
  });
});

const result = Object.values(map);

fs.writeFileSync(
  "./data/positions.json",
  JSON.stringify(result, null, 2)
);

console.log("positions.json 已更新");
