// ============================================================================
  function calcAdaptiveBeta(stats, previousBeta = 1){
    const targetBeta = targetBetaFromGap(stats.avg_gap_pct);

    let learningRate = 0.25;

    if(stats.overlay_state === STATES.LEARNING){
      learningRate = 0.35;
    }

    const beta = previousBeta + ((targetBeta - previousBeta) * learningRate);

    return {
      overlay_beta: round2(beta),
      overlay_target_beta: round2(targetBeta)
    };
  }

  function applyDecay(beta, factor = 0.95){
    return round2(beta * factor);
  }

  function evaluateOverlayTrigger(historyRows){

    const gaps = historyRows
      .map(r => Number(r.pricing_gap_vs_old_pct))
      .filter(Number.isFinite);

    const sampleCount = gaps.length;

    const persistenceDays = new Set(
      historyRows.map(r => r.trade_date || r.date).filter(Boolean)
    ).size;

    const directionConsistency = calcDirectionConsistency(gaps);
    const residualStd = std(gaps);
    const avgGapPct = avg(gaps);

    const stats = {
      sample_count: sampleCount,
      persistence_days: persistenceDays,
      direction_consistency: round2(directionConsistency),
      residual_std: round2(residualStd),
      avg_gap_pct: round2(avgGapPct)
    };

    stats.overlay_confidence = calcOverlayConfidence(stats);
    stats.overlay_state = determineOverlayState(stats);

    const betaResult = calcAdaptiveBeta(stats, 1);

    stats.overlay_beta = betaResult.overlay_beta;
    stats.overlay_target_beta = betaResult.overlay_target_beta;

    stats.one_time_trigger = (
      sampleCount >= 1 &&
      Math.abs(avgGapPct) >= 20
    );

    stats.should_trigger_overlay = (
      sampleCount >= 3 &&
      persistenceDays >= 2 &&
      directionConsistency >= 0.7 &&
      residualStd <= 15
    );

    return stats;
  }

  global.M8OverlayEngineV1 = {
    VERSION,
    STATES,
    evaluateOverlayTrigger,
    calcAdaptiveBeta,
    applyDecay,
    calcOverlayConfidence,
    determineOverlayState,
    calcGapPct
  };

})(window);
