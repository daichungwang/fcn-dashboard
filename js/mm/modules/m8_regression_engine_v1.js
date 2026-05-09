// ============================================================================
// M8 Regression Engine v1
// Path: js/mm/modules/m8_regression_engine_v1.js
// Purpose:
// 1. Build market-implied template / risk / tenor / structure curves
// 2. Produce New Fair Rate per FCN
// 3. Compare Market Coupon vs Old Fair vs New Fair
// ============================================================================

(function (global) {
  "use strict";

  const VERSION = "m8_regression_engine_v2_small_template_surface_20260509";

  function toNum(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function round2(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function avg(values) {
    const xs = arr(values).map(Number).filter(Number.isFinite);
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  function median(values) {
    const xs = arr(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!xs.length) return null;
    const mid = Math.floor(xs.length / 2);
    return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
  }

  function pickNum(...values) {
    for (const v of values) {
      const n = Number(v);
      if (Number.isFinite(n)) return n;
    }
    return null;
  }

  function safeKey(v, fallback = "UNKNOWN") {
    const s = String(v || "").trim();
    return s || fallback;
  }


  // --------------------------------------------------------------------------
  // Risk Compression v2
  // User target: 6 templates x 9 risk zones x 4 tenor groups.
  // The raw strike/KI buckets are compressed so sample density is visible.
  // --------------------------------------------------------------------------

  const RISK9_ORDER = [
    "R1_l_ml",
    "R2_ml_ml",
    "R3_ml_m",
    "R4_m_ml",
    "R5_m_m",
    "R6_m_h",
    "R7_mh_m",
    "R8_mh_h",
    "R9_vh_vh"
  ];

  const RISK9_LABELS = {
    R1_l_ml: "l/ml",
    R2_ml_ml: "ml/ml",
    R3_ml_m: "ml/m",
    R4_m_ml: "m/ml",
    R5_m_m: "m/m",
    R6_m_h: "m/h",
    R7_mh_m: "mh/m",
    R8_mh_h: "mh/h_or_vh",
    R9_vh_vh: "vh/h_or_vh"
  };

  function bucketShort(bucket, kind) {
    const b = String(bucket || "").toLowerCase();
    if (b.includes("very_high") || b === "vh") return "vh";
    if (b.includes("medium_high") || b === "mh") return "mh";
    if (b.includes("medium_low") || b === "ml") return "ml";
    if (b.includes("high") || b === "h") return "h";
    if (b.includes("medium") || b === "m") return "m";
    if (b.includes("low") || b === "l") return "l";

    const v = Number(bucket);
    if (Number.isFinite(v)) {
      if (kind === "strike") {
        if (v < 60) return "l";
        if (v < 65) return "ml";
        if (v < 70) return "m";
        if (v < 75) return "mh";
        return "vh";
      }
      if (v < 50) return "l";
      if (v < 55) return "ml";
      if (v < 60) return "m";
      if (v < 65) return "h";
      return "vh";
    }
    return "unknown";
  }

  function classifyRiskZone9(row) {
    const strikeCode = bucketShort(row.strike_bucket || row.strike, "strike");
    const kiCode = bucketShort(row.ki_bucket || row.ki, "ki");

    let code = "R5_m_m";
    let reason = "fallback_to_mid_risk";

    if (strikeCode === "l") {
      code = "R1_l_ml";
      reason = "low strike grouped with medium-low KI protection";
    } else if (strikeCode === "ml" && (kiCode === "l" || kiCode === "ml")) {
      code = "R2_ml_ml";
      reason = "medium-low strike and low/medium-low KI";
    } else if (strikeCode === "ml") {
      code = "R3_ml_m";
      reason = "medium-low strike with medium-or-higher KI";
    } else if (strikeCode === "m" && (kiCode === "l" || kiCode === "ml")) {
      code = "R4_m_ml";
      reason = "medium strike with medium-low KI";
    } else if (strikeCode === "m" && kiCode === "m") {
      code = "R5_m_m";
      reason = "medium strike and medium KI";
    } else if (strikeCode === "m") {
      code = "R6_m_h";
      reason = "medium strike with high-or-higher KI";
    } else if (strikeCode === "mh" && (kiCode === "l" || kiCode === "ml" || kiCode === "m")) {
      code = "R7_mh_m";
      reason = "medium-high strike with medium-or-lower KI";
    } else if (strikeCode === "mh") {
      code = "R8_mh_h";
      reason = "medium-high strike with high-or-very-high KI";
    } else if (strikeCode === "vh") {
      code = "R9_vh_vh";
      reason = "very-high strike dominates risk zone";
    }

    return {
      risk_zone_9: code,
      risk_zone_label: RISK9_LABELS[code] || code,
      risk_zone_reason: reason,
      strike_zone_code: strikeCode,
      ki_zone_code: kiCode
    };
  }

  function classifyTenorGroup4(row) {
    const t = pickNum(row.tenor, row.tenor_month, row.T);
    if (t === null) {
      return {
        tenor_group_4: "T_UNKNOWN",
        tenor_group_label: "unknown",
        tenor_group_reason: "missing tenor"
      };
    }
    if (t <= 3) return { tenor_group_4: "T1_0_3M", tenor_group_label: "<=3M", tenor_group_reason: "ultra-short" };
    if (t <= 6) return { tenor_group_4: "T2_4_6M", tenor_group_label: "4~6M", tenor_group_reason: "main short tenor" };
    if (t <= 9) return { tenor_group_4: "T3_7_9M", tenor_group_label: "7~9M", tenor_group_reason: "medium tenor" };
    return { tenor_group_4: "T4_10_12M", tenor_group_label: "10~12M", tenor_group_reason: "long tenor bucket" };
  }

  function addCompressionFields(row) {
    const risk = classifyRiskZone9(row);
    const tenor = classifyTenorGroup4(row);
    return {
      ...row,
      ...risk,
      ...tenor,
      template_risk_key: [safeKey(row.basket_template), risk.risk_zone_9].join("|"),
      template_risk_tenor_key: [safeKey(row.basket_template), risk.risk_zone_9, tenor.tenor_group_4].join("|")
    };
  }

  function getMarketCoupon(row) {
    return pickNum(row.market_coupon, row.market_rate, row.coupon_pct);
  }

  function getOldFairRate(row) {
    return pickNum(
      row.fair_rate,
      row.fair_yield,
      row.my_preference_rate,
      row.m8_features && row.m8_features.fair_yield
    );
  }

  function getPreRate(row) {
    return pickNum(row.pre_rate, row.my_pre_rate, row.m8_features && row.m8_features.pre_rate);
  }

  function getMarketImpliedBrake(row) {
    const direct = pickNum(row.market_implied_brake, row.implied_market_brake);
    if (direct !== null) return direct;

    const pre = getPreRate(row);
    const coupon = getMarketCoupon(row);
    if (pre !== null && coupon !== null) return pre - coupon;

    return null;
  }

  function groupBy(rows, keyFn) {
    const map = new Map();
    arr(rows).forEach(row => {
      const k = safeKey(keyFn(row));
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(row);
    });
    return map;
  }

  function summarizeGroup(key, rows, keyName) {
    const coupons = rows.map(getMarketCoupon).filter(Number.isFinite);
    const oldFairs = rows.map(getOldFairRate).filter(Number.isFinite);
    const preRates = rows.map(getPreRate).filter(Number.isFinite);
    const brakes = rows.map(getMarketImpliedBrake).filter(Number.isFinite);
    const newFairs = rows.map(r => pickNum(r.new_fair_rate)).filter(Number.isFinite);
    const gapsOld = rows.map(r => pickNum(r.pricing_gap_vs_old)).filter(Number.isFinite);
    const gapsNew = rows.map(r => pickNum(r.pricing_gap_vs_new)).filter(Number.isFinite);

    return {
      [keyName]: key,
      count: rows.length,
      avg_coupon: round2(avg(coupons)),
      median_coupon: round2(median(coupons)),
      avg_old_fair_rate: round2(avg(oldFairs)),
      avg_new_fair_rate: round2(avg(newFairs)),
      avg_pre_rate: round2(avg(preRates)),
      avg_market_implied_brake: round2(avg(brakes)),
      median_market_implied_brake: round2(median(brakes)),
      avg_gap_vs_old: round2(avg(gapsOld)),
      avg_gap_vs_new: round2(avg(gapsNew))
    };
  }

  function buildTemplateSummary(rows) {
    const groups = groupBy(rows, r => r.basket_template || r.basket_template_label);
    return Array.from(groups.entries())
      .map(([k, rs]) => {
        const base = summarizeGroup(k, rs, "template");
        const labels = rs.map(r => r.basket_template_label).filter(Boolean);
        const names = rs.map(r => r.basket_template_name).filter(Boolean);
        return {
          ...base,
          template_label: labels[0] || k,
          template_name: names[0] || ""
        };
      })
      .sort((a, b) => b.count - a.count);
  }

  function buildRiskSurface(rows) {
    const groups = groupBy(rows, r => r.risk_zone_9 || r.risk_template);
    return Array.from(groups.entries())
      .map(([k, rs]) => ({
        ...summarizeGroup(k, rs, "risk_zone_9"),
        risk_zone_label: (rs[0] && rs[0].risk_zone_label) || RISK9_LABELS[k] || k,
        raw_risk_examples: Array.from(new Set(rs.map(r => r.risk_template).filter(Boolean))).slice(0, 5).join(", ")
      }))
      .sort((a, b) => RISK9_ORDER.indexOf(a.risk_zone_9) - RISK9_ORDER.indexOf(b.risk_zone_9));
  }

  function buildRawRiskSurface(rows) {
    const groups = groupBy(rows, r => r.risk_template);
    return Array.from(groups.entries())
      .map(([k, rs]) => summarizeGroup(k, rs, "risk_template"))
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }

  function buildTenorCurve(rows) {
    const groups = groupBy(rows, r => r.tenor_group_4 || r.tenor_template || r.tenor_bucket);
    const order = ["T1_0_3M", "T2_4_6M", "T3_7_9M", "T4_10_12M", "T_UNKNOWN"];
    return Array.from(groups.entries())
      .map(([k, rs]) => ({
        ...summarizeGroup(k, rs, "tenor_group_4"),
        tenor_group_label: (rs[0] && rs[0].tenor_group_label) || k,
        raw_tenor_examples: Array.from(new Set(rs.map(r => r.tenor_template).filter(Boolean))).slice(0, 5).join(", ")
      }))
      .sort((a, b) => order.indexOf(a.tenor_group_4) - order.indexOf(b.tenor_group_4));
  }

  function buildStructureCurve(rows) {
    const groups = groupBy(rows, r => r.structure_template || r.type);
    return Array.from(groups.entries())
      .map(([k, rs]) => summarizeGroup(k, rs, "structure_template"))
      .sort((a, b) => (b.avg_coupon || 0) - (a.avg_coupon || 0));
  }

  function buildDNAStats(rows) {
    const groups = groupBy(rows, r => r.core_dna_2 || r.core_dna_3 || r.basket_symbols_key);
    return Array.from(groups.entries())
      .map(([k, rs]) => summarizeGroup(k, rs, "dna"))
      .sort((a, b) => b.count - a.count);
  }

  function buildM7Overlay(rows) {
    const buckets = {
      high_8_plus: [],
      strong_7_to_8: [],
      medium_6_to_7: [],
      weak_under_6: [],
      no_m7_score: []
    };

    arr(rows).forEach(r => {
      const raw = pickNum(r.avg_m7_score, r.m7_score, r.score_avg);
      if (raw === null) {
        buckets.no_m7_score.push(r);
      } else if (raw >= 8) {
        buckets.high_8_plus.push(r);
      } else if (raw >= 7) {
        buckets.strong_7_to_8.push(r);
      } else if (raw >= 6) {
        buckets.medium_6_to_7.push(r);
      } else {
        buckets.weak_under_6.push(r);
      }
    });

    return Object.entries(buckets).map(([bucket, rs]) => summarizeGroup(bucket, rs, "m7_bucket"));
  }

  function globalMeanCoupon(rows) {
    return avg(arr(rows).map(getMarketCoupon).filter(Number.isFinite)) || 18;
  }

  function findCurveValue(curve, keyName, key, valueField, fallback) {
    const hit = arr(curve).find(x => x[keyName] === key);
    const v = hit ? pickNum(hit[valueField]) : null;
    return v === null ? fallback : v;
  }

  function calcTemplateBaseRate(row, templateSummary, fallbackRate) {
    const key = safeKey(row.basket_template || row.basket_template_label);
    return findCurveValue(templateSummary, "template", key, "avg_coupon", fallbackRate);
  }

  function calcRiskAdjustment(row, riskSurface, globalCoupon) {
    const key = safeKey(row.risk_zone_9 || row.risk_template);
    const v = findCurveValue(riskSurface, "risk_zone_9", key, "avg_coupon", globalCoupon);
    return (v - globalCoupon) * 0.35;
  }

  function calcTenorAdjustment(row, tenorCurve, globalBrake) {
    const key = safeKey(row.tenor_group_4 || row.tenor_template || row.tenor_bucket);
    const v = findCurveValue(tenorCurve, "tenor_group_4", key, "avg_market_implied_brake", globalBrake);
    return (v - globalBrake) * 0.45;
  }

  function calcStructureAdjustment(row, structureCurve, globalCoupon) {
    const key = safeKey(row.structure_template || row.type);
    const v = findCurveValue(structureCurve, "structure_template", key, "avg_coupon", globalCoupon);
    return (v - globalCoupon) * 0.12;
  }

  function calcM7OverlayAdjustment(row) {
    const m7 = pickNum(row.avg_m7_score, row.m7_score, row.score_avg);
    if (m7 === null) return 0;

    if (m7 >= 8.5) return -1.4;
    if (m7 >= 8.0) return -1.0;
    if (m7 >= 7.5) return -0.6;
    if (m7 >= 7.0) return -0.2;
    if (m7 >= 6.5) return 0.5;
    if (m7 >= 6.0) return 1.2;
    return 2.5;
  }

  function calcNewFairRate(row, curves, globals) {
    const coupon = getMarketCoupon(row);
    const oldFair = getOldFairRate(row);

    const templateBase = calcTemplateBaseRate(
      row,
      curves.templateSummary,
      globals.globalCoupon
    );

    const riskAdj = calcRiskAdjustment(
      row,
      curves.riskSurface,
      globals.globalCoupon
    );

    const tenorAdj = calcTenorAdjustment(
      row,
      curves.tenorCurve,
      globals.globalBrake
    );

    const structureAdj = calcStructureAdjustment(
      row,
      curves.structureCurve,
      globals.globalCoupon
    );

    const m7Adj = calcM7OverlayAdjustment(row);

    const newFairRate =
      templateBase +
      riskAdj +
      tenorAdj +
      structureAdj +
      m7Adj;

    return {
      template_base_rate: round2(templateBase),
      risk_adjustment: round2(riskAdj),
      tenor_adjustment: round2(tenorAdj),
      structure_adjustment: round2(structureAdj),
      m7_overlay_adjustment: round2(m7Adj),
      new_fair_rate: round2(newFairRate),
      pricing_gap_vs_old: coupon !== null && oldFair !== null ? round2(coupon - oldFair) : null,
      pricing_gap_vs_new: coupon !== null ? round2(coupon - newFairRate) : null,
      fair_rate_delta_old_to_new: oldFair !== null ? round2(newFairRate - oldFair) : null
    };
  }


  function buildTemplateRiskMatrix(rows) {
    const groups = groupBy(rows, r => [safeKey(r.basket_template), safeKey(r.risk_zone_9)].join("|"));
    return Array.from(groups.entries())
      .map(([k, rs]) => {
        const [template, riskZone] = k.split("|");
        return {
          ...summarizeGroup(k, rs, "template_risk_key"),
          template,
          template_label: (rs[0] && rs[0].basket_template_label) || template,
          risk_zone_9: riskZone,
          risk_zone_label: (rs[0] && rs[0].risk_zone_label) || RISK9_LABELS[riskZone] || riskZone,
          density_level: classifyDensity(rs.length),
          should_use_for_local_curve: rs.length >= 5
        };
      })
      .sort((a, b) => safeKey(a.template).localeCompare(safeKey(b.template)) || RISK9_ORDER.indexOf(a.risk_zone_9) - RISK9_ORDER.indexOf(b.risk_zone_9));
  }

  function buildTemplateRiskTenorMatrix(rows) {
    const groups = groupBy(rows, r => [safeKey(r.basket_template), safeKey(r.risk_zone_9), safeKey(r.tenor_group_4)].join("|"));
    const tenorOrder = ["T1_0_3M", "T2_4_6M", "T3_7_9M", "T4_10_12M", "T_UNKNOWN"];
    return Array.from(groups.entries())
      .map(([k, rs]) => {
        const [template, riskZone, tenorGroup] = k.split("|");
        return {
          ...summarizeGroup(k, rs, "template_risk_tenor_key"),
          template,
          template_label: (rs[0] && rs[0].basket_template_label) || template,
          risk_zone_9: riskZone,
          risk_zone_label: (rs[0] && rs[0].risk_zone_label) || RISK9_LABELS[riskZone] || riskZone,
          tenor_group_4: tenorGroup,
          tenor_group_label: (rs[0] && rs[0].tenor_group_label) || tenorGroup,
          density_level: classifyDensity(rs.length),
          should_use_for_local_curve: rs.length >= 5
        };
      })
      .sort((a, b) => safeKey(a.template).localeCompare(safeKey(b.template)) || RISK9_ORDER.indexOf(a.risk_zone_9) - RISK9_ORDER.indexOf(b.risk_zone_9) || tenorOrder.indexOf(a.tenor_group_4) - tenorOrder.indexOf(b.tenor_group_4));
  }

  function classifyDensity(count) {
    if (count >= 10) return "high_density";
    if (count >= 5) return "usable";
    if (count >= 2) return "thin";
    return "single_or_empty";
  }

  function buildLearningRecommendation(rows, templateRiskMatrix, templateRiskTenorMatrix) {
    const highDensityTR = arr(templateRiskMatrix).filter(r => r.count >= 5);
    const thinTR = arr(templateRiskMatrix).filter(r => r.count > 0 && r.count < 5);
    const usableTRT = arr(templateRiskTenorMatrix).filter(r => r.count >= 5);
    const thinTRT = arr(templateRiskTenorMatrix).filter(r => r.count > 0 && r.count < 5);

    const byTemplate = Array.from(groupBy(rows, r => r.basket_template).entries())
      .map(([template, rs]) => ({
        template,
        count: rs.length,
        active_risk_zones: new Set(rs.map(r => r.risk_zone_9)).size,
        active_tenor_groups: new Set(rs.map(r => r.tenor_group_4)).size,
        avg_coupon: round2(avg(rs.map(getMarketCoupon).filter(Number.isFinite))),
        avg_implied_brake: round2(avg(rs.map(getMarketImpliedBrake).filter(Number.isFinite)))
      }))
      .sort((a, b) => b.count - a.count);

    return {
      note: "Use Template x Risk first. Use Template x Risk x Tenor only when count >= 5; otherwise fallback to Template x Risk, then Template.",
      min_count_for_local_curve: 5,
      total_rows: rows.length,
      usable_template_risk_blocks: highDensityTR.length,
      thin_template_risk_blocks: thinTR.length,
      usable_template_risk_tenor_blocks: usableTRT.length,
      thin_template_risk_tenor_blocks: thinTRT.length,
      template_density: byTemplate
    };
  }



  // --------------------------------------------------------------------------
  // M8 v3 Small Template Clean Surface Layer
  // New Fair = Small Template × Risk × Tenor clean surface.
  // Large templates are kept for grouping and fallback only.
  // --------------------------------------------------------------------------

  function percentile(values, p) {
    const xs = arr(values).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
    if (!xs.length) return null;
    const idx = Math.min(xs.length - 1, Math.max(0, Math.floor((xs.length - 1) * p)));
    return xs[idx];
  }

  function getTradeDate(row) {
    return String(row.trade_date || row.date || row.created_time || row.entry_time || "").slice(0, 10);
  }

  function isStressRegime(row) {
    const d = getTradeDate(row);
    return d.startsWith("2025-04") || d.startsWith("2025-05");
  }

  function getSmallTemplateKey(row) {
    return safeKey(row.core_dna_3 || row.core_dna_2 || row.basket_symbols_key || arr(row.symbols).join("+"));
  }

  function getLargeTemplateKey(row) {
    return safeKey(row.basket_template_label || row.basket_template || "GLOBAL");
  }

  function classifyCleanRow(row, couponQ95) {
    const coupon = getMarketCoupon(row);
    const smallTemplate = getSmallTemplateKey(row);
    const missingRequired = coupon === null || !smallTemplate || smallTemplate === "UNKNOWN";
    const outlierFlag = coupon !== null && couponQ95 !== null && coupon > couponQ95;
    const stressFlag = isStressRegime(row);
    const oldPoolFlag = String(row.source_type || row.source_name || "").toLowerCase().includes("old");

    let learningWeight = 1;
    if (stressFlag) learningWeight = 0.2;
    if (oldPoolFlag) learningWeight = Math.min(learningWeight, 0.25);

    const cleanRow = !missingRequired && !outlierFlag;

    return {
      ...row,
      small_template_key: smallTemplate,
      large_template_key: getLargeTemplateKey(row),
      clean_row: cleanRow,
      outlier_flag: outlierFlag,
      stress_flag: stressFlag,
      old_pool_reference: oldPoolFlag,
      missing_surface_fields: missingRequired,
      learning_weight: round2(learningWeight)
    };
  }

  function buildCleanDataset(rows) {
    const validCoupons = arr(rows).map(getMarketCoupon).filter(Number.isFinite);
    const couponQ95 = percentile(validCoupons, 0.95);
    return arr(rows).map(row => classifyCleanRow(row, couponQ95));
  }

  function weightedAverage(items, valueFn, weightFn) {
    let total = 0;
    let weightSum = 0;
    arr(items).forEach(item => {
      const v = Number(valueFn(item));
      const w = Math.max(0, Number(weightFn(item)) || 0);
      if (Number.isFinite(v) && w > 0) {
        total += v * w;
        weightSum += w;
      }
    });
    return weightSum > 0 ? total / weightSum : null;
  }

  function weightedMedian(items, valueFn, weightFn) {
    const xs = arr(items)
      .map(item => ({ value: Number(valueFn(item)), weight: Math.max(0, Number(weightFn(item)) || 0) }))
      .filter(x => Number.isFinite(x.value) && x.weight > 0)
      .sort((a, b) => a.value - b.value);
    if (!xs.length) return null;
    const totalWeight = xs.reduce((sum, x) => sum + x.weight, 0);
    let cumulative = 0;
    for (const x of xs) {
      cumulative += x.weight;
      if (cumulative >= totalWeight / 2) return x.value;
    }
    return xs[xs.length - 1].value;
  }

  function calcSurfaceConfidence(count, level) {
    let base = 20;
    if (count >= 10) base = 90;
    else if (count >= 7) base = 75;
    else if (count >= 5) base = 60;
    else if (count >= 3) base = 40;

    if (String(level).includes("Small Template × Risk × Tenor")) return base;
    if (String(level).includes("Small Template × Risk")) return Math.max(0, base - 10);
    if (String(level).includes("Small Template")) return Math.max(0, base - 20);
    if (String(level).includes("Large Template")) return Math.max(0, base - 30);
    return Math.max(0, base - 40);
  }

  function summarizeSurfaceBucket(key, rows, level) {
    const coupons = arr(rows).map(getMarketCoupon).filter(Number.isFinite);
    const med = weightedMedian(rows, getMarketCoupon, r => pickNum(r.learning_weight, 1));
    const wavg = weightedAverage(rows, getMarketCoupon, r => pickNum(r.learning_weight, 1));
    return {
      surface_key: key,
      fallback_level: level,
      sample_count: rows.length,
      median_coupon: round2(med),
      weighted_avg_coupon: round2(wavg),
      avg_coupon: round2(avg(coupons)),
      std_coupon: round2(calcStd(coupons)),
      confidence: calcSurfaceConfidence(rows.length, level),
      source_mix: countByObject(rows, r => r.source_type || r.source_name || "unknown")
    };
  }

  function countByObject(rows, fn) {
    const out = {};
    arr(rows).forEach(row => {
      const k = safeKey(fn(row));
      out[k] = (out[k] || 0) + 1;
    });
    return out;
  }

  function calcStd(values) {
    const xs = arr(values).map(Number).filter(Number.isFinite);
    if (xs.length <= 1) return 0;
    const m = avg(xs);
    return Math.sqrt(avg(xs.map(x => Math.pow(x - m, 2))));
  }

  function pushSurfaceBucket(map, key, row) {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }

  function buildSmallTemplateSurface(classifiedRows) {
    const surfaceMaps = {
      small_risk_tenor: new Map(),
      small_risk: new Map(),
      small: new Map(),
      large_risk_tenor: new Map(),
      large: new Map(),
      global: new Map()
    };

    arr(classifiedRows)
      .filter(r => r.clean_row)
      .forEach(row => {
        const small = getSmallTemplateKey(row);
        const large = getLargeTemplateKey(row);
        const risk = safeKey(row.risk_zone_9 || row.risk_template, "R_UNKNOWN");
        const tenor = safeKey(row.tenor_group_4 || row.tenor_template || row.tenor_bucket, "T_UNKNOWN");

        pushSurfaceBucket(surfaceMaps.small_risk_tenor, [small, risk, tenor].join("|"), row);
        pushSurfaceBucket(surfaceMaps.small_risk, [small, risk].join("|"), row);
        pushSurfaceBucket(surfaceMaps.small, small, row);
        pushSurfaceBucket(surfaceMaps.large_risk_tenor, [large, risk, tenor].join("|"), row);
        pushSurfaceBucket(surfaceMaps.large, large, row);
        pushSurfaceBucket(surfaceMaps.global, "GLOBAL", row);
      });

    function materialize(map, level) {
      const out = new Map();
      Array.from(map.entries()).forEach(([key, rows]) => {
        out.set(key, summarizeSurfaceBucket(key, rows, level));
      });
      return out;
    }

    return {
      small_risk_tenor: materialize(surfaceMaps.small_risk_tenor, "Small Template × Risk × Tenor"),
      small_risk: materialize(surfaceMaps.small_risk, "Small Template × Risk"),
      small: materialize(surfaceMaps.small, "Small Template"),
      large_risk_tenor: materialize(surfaceMaps.large_risk_tenor, "Large Template × Risk × Tenor"),
      large: materialize(surfaceMaps.large, "Large Template"),
      global: materialize(surfaceMaps.global, "Global")
    };
  }

  function surfaceLookupKeys(row) {
    const small = getSmallTemplateKey(row);
    const large = getLargeTemplateKey(row);
    const risk = safeKey(row.risk_zone_9 || row.risk_template, "R_UNKNOWN");
    const tenor = safeKey(row.tenor_group_4 || row.tenor_template || row.tenor_bucket, "T_UNKNOWN");
    return [
      { mapName: "small_risk_tenor", key: [small, risk, tenor].join("|"), level: "Small Template × Risk × Tenor" },
      { mapName: "small_risk", key: [small, risk].join("|"), level: "Small Template × Risk" },
      { mapName: "small", key: small, level: "Small Template" },
      { mapName: "large_risk_tenor", key: [large, risk, tenor].join("|"), level: "Large Template × Risk × Tenor" },
      { mapName: "large", key: large, level: "Large Template" },
      { mapName: "global", key: "GLOBAL", level: "Global" }
    ];
  }

  function resolveSurfaceFallback(row, surface) {
    const minCounts = {
      "Small Template × Risk × Tenor": 3,
      "Small Template × Risk": 3,
      "Small Template": 3,
      "Large Template × Risk × Tenor": 5,
      "Large Template": 5,
      "Global": 1
    };

    const candidateTrace = surfaceLookupKeys(row).map(candidate => {
      const bucket = surface[candidate.mapName] && surface[candidate.mapName].get(candidate.key);
      const min_count = minCounts[candidate.level] || 1;
      return {
        level: candidate.level,
        key: candidate.key,
        min_count,
        sample_count: bucket ? bucket.sample_count : 0,
        eligible: !!(bucket && bucket.sample_count >= min_count),
        median_coupon: bucket ? bucket.median_coupon : null,
        weighted_avg_coupon: bucket ? bucket.weighted_avg_coupon : null,
        avg_coupon: bucket ? bucket.avg_coupon : null,
        std_coupon: bucket ? bucket.std_coupon : null,
        confidence: bucket ? bucket.confidence : 0
      };
    });

    for (const candidate of surfaceLookupKeys(row)) {
      const bucket = surface[candidate.mapName] && surface[candidate.mapName].get(candidate.key);
      if (bucket && bucket.sample_count >= (minCounts[candidate.level] || 1)) {
        return {
          ...bucket,
          matched_key: candidate.key,
          fallback_level: candidate.level,
          min_count_required: minCounts[candidate.level] || 1,
          candidate_trace: candidateTrace
        };
      }
    }

    return {
      fallback_level: "Old Fair Fallback",
      matched_key: null,
      surface_key: null,
      sample_count: 0,
      median_coupon: null,
      weighted_avg_coupon: null,
      avg_coupon: null,
      std_coupon: null,
      confidence: 0,
      min_count_required: 0,
      candidate_trace: candidateTrace
    };
  }

  function predictNewFairRate(row, surface) {
    const resolved = resolveSurfaceFallback(row, surface);
    const oldFair = getOldFairRate(row);

    // v3 rule: New Fair is based on AVG, not median.
    // Prefer the plain surface average so the dashboard labels can correctly say
    // New Fair-AVG / Final Fair-AVG. Weighted average remains visible in trace.
    const selected = pickNum(resolved.avg_coupon, resolved.weighted_avg_coupon, resolved.median_coupon, oldFair);
    const calculationMethod = resolved && resolved.avg_coupon !== null
      ? "New Fair-AVG = selected surface avg_market_coupon"
      : "New Fair-AVG = old fair fallback because no eligible clean surface";
    return {
      template_base_rate: resolved && resolved.avg_coupon !== null ? round2(resolved.avg_coupon) : null,
      risk_adjustment: 0,
      tenor_adjustment: 0,
      structure_adjustment: 0,
      m7_overlay_adjustment: 0,
      new_fair_rate: round2(selected),
      clean_global_fair: round2(selected),
      surface_key: resolved ? resolved.surface_key : null,
      surface_matched_key: resolved ? resolved.matched_key : null,
      fallback_level: resolved ? resolved.fallback_level : "Old Fair Fallback",
      lookup_count: resolved ? resolved.sample_count : 0,
      min_count_required: resolved ? resolved.min_count_required : 0,
      surface_confidence: resolved ? resolved.confidence : 0,
      surface_median_coupon: resolved ? resolved.median_coupon : null,
      surface_weighted_avg_coupon: resolved ? resolved.weighted_avg_coupon : null,
      surface_avg_coupon: resolved ? resolved.avg_coupon : null,
      surface_std_coupon: resolved ? resolved.std_coupon : null,
      surface_candidate_trace: resolved ? resolved.candidate_trace : [],
      surface_calculation_method: calculationMethod
    };
  }

  function explainNewFairTrace(row) {
    return {
      small_template: row.small_template_key || getSmallTemplateKey(row),
      large_template: row.large_template_key || getLargeTemplateKey(row),
      risk_zone: row.risk_zone_9,
      tenor_group: row.tenor_group_4,
      surface_key: row.surface_key,
      surface_matched_key: row.surface_matched_key,
      fallback_level: row.fallback_level,
      lookup_count: row.lookup_count,
      min_count_required: row.min_count_required,
      surface_confidence: row.surface_confidence,
      surface_median_coupon: row.surface_median_coupon,
      surface_weighted_avg_coupon: row.surface_weighted_avg_coupon,
      surface_avg_coupon: row.surface_avg_coupon,
      surface_std_coupon: row.surface_std_coupon,
      surface_calculation_method: row.surface_calculation_method,
      surface_candidate_trace: row.surface_candidate_trace || [],
      old_fair_rate: getOldFairRate(row),
      new_fair_rate: row.clean_global_fair || row.new_fair_rate,
      overlay_beta: row.overlay_beta,
      final_fair_rate: row.final_fair_rate,
      gap_vs_old: row.pricing_gap_vs_old,
      gap_before: row.pricing_gap_vs_new,
      gap_after: row.pricing_gap_vs_final,
      gap_after_pct: row.pricing_gap_vs_final_pct,
      improvement_pct: row.improvement_pct
    };
  }


  // --------------------------------------------------------------------------
  // M8 v3 Overlay Lifecycle Layer
  // This layer does not mutate the clean global surface. It adds adaptive beta
  // fields and final_fair_rate for analysis/reporting only.
  // --------------------------------------------------------------------------

  function calcPricingGapPct(marketCoupon, fairRate) {
    const m = Number(marketCoupon);
    const f = Number(fairRate);
    if (!Number.isFinite(m) || !Number.isFinite(f) || f === 0) return null;
    return ((m - f) / f) * 100;
  }

  function buildOverlayHistoryKey(row) {
    return [
      safeKey(row.basket_template),
      safeKey(row.core_dna_3 || row.core_dna_2 || row.basket_symbols_key),
      safeKey(row.risk_zone_9),
      safeKey(row.tenor_group_4)
    ].join("|");
  }

  function buildOverlayHistoryMap(rows) {
    const map = new Map();
    arr(rows).forEach(row => {
      const k = buildOverlayHistoryKey(row);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(row);
    });
    return map;
  }

  function calcCleanGlobalFair(row) {
    return pickNum(row.clean_global_fair, row.new_fair_rate, getOldFairRate(row)) || 0;
  }

  function applyOverlayLifecycle(rows) {
    const overlayEngine = global.M8OverlayEngineV1;

    const enriched = arr(rows).map(row => {
      const coupon = getMarketCoupon(row);
      const oldFair = getOldFairRate(row);
      const cleanGlobalFair = calcCleanGlobalFair(row);

      return {
        ...row,
        clean_global_fair: round2(cleanGlobalFair),
        pricing_gap_vs_old_pct: coupon !== null && oldFair !== null ? round2(calcPricingGapPct(coupon, oldFair)) : null,
        pricing_gap_vs_clean_pct: coupon !== null && cleanGlobalFair ? round2(calcPricingGapPct(coupon, cleanGlobalFair)) : null
      };
    });

    if (!overlayEngine || typeof overlayEngine.evaluateOverlayTrigger !== "function") {
      return enriched.map(row => ({
        ...row,
        overlay_state: "NONE",
        overlay_beta: 1,
        overlay_confidence: 0,
        residual_sample_count: 0,
        residual_persistence_days: 0,
        residual_same_direction_ratio: 0,
        residual_std: null,
        final_fair_rate: row.clean_global_fair,
        pricing_gap_vs_final: row.pricing_gap_vs_new,
        lifecycle_state: "NONE",
        one_time_trigger: false,
        trigger_reason: "overlay_engine_not_loaded"
      }));
    }

    const historyMap = buildOverlayHistoryMap(enriched);

    return enriched.map(row => {
      const coupon = getMarketCoupon(row);
      const key = buildOverlayHistoryKey(row);
      const history = historyMap.get(key) || [];
      const historyForOverlay = history.map(h => ({
        ...h,
        pricing_gap_vs_old_pct: h.pricing_gap_vs_clean_pct
      }));
      const trigger = overlayEngine.evaluateOverlayTrigger(historyForOverlay);
      const cleanGlobalFair = pickNum(row.clean_global_fair, row.new_fair_rate);
      const oldFair = getOldFairRate(row);
      const baseBeta = pickNum(trigger.overlay_beta, 1);

const gapSeverityPct =
  coupon !== null && cleanGlobalFair !== null && cleanGlobalFair !== 0
    ? Math.abs((coupon - cleanGlobalFair) / cleanGlobalFair) * 100
    : 0;

let severityBeta = 1;

if (gapSeverityPct >= 25) {
  severityBeta = 1.50;
} else if (gapSeverityPct >= 20) {
  severityBeta = 1.35;
} else if (gapSeverityPct >= 15) {
  severityBeta = 1.25;
} else if (gapSeverityPct >= 10) {
  severityBeta = 1.15;
} else if (gapSeverityPct >= 5) {
  severityBeta = 1.08;
}

const beta = Math.max(baseBeta, severityBeta);

      // v3 anchor rule:
      // Final Fair is no longer New Fair × β.
      // It is an M8 feedback adjustment anchored on Old Fair:
      // Final Fair = Old Fair + β × (Clean Global/New Fair - Old Fair).
      // This lets the correction feed back to the original M8 fair rate instead
      // of adjusting the new surface against itself.
      let finalFairRate = null;
      if (cleanGlobalFair !== null && oldFair !== null) {
        finalFairRate = oldFair + beta * (cleanGlobalFair - oldFair);
      } else if (cleanGlobalFair !== null) {
        finalFairRate = cleanGlobalFair * beta;
      }

      const gapBefore = coupon !== null && cleanGlobalFair !== null ? coupon - cleanGlobalFair : null;
      const gapAfter = coupon !== null && finalFairRate !== null ? coupon - finalFairRate : null;
      const improvement = gapBefore !== null && Math.abs(gapBefore) > 0.01 && gapAfter !== null
        ? (1 - (Math.abs(gapAfter) / Math.abs(gapBefore))) * 100
        : null;
      const outputRow = {
        ...row,
        overlay_key: key,
        overlay_state: trigger.overlay_state,
        overlay_beta: beta,
        overlay_confidence: trigger.overlay_confidence,
        overlay_target_beta: trigger.target_beta,
        one_time_trigger: !!trigger.one_time_trigger,
        should_trigger_overlay: !!trigger.should_trigger_overlay,
        trigger_reason: trigger.trigger_reason,
        residual_sample_count: trigger.sample_count,
        residual_persistence_days: trigger.persistence_days,
        residual_same_direction_ratio: trigger.direction_consistency,
        residual_direction: trigger.dominant_direction,
        residual_std: trigger.residual_std,
        residual_avg_gap_pct: trigger.avg_gap_pct,
        final_fair_rate: round2(finalFairRate),
        final_fair_method: oldFair !== null ? "Old Fair + β × (New Fair-AVG - Old Fair)" : "New Fair-AVG × β fallback",
        old_fair_anchor_rate: oldFair !== null ? round2(oldFair) : null,
        global_regression_rate: cleanGlobalFair !== null ? round2(cleanGlobalFair) : null,
        pricing_gap_vs_final: gapAfter !== null ? round2(gapAfter) : null,
        pricing_gap_vs_final_pct: coupon !== null && finalFairRate ? round2(calcPricingGapPct(coupon, finalFairRate)) : null,
        gap_before: gapBefore !== null ? round2(gapBefore) : null,
        gap_before_pct: coupon !== null && cleanGlobalFair ? round2(calcPricingGapPct(coupon, cleanGlobalFair)) : null,
        gap_after: gapAfter !== null ? round2(gapAfter) : null,
        gap_after_pct: coupon !== null && finalFairRate ? round2(calcPricingGapPct(coupon, finalFairRate)) : null,
        improvement_pct: round2(improvement),
        lifecycle_state: trigger.overlay_state,
        dormant_candidate: trigger.overlay_state === "DORMANT" || trigger.overlay_state === "DECAY"
      };
      return {
        ...outputRow,
        explain_trace: explainNewFairTrace(outputRow)
      };
    });
  }

  function buildOverlaySummary(rows) {
    const groups = groupBy(rows, r => r.overlay_key || "UNKNOWN");
    return Array.from(groups.entries())
      .map(([k, rs]) => {
        const avgMarket = avg(rs.map(getMarketCoupon).filter(Number.isFinite));
        const avgOldFair = avg(rs.map(getOldFairRate).filter(Number.isFinite));
        const avgNewFair = avg(rs.map(r => r.clean_global_fair).filter(Number.isFinite));
        const avgFinalFair = avg(rs.map(r => r.final_fair_rate).filter(Number.isFinite));
        const gapOld = avgMarket !== null && avgOldFair !== null ? avgMarket - avgOldFair : null;
        const gapOldPct = avgOldFair ? (gapOld / avgOldFair) * 100 : null;
        const gapBefore = avgMarket !== null && avgNewFair !== null ? avgMarket - avgNewFair : null;
        const gapAfter = avgMarket !== null && avgFinalFair !== null ? avgMarket - avgFinalFair : null;
        const gapBeforePct = avgNewFair ? (gapBefore / avgNewFair) * 100 : null;
        const gapAfterPct = avgFinalFair ? (gapAfter / avgFinalFair) * 100 : null;
        const improvement = gapBefore !== null && Math.abs(gapBefore) > 0.01 && gapAfter !== null
          ? (1 - (Math.abs(gapAfter) / Math.abs(gapBefore))) * 100
          : null;
        return {
          overlay_key: k,
          template: (rs[0] && rs[0].basket_template_label) || (rs[0] && rs[0].basket_template) || "",
          core_dna: (rs[0] && (rs[0].core_dna_3 || rs[0].core_dna_2 || rs[0].basket_symbols_key)) || "",
          risk_zone_9: (rs[0] && rs[0].risk_zone_9) || "",
          tenor_group_4: (rs[0] && rs[0].tenor_group_4) || "",
          count: rs.length,
          overlay_state: (rs[0] && rs[0].overlay_state) || "NONE",
          avg_market_coupon: round2(avgMarket),
          avg_old_fair_rate: round2(avgOldFair),
          avg_gap_old: round2(gapOld),
          avg_gap_old_pct: round2(gapOldPct),
          avg_new_fair_rate: round2(avgNewFair),
          avg_beta: round2(avg(rs.map(r => r.overlay_beta))),
          avg_confidence: round2(avg(rs.map(r => r.overlay_confidence))),
          avg_residual_gap_pct: round2(gapBeforePct),
          avg_residual_std: round2(avg(rs.map(r => r.residual_std))),
          avg_final_fair_rate: round2(avgFinalFair),
          avg_gap_before: round2(gapBefore),
          avg_gap_before_pct: round2(gapBeforePct),
          avg_gap_after: round2(gapAfter),
          avg_gap_after_pct: round2(gapAfterPct),
          avg_gap_vs_final: round2(gapAfter),
          improvement_pct: round2(improvement),
          one_time_triggers: rs.filter(r => r.one_time_trigger).length,
          active_rows: rs.filter(r => ["ACTIVE", "LEARNING"].includes(r.overlay_state)).length
        };
      })
      .sort((a, b) => (b.avg_confidence || 0) - (a.avg_confidence || 0));
  }

  function buildTemplateOverlayEffectiveness(rows) {
    const groups = groupBy(rows, r => r.basket_template_label || r.basket_template || "UNKNOWN");
    return Array.from(groups.entries())
      .map(([template, rs]) => {
        const avgMarket = avg(rs.map(getMarketCoupon).filter(Number.isFinite));
        const avgOldFair = avg(rs.map(getOldFairRate).filter(Number.isFinite));
        const avgNewFair = avg(rs.map(r => r.clean_global_fair).filter(Number.isFinite));
        const avgFinalFair = avg(rs.map(r => r.final_fair_rate).filter(Number.isFinite));
        const gapOld = avgMarket !== null && avgOldFair !== null ? avgMarket - avgOldFair : null;
        const gapOldPct = avgOldFair ? (gapOld / avgOldFair) * 100 : null;
        const gapBefore = avgMarket !== null && avgNewFair !== null ? avgMarket - avgNewFair : null;
        const gapAfter = avgMarket !== null && avgFinalFair !== null ? avgMarket - avgFinalFair : null;
        const gapBeforePct = avgNewFair ? (gapBefore / avgNewFair) * 100 : null;
        const gapAfterPct = avgFinalFair ? (gapAfter / avgFinalFair) * 100 : null;
        const improvement = gapBefore !== null && Math.abs(gapBefore) > 0.01 && gapAfter !== null
          ? (1 - (Math.abs(gapAfter) / Math.abs(gapBefore))) * 100
          : null;
        const activeRows = rs.filter(r => ["ACTIVE", "LEARNING"].includes(r.overlay_state)).length;
        const stateCounts = rs.reduce((acc, r) => {
          const k = r.overlay_state || "NONE";
          acc[k] = (acc[k] || 0) + 1;
          return acc;
        }, {});
        const dominantState = Object.entries(stateCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "NONE";
        return {
          template,
          fcn_count: rs.length,
          active_rows: activeRows,
          overlay_state: dominantState,
          avg_market_coupon: round2(avgMarket),
          avg_fair_rate: round2(avgOldFair),
          avg_new_fair_rate: round2(avgNewFair),
          gap_old: round2(gapOld),
          gap_old_pct: round2(gapOldPct),
          avg_beta: round2(avg(rs.map(r => r.overlay_beta))),
          avg_final_fair_rate: round2(avgFinalFair),
          gap_before: round2(gapBefore),
          gap_before_pct: round2(gapBeforePct),
          gap_after: round2(gapAfter),
          gap_after_pct: round2(gapAfterPct),
          improvement_pct: round2(improvement),
          avg_confidence: round2(avg(rs.map(r => r.overlay_confidence))),
          one_time_trigger_count: rs.filter(r => r.one_time_trigger).length
        };
      })
      .sort((a, b) => Math.abs(b.gap_before || 0) - Math.abs(a.gap_before || 0));
  }

  function runM8Regression(rows) {
    const validRows = arr(rows)
      .filter(r => getMarketCoupon(r) !== null)
      .map(addCompressionFields);

    const classifiedRows = buildCleanDataset(validRows);
    const smallTemplateSurface = buildSmallTemplateSurface(classifiedRows);

    // Legacy summaries remain for dashboard/database views. New Fair no longer uses
    // the large-template average logic; it comes from smallTemplateSurface.
    const templateSummary = buildTemplateSummary(classifiedRows);
    const riskSurface = buildRiskSurface(classifiedRows);
    const rawRiskSurface = buildRawRiskSurface(classifiedRows);
    const tenorCurve = buildTenorCurve(classifiedRows);
    const structureCurve = buildStructureCurve(classifiedRows);
    const m7Overlay = buildM7Overlay(classifiedRows);
    const dnaStats = buildDNAStats(classifiedRows);

    const globalCoupon = globalMeanCoupon(classifiedRows);
    const globalBrake = avg(classifiedRows.map(getMarketImpliedBrake).filter(Number.isFinite)) || 0;

    const globals = {
      globalCoupon,
      globalBrake
    };

    const calibratedRowsBase = classifiedRows.map(r => {
      const fairResult = predictNewFairRate(r, smallTemplateSurface);
      const coupon = getMarketCoupon(r);
      const oldFair = getOldFairRate(r);
      const newFair = pickNum(fairResult.new_fair_rate);
      return {
        ...r,
        ...fairResult,
        pricing_gap_vs_old: coupon !== null && oldFair !== null ? round2(coupon - oldFair) : null,
        pricing_gap_vs_new: coupon !== null && newFair !== null ? round2(coupon - newFair) : null,
        fair_rate_delta_old_to_new: oldFair !== null && newFair !== null ? round2(newFair - oldFair) : null
      };
    });

    const calibratedRows = applyOverlayLifecycle(calibratedRowsBase);

    const templateRiskMatrix = buildTemplateRiskMatrix(calibratedRows);
    const templateRiskTenorMatrix = buildTemplateRiskTenorMatrix(calibratedRows);
    const learningRecommendation = buildLearningRecommendation(
      calibratedRows,
      templateRiskMatrix,
      templateRiskTenorMatrix
    );

    const relationshipSummary = {
      avg_market_coupon: round2(avg(calibratedRows.map(getMarketCoupon))),
      avg_old_fair_rate: round2(avg(calibratedRows.map(getOldFairRate))),
      avg_new_fair_rate: round2(avg(calibratedRows.map(r => r.new_fair_rate))),
      avg_final_fair_rate: round2(avg(calibratedRows.map(r => r.final_fair_rate))),
      avg_gap_vs_old: round2(avg(calibratedRows.map(r => r.pricing_gap_vs_old))),
      avg_gap_vs_new: round2(avg(calibratedRows.map(r => r.pricing_gap_vs_new))),
      avg_gap_vs_final: round2(avg(calibratedRows.map(r => r.pricing_gap_vs_final))),
      avg_old_to_new_delta: round2(avg(calibratedRows.map(r => r.fair_rate_delta_old_to_new)))
    };

    return {
      version: VERSION,
      generated_at: new Date().toISOString(),
      rows_used: calibratedRows.length,
      clean_rows_used: classifiedRows.filter(r => r.clean_row).length,
      rows_removed_from_surface: classifiedRows.filter(r => !r.clean_row).length,
      globals,
      relationship_summary: relationshipSummary,
      template_summary: templateSummary,
      risk_surface: riskSurface,
      raw_risk_surface: rawRiskSurface,
      tenor_curve: tenorCurve,
      structure_curve: structureCurve,
      m7_overlay: m7Overlay,
      dna_stats: dnaStats,
      template_risk_matrix: templateRiskMatrix,
      template_risk_tenor_matrix: templateRiskTenorMatrix,
      learning_recommendation: learningRecommendation,
      small_template_surface: serializeSurface(smallTemplateSurface),
      overlay_summary: buildOverlaySummary(calibratedRows),
      template_overlay_effectiveness: buildTemplateOverlayEffectiveness(calibratedRows),
      calibrated_rows: calibratedRows
    };
  }

  function serializeSurface(surface) {
    const out = {};
    Object.keys(surface || {}).forEach(level => {
      out[level] = Array.from(surface[level].values ? surface[level].values() : []);
    });
    return out;
  }

  global.M8RegressionEngineV1 = {
    VERSION,
    runM8Regression,
    buildTemplateSummary,
    buildRiskSurface,
    buildRawRiskSurface,
    buildTenorCurve,
    buildStructureCurve,
    buildM7Overlay,
    buildDNAStats,
    buildTemplateRiskMatrix,
    buildTemplateRiskTenorMatrix,
    buildLearningRecommendation,
    classifyRiskZone9,
    classifyTenorGroup4,
    calcNewFairRate,
    applyOverlayLifecycle,
    buildOverlaySummary,
    buildTemplateOverlayEffectiveness,
    buildCleanDataset,
    buildSmallTemplateSurface,
    predictNewFairRate,
    resolveSurfaceFallback,
    explainNewFairTrace
  };

})(window);





