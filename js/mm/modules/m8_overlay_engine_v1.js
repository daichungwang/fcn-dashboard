// ============================================================================
// M8 Overlay Engine v1
// Path: js/mm/modules/m8_overlay_engine_v1.js
// Purpose:
// 1. Overlay Trigger Engine
// 2. Adaptive Beta Learning
// 3. Template Lifecycle Management
// 4. Overlay Decay / Dormant System
// ============================================================================

(function (global) {
  "use strict";

  const VERSION = "m8_overlay_engine_v1_20260509_fixed";

  const STATES = {
    NONE: "NONE",
    WATCH: "WATCH",
    ACTIVE: "ACTIVE",
    LEARNING: "LEARNING",
    DECAY: "DECAY",
    DORMANT: "DORMANT"
  };

  const DEFAULT_CONFIG = {
    watch_gap_pct: 15,
    trigger_gap_pct: 20,
    min_watch_count: 3,
    min_active_count: 5,
    min_learning_count: 10,
    min_active_persistence_days: 2,
    min_learning_persistence_days: 5,
    min_direction_ratio_active: 0.70,
    min_direction_ratio_learning: 0.80,
    max_std_active: 15,
    max_std_learning: 10,
    positive_beta_weak: 1.08,
    positive_beta_strong: 1.15,
    negative_beta_weak: 0.95,
    negative_beta_strong: 0.92,
    learning_rate_watch: 0.15,
    learning_rate_active: 0.25,
    learning_rate_learning: 0.35,
    decay_factor: 0.95
  };

  function arr(v) {
    return Array.isArray(v) ? v : [];
  }

  function toNum(v, d = null) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function round2(v) {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
  }

  function avg(values) {
    const xs = arr(values).map(Number).filter(Number.isFinite);
    if (!xs.length) return null;
    return xs.reduce((a, b) => a + b, 0) / xs.length;
  }

  function std(values) {
    const xs = arr(values).map(Number).filter(Number.isFinite);
    if (xs.length <= 1) return 0;
    const m = avg(xs);
    const variance = avg(xs.map(x => Math.pow(x - m, 2)));
    return Math.sqrt(variance);
  }

  function calcGapPercent(marketCoupon, fairRate) {
    const m = toNum(marketCoupon);
    const f = toNum(fairRate);
    if (m === null || f === null || f === 0) return null;
    return ((m - f) / f) * 100;
  }

  function calcDirectionConsistency(gaps) {
    const xs = arr(gaps).map(Number).filter(Number.isFinite).filter(v => Math.abs(v) > 0.0001);
    if (!xs.length) return 0;
    const positive = xs.filter(v => v > 0).length;
    const negative = xs.filter(v => v < 0).length;
    return Math.max(positive, negative) / xs.length;
  }

  function calcDominantDirection(gaps) {
    const xs = arr(gaps).map(Number).filter(Number.isFinite).filter(v => Math.abs(v) > 0.0001);
    if (!xs.length) return "flat";
    const positive = xs.filter(v => v > 0).length;
    const negative = xs.filter(v => v < 0).length;
    if (positive > negative) return "positive";
    if (negative > positive) return "negative";
    return "mixed";
  }

  function calcOverlayConfidence(stats, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const sampleScore = Math.min((stats.sample_count || 0) / cfg.min_learning_count, 1) * 30;
    const persistenceScore = Math.min((stats.persistence_days || 0) / cfg.min_learning_persistence_days, 1) * 30;
    const directionScore = toNum(stats.direction_consistency, 0) * 25;

    let stdScore = 0;
    const residualStd = toNum(stats.residual_std, Infinity);
    if (residualStd <= 5) stdScore = 15;
    else if (residualStd <= cfg.max_std_learning) stdScore = 10;
    else if (residualStd <= cfg.max_std_active) stdScore = 5;

    return round2(sampleScore + persistenceScore + directionScore + stdScore);
  }

  function determineOverlayState(stats, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const sampleCount = toNum(stats.sample_count, 0);
    const persistenceDays = toNum(stats.persistence_days, 0);
    const directionConsistency = toNum(stats.direction_consistency, 0);
    const residualStd = toNum(stats.residual_std, Infinity);
    const absGap = Math.abs(toNum(stats.avg_gap_pct, 0));

    const learningReady =
      sampleCount >= cfg.min_learning_count &&
      persistenceDays >= cfg.min_learning_persistence_days &&
      directionConsistency >= cfg.min_direction_ratio_learning &&
      residualStd <= cfg.max_std_learning &&
      absGap >= cfg.watch_gap_pct;

    if (learningReady) return STATES.LEARNING;

    const activeReady =
      sampleCount >= cfg.min_active_count &&
      persistenceDays >= cfg.min_active_persistence_days &&
      directionConsistency >= cfg.min_direction_ratio_active &&
      residualStd <= cfg.max_std_active &&
      absGap >= cfg.watch_gap_pct;

    if (activeReady) return STATES.ACTIVE;

    const watchReady =
      (sampleCount >= cfg.min_watch_count && absGap >= cfg.watch_gap_pct) ||
      absGap >= cfg.trigger_gap_pct;

    if (watchReady) return STATES.WATCH;

    return STATES.NONE;
  }

  function targetBetaFromGap(avgGapPct, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const gap = toNum(avgGapPct, 0);

    if (gap >= cfg.trigger_gap_pct) return cfg.positive_beta_strong;
    if (gap >= cfg.watch_gap_pct) return cfg.positive_beta_weak;
    if (gap <= -cfg.trigger_gap_pct) return cfg.negative_beta_strong;
    if (gap <= -cfg.watch_gap_pct) return cfg.negative_beta_weak;
    return 1;
  }

  function learningRateByState(state, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    if (state === STATES.LEARNING) return cfg.learning_rate_learning;
    if (state === STATES.ACTIVE) return cfg.learning_rate_active;
    if (state === STATES.WATCH) return cfg.learning_rate_watch;
    return 0;
  }

  function calcAdaptiveBeta(stats, previousBeta = 1, config = {}) {
    const state = stats.overlay_state || determineOverlayState(stats, config);
    const targetBeta = targetBetaFromGap(stats.avg_gap_pct, config);
    const learningRate = learningRateByState(state, config);
    const oldBeta = toNum(previousBeta, 1);
    const beta = oldBeta + ((targetBeta - oldBeta) * learningRate);
    return round2(beta);
  }

  function applyDecay(beta, decayFactor = DEFAULT_CONFIG.decay_factor) {
    const b = toNum(beta, 1);
    if (b > 1) return round2(Math.max(1, b * decayFactor));
    if (b < 1) return round2(Math.min(1, 1 - ((1 - b) * decayFactor)));
    return 1;
  }

  function evaluateOverlayTrigger(historyRows, options = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...(options.config || {}) };
    const rows = arr(historyRows);

    const gaps = rows
      .map(r => {
        const direct = toNum(
          r.pricing_gap_vs_old_pct ??
          r.pricing_gap_pct ??
          r.gap_before_pct
        );
        if (direct !== null) return direct;
        const absoluteGap = toNum(r.pricing_gap ?? r.gap_before);
        const fair = toNum(r.fair_yield ?? r.old_fair_rate ?? r.my_preference_rate);
        if (absoluteGap !== null && fair !== null && fair !== 0) return (absoluteGap / fair) * 100;
        return calcGapPercent(r.market_coupon, r.fair_yield || r.old_fair_rate || r.my_preference_rate);
      })
      .filter(Number.isFinite);

    const sampleCount = gaps.length;
    const persistenceDays = new Set(rows.map(r => r.date || r.created_time || r.entry_time).filter(Boolean)).size;
    const directionConsistency = calcDirectionConsistency(gaps);
    const dominantDirection = calcDominantDirection(gaps);
    const residualStd = std(gaps);
    const avgGapPct = avg(gaps);

    const baseStats = {
      sample_count: sampleCount,
      persistence_days: persistenceDays,
      direction_consistency: round2(directionConsistency),
      dominant_direction: dominantDirection,
      residual_std: round2(residualStd),
      avg_gap_pct: round2(avgGapPct)
    };

    const overlayState = determineOverlayState(baseStats, cfg);
    const confidence = calcOverlayConfidence(baseStats, cfg);
    const oneTimeTrigger = Math.abs(toNum(avgGapPct, 0)) >= cfg.trigger_gap_pct;
    const previousBeta = toNum(options.previous_beta, 1);
    const beta = calcAdaptiveBeta({ ...baseStats, overlay_state: overlayState }, previousBeta, cfg);

    return {
      ...baseStats,
      overlay_confidence: confidence,
      overlay_state: overlayState,
      overlay_beta: beta,
      target_beta: round2(targetBetaFromGap(avgGapPct, cfg)),
      one_time_trigger: oneTimeTrigger,
      should_trigger_overlay: overlayState === STATES.ACTIVE || overlayState === STATES.LEARNING || oneTimeTrigger,
      trigger_reason: buildTriggerReason(baseStats, overlayState, oneTimeTrigger, cfg)
    };
  }

  function buildTriggerReason(stats, state, oneTimeTrigger, config = {}) {
    const cfg = { ...DEFAULT_CONFIG, ...config };
    const parts = [];
    if (oneTimeTrigger) parts.push("single_output_gap_trigger");
    if (toNum(stats.sample_count, 0) >= cfg.min_active_count) parts.push("sample_count_ok");
    if (toNum(stats.persistence_days, 0) >= cfg.min_active_persistence_days) parts.push("persistence_ok");
    if (toNum(stats.direction_consistency, 0) >= cfg.min_direction_ratio_active) parts.push("direction_ok");
    if (toNum(stats.residual_std, Infinity) <= cfg.max_std_active) parts.push("std_ok");
    if (!parts.length) parts.push("insufficient_signal");
    return state + ":" + parts.join("|");
  }

  global.M8OverlayEngineV1 = {
    VERSION,
    STATES,
    DEFAULT_CONFIG,
    evaluateOverlayTrigger,
    calcAdaptiveBeta,
    applyDecay,
    calcOverlayConfidence,
    determineOverlayState,
    calcGapPercent
  };

})(window);

