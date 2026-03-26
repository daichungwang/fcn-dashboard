export function adjustSensitivity(baseMap, regime) {
  const adjusted = JSON.parse(JSON.stringify(baseMap));

  Object.keys(adjusted).forEach((symbol) => {
    const item = adjusted[symbol];

    Object.keys(item).forEach((factor) => {
      let multiplier = 1;

      // 利率下降 → 成長股加強
      if (regime.rate_trend === "down") {
        if (["AI需求", "利率下降"].includes(factor)) {
          multiplier *= 1.2;
        }
      }

      // 利率上升 → 成長股打折
      if (regime.rate_trend === "up") {
        if (["AI需求", "利率下降"].includes(factor)) {
          multiplier *= 0.8;
        }
      }

      // 高波動 → 風險股打折
      if (regime.vix_level === "high") {
        if (["AI需求"].includes(factor)) {
          multiplier *= 0.7;
        }
      }

      // 低波動 → 風險股加強
      if (regime.vix_level === "low") {
        if (["AI需求"].includes(factor)) {
          multiplier *= 1.1;
        }
      }

      // 通膨下降 → 成長股利多
      if (regime.inflation === "cooling") {
        if (["利率下降"].includes(factor)) {
          multiplier *= 1.15;
        }
      }

      item[factor] = Number((item[factor] * multiplier).toFixed(3));
    });
  });

  return adjusted;
}
