function getCouponScore(couponPa) {
  if (couponPa < 10) return -999;
  if (couponPa < 12) return -4;
  if (couponPa < 15) return -2;
  if (couponPa < 16) return 0;
  if (couponPa < 18) return 3;
  if (couponPa < 20) return 5;
  if (couponPa < 24) return 8;
  return 10;
}

function getTenorScore(months) {
  if (months > 12) return -999;
  if (months <= 3) return 5;
  if (months <= 5) return 2;
  if (months === 6) return 0;
  if (months <= 9) return -2;
  return -5;
}

function getKiScore(ki) {
  if (ki > 75) return -999;
  if (ki <= 55) return 8;
  if (ki <= 60) return 4;
  if (ki <= 65) return 0;
  if (ki <= 70) return -4;
  return -8;
}

function getStrikeScore(strike) {
  if (strike > 75) return -999;
  if (strike <= 55) return 8;
  if (strike <= 60) return 4;
  if (strike <= 65) return 0;
  if (strike <= 70) return -4;
  return -8;
}

function getGapScore(gap) {
  if (gap >= 25) return -999;

  if (gap === 0) return 5;
  if (gap > 0 && gap < 10) return -7;
  if (gap === 10) return 5;
  if (gap > 10 && gap <= 13) return 4;
  if (gap > 13 && gap <= 15) return 3;
  if (gap > 15 && gap <= 18) return 0;
  if (gap > 18 && gap <= 20) return -4;
  if (gap > 20 && gap <= 22) return -5;
  if (gap > 22 && gap < 25) return -8;

  return 0;
}

function applyIronRules(position, scores) {
  const reasons = [];

  if (scores.couponScore === -999) reasons.push("利率低於10%");
  if (scores.tenorScore === -999) reasons.push("天期大於12個月");
  if (scores.kiScore === -999) reasons.push("KI大於75");
  if (scores.strikeScore === -999) reasons.push("Strike大於75");
  if (scores.gapScore === -999) reasons.push("Gap太小");

  const blocked = reasons.length > 0;

  return {
    blocked,
    reasons
  };
}

export function totalDecisionScore(position) {
  const couponScore = getCouponScore(position.coupon_pa || 0);
  const tenorScore = getTenorScore(position.tenor_months || 0);
  const kiScore = getKiScore(position.ki || 0);
  const strikeScore = getStrikeScore(position.strike || 0);
  const gapScore = getGapScore(position.gap || 0);

  const ironRule = applyIronRules(position, {
    couponScore,
    tenorScore,
    kiScore,
    strikeScore,
    gapScore
  });

  if (ironRule.blocked) {
    return {
      couponScore,
      tenorScore,
      kiScore,
      strikeScore,
      gapScore,
      totalScore: -999,
      decision: "不做",
      ironRuleBlocked: true,
      ironRuleReasons: ironRule.reasons
    };
  }

  const totalScore =
    couponScore +
    tenorScore +
    kiScore +
    strikeScore +
    gapScore;

  let decision = "觀察";
  if (totalScore >= 10) decision = "可做";
  if (totalScore < 4) decision = "不做";

  return {
    couponScore,
    tenorScore,
    kiScore,
    strikeScore,
    gapScore,
    totalScore,
    decision,
    ironRuleBlocked: false,
    ironRuleReasons: []
  };
}
