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

  const VERSION = "m8_regression_engine_v1_20260508_risk9_tenor4";

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
    return pickNum(row.new_fair_rate) || 0;
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
      const trigger = overlayEngine.evaluateOverlayTrigger(history);
      const cleanGlobalFair = pickNum(row.clean_global_fair, row.new_fair_rate);
      const beta = pickNum(trigger.overlay_beta, 1);
      const finalFairRate = cleanGlobalFair !== null ? cleanGlobalFair * beta : null;

      return {
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
        pricing_gap_vs_final: coupon !== null && finalFairRate !== null ? round2(coupon - finalFairRate) : null,
        pricing_gap_vs_final_pct: coupon !== null && finalFairRate ? round2(calcPricingGapPct(coupon, finalFairRate)) : null,
        lifecycle_state: trigger.overlay_state,
        dormant_candidate: trigger.overlay_state === "DORMANT" || trigger.overlay_state === "DECAY"
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

    const templateSummary = buildTemplateSummary(validRows);
    const riskSurface = buildRiskSurface(validRows);
    const rawRiskSurface = buildRawRiskSurface(validRows);
    const tenorCurve = buildTenorCurve(validRows);
    const structureCurve = buildStructureCurve(validRows);
    const m7Overlay = buildM7Overlay(validRows);
    const dnaStats = buildDNAStats(validRows);

    const globalCoupon = globalMeanCoupon(validRows);
    const globalBrake = avg(validRows.map(getMarketImpliedBrake).filter(Number.isFinite)) || 0;

    const curves = {
      templateSummary,
      riskSurface,
      tenorCurve,
      structureCurve
    };

    const globals = {
      globalCoupon,
      globalBrake
    };

    const calibratedRowsBase = validRows.map(r => {
      const regression = calcNewFairRate(r, curves, globals);
      return {
        ...r,
        ...regression
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
      overlay_summary: buildOverlaySummary(calibratedRows),
      template_overlay_effectiveness: buildTemplateOverlayEffectiveness(calibratedRows),
      calibrated_rows: calibratedRows
    };
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
    buildTemplateOverlayEffectiveness
  };

})(window);


