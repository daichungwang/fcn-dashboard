async function loadM7(){
  const res = await fetch("data/m7/m7_new_stock_today.json");
  const json = await res.json();
  return json.aggressive_recommend;
}

function getScore(data, symbol){
  const stock = data.find(s => s["股號"] === symbol);

  if (!stock) {
    throw new Error("找不到股票: " + symbol);
  }

  const valuation = stock["valuation_score"] || 0;
  const trend = stock["trend_score"] || 0;
  const quality = stock["quality_score"] || 0;

  return 0.4 * valuation + 0.3 * trend + 0.3 * quality;
}

async function runM8(symbols, KI, Strike, T, Type){

  const data = await loadM7();

  const scores = symbols.map(sym => getScore(data, sym));

  // Weakness
  let w = scores.map(s => 100 - s).sort((a,b)=>b-a);
  let avg = w.reduce((a,b)=>a+b,0)/w.length;

  let BW = 0.5*w[0] + 0.3*w[1] + 0.2*avg;

  // Basket
  let Basket = 0.15 * BW;

  // KI
  let KIAdj = 0.18*(KI-65) + 0.006*(KI-65)**2;

  // GAP
  let Gap = Strike - KI;
  if (Gap < 10 || Gap >= 25) return { valid:false };

  let GapAdj = 0;
  if (Gap > 13){
    GapAdj = Math.min(3.5, 0.25*(Gap-13)+0.015*(Gap-13)**2);
  }

  // Tenor
  let TenorAdj = Math.min(4, Math.max(-1, 0.22*(T-6)+0.018*(T-6)**2));

  // Strike
  let ideal = 74 - 2*T;
  let delta = Strike - ideal;
  let StrikeAdj = Math.min(2.5, Math.max(-1, 0.12*delta + 0.01*delta**2));

  // Corr（先固定）
  let CorrAdj = 1.5;

  // Type
  let TypeAdj = Type === "DACN" ? 1 : Type === "EKI" ? -1 : 0;

  // Final
  let fair =
    6 +
    Basket +
    KIAdj +
    GapAdj +
    TenorAdj +
    CorrAdj +
    StrikeAdj +
    TypeAdj;

  return {
    fair_yield: fair,
    scores,
    BW
  };
}
