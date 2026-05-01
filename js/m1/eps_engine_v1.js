// ============================================
// EPS ENGINE V1.0
// Growth / Consistency / Quality
// ============================================

// ---------- 工具 ----------
function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function variance(arr) {
  const m = mean(arr);
  return mean(arr.map(v => (v - m) ** 2));
}

// ---------- Linear Regression ----------
function linearRegression(x, y) {
  const n = x.length;
  const xMean = mean(x);
  const yMean = mean(y);

  let num = 0;
  let den = 0;

  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) ** 2;
  }

  const slope = num / den;
  const intercept = yMean - slope * xMean;

  // R²
  let ssTot = 0;
  let ssRes = 0;

  for (let i = 0; i < n; i++) {
    const yPred = slope * x[i] + intercept;
    ssTot += (y[i] - yMean) ** 2;
    ssRes += (y[i] - yPred) ** 2;
  }

  const r2 = 1 - ssRes / ssTot;

  return { slope, intercept, r2 };
}

// ---------- Exponential Regression ----------
function expRegression(x, y) {
  // ln(y)
  const logY = y.map(v => Math.log(v));

  const { slope, intercept, r2 } = linearRegression(x, logY);

  return {
    slope: Math.exp(slope) - 1, // growth rate
    intercept,
    r2
  };
}

// ---------- Model Selection ----------
function bestModel(x, y) {
  // linear
  const linear = linearRegression(x, y);

  // exponential（only if all y > 0）
  let exp = null;
  if (y.every(v => v > 0)) {
    exp = expRegression(x, y);
  }

  if (!exp) return { model: "linear", ...linear };

  if (exp.r2 > linear.r2) {
    return { model: "exp", ...exp };
  }

  return { model: "linear", ...linear };
}

// ============================================
// 主計算
// ============================================

export function calcEarningsPower(stock) {
  // ---------- Historical ----------
  const hist = stock.eps_history
    .filter(d => d.eps !== null)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  if (hist.length < 5) {
    return { error: "not enough data" };
  }

  const xHist = hist.map((_, i) => i);
  const yHist = hist.map(d => d.eps);

  const histModel = bestModel(xHist, yHist);

  // ---------- Consistency ----------
  const avgEPS = mean(yHist);
  const consistencyRaw = histModel.slope / avgEPS;

  let consistencyScore =
    clamp((consistencyRaw / 0.2) * 10, 0, 10);

  if (histModel.r2 < 0.5) {
    consistencyScore *= 0.7;
  }

  // ---------- Quality ----------
  let qualityScore = histModel.r2 * 10;

  if (histModel.r2 < 0.5) {
    qualityScore *= 0.7;
  }

  // ---------- Forward Growth ----------
  const fwd = stock.eps_forward;

  let growthRaw;

  const eps2025 = fwd.find(x => x.fiscal_year === 2025)?.eps_estimate;
  const eps2026 = fwd.find(x => x.fiscal_year === 2026)?.eps_estimate;
  const eps2027 = fwd.find(x => x.fiscal_year === 2027)?.eps_estimate;

  if (eps2025 != null && eps2027 != null) {
    growthRaw = (eps2027 / eps2025) - 1;
  } else if (eps2026 != null && eps2027 != null) {
    growthRaw = (eps2027 / eps2026) - 1;
  } else {
    growthRaw = 0;
  }

  let growthScore =
    clamp((growthRaw / 0.5) * 10, 0, 10);

  if (growthRaw > 1) {
    growthScore = 10;
  }

  // ---------- Final ----------
  const earningsPower =
    0.4 * growthScore +
    0.35 * consistencyScore +
    0.25 * qualityScore;

  return {
    growth: Number(growthScore.toFixed(2)),
    consistency: Number(consistencyScore.toFixed(2)),
    quality: Number(qualityScore.toFixed(2)),
    earnings_power: Number(earningsPower.toFixed(2)),

    meta: {
      model: histModel.model,
      r2: Number(histModel.r2.toFixed(3)),
      slope: Number(histModel.slope.toFixed(4))
    }
  };
}
