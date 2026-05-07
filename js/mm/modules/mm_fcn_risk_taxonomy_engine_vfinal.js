// ============================================================================
// MM FCN Risk Taxonomy & Pool Allocation Engine vFinal
// Path:
// js/mm/modules/mm_fcn_risk_taxonomy_engine_vfinal.js
// ============================================================================

window.MMFcnRiskTaxonomyEngine = (() => {

  // ==========================================================================
  // CONFIG
  // ==========================================================================

  const STRUCTURE_LEVELS = [
    'Low',
    'Medium-Low',
    'Medium',
    'Medium-High',
    'High',
    'Very High'
  ];

  const BASKET_POOLS = [
    '保守池',
    '合理池',
    '積極池',
    '投機池',
    'Reject'
  ];

  const TIME_LABELS = [
    '極短期',
    '短期',
    '中期',
    '長期',
    '超長期'
  ];

  // ==========================================================================
  // STRIKE RISK
  // ==========================================================================

  function getStrikeRisk(strike = 0) {

    if (strike < 60) return 'Low';
    if (strike <= 64) return 'Medium-Low';
    if (strike === 65) return 'Medium';
    if (strike <= 70) return 'Medium-High';
    if (strike <= 74) return 'High';

    return 'Very High';
  }

  // ==========================================================================
  // KI RISK
  // ==========================================================================

  function getKIRisk(ki = 0) {

    if (ki < 50) return 'Low';
    if (ki <= 54) return 'Medium-Low';
    if (ki === 55) return 'Medium';
    if (ki <= 59) return 'Medium-High';
    if (ki <= 64) return 'High';
    if (ki <= 70) return 'Very High';

    return 'Extremely High';
  }

  // ==========================================================================
  // COMPRESSION RULE
  // ==========================================================================

  function applyCompressionRule(strike, ki) {

    if (strike !== ki) {
      return {
        compression_applied: false,
        effective_strike: strike,
        effective_ki: ki
      };
    }

    return {
      compression_applied: true,
      effective_strike: strike + 5,
      effective_ki: ki - 2.5
    };
  }

  // ==========================================================================
  // STRUCTURE RISK
  // ==========================================================================

  function getStructureRisk(strikeRisk, kiRisk) {

    const s = strikeRisk;
    const k = kiRisk;

    if (s === 'Low' && k === 'Low') {
      return 'Low';
    }

    if (
      (s === 'Low' && k === 'Medium-Low') ||
      (s === 'Medium-Low' && k === 'Medium-Low')
    ) {
      return 'Medium-Low';
    }

    if (s === 'Medium' && k === 'Medium') {
      return 'Medium';
    }

    if (
      (s === 'Medium' && k === 'Medium-High') ||
      (s === 'Medium-High' && k === 'Medium-High')
    ) {
      return 'Medium-High';
    }

    if (
      (s === 'High' && k === 'High') ||
      (s === 'High' && k === 'Medium-High')
    ) {
      return 'High';
    }

    if (
      (s === 'Very High' && k === 'Very High') ||
      (s === 'High' && k === 'Very High')
    ) {
      return 'Very High';
    }

    return 'Medium';
  }

  // ==========================================================================
  // TIME LABEL
  // ==========================================================================

  function getTimeLabel(months = 0) {

    if (months <= 2) return '極短期';
    if (months <= 4) return '短期';
    if (months <= 7) return '中期';
    if (months <= 10) return '長期';

    return '超長期';
  }

  // ==========================================================================
  // BASKET POOL
  // ==========================================================================

  function getBasketPool({
    highlight = 0,
    watch = 0,
    simulation = 0,
    reject = 0,
    external_speculative = false
  }) {

    if (reject > 0 || external_speculative) {
      return '投機池';
    }

    if (
      highlight >= 1 &&
      watch <= 1 &&
      simulation === 0
    ) {
      return '保守池';
    }

    if (
      watch <= 2 &&
      simulation <= 1
    ) {
      return '合理池';
    }

    if (simulation >= 1) {
      return '積極池';
    }

    return 'Reject';
  }

  // ==========================================================================
  // VALIDITY ENGINE
  // ==========================================================================

  function isValidByPolicy(pool, structureRisk, months) {

    const policy = {

      '保守池': {
        'Low': 99,
        'Medium-Low': 99,
        'Medium': 12,
        'Medium-High': 10,
        'High': 6,
        'Very High': 0
      },

      '合理池': {
        'Low': 12,
        'Medium': 10,
        'Medium-High': 7,
        'High': 4,
        'Very High': 2
      },

      '積極池': {
        'Medium': 9,
        'Medium-High': 6,
        'High': 3,
        'Very High': 2
      },

      '投機池': {
        'Low': 3,
        'Medium-Low': 2,
        'Medium': 0,
        'Medium-High': 0,
        'High': 0,
        'Very High': 0
      }
    };

    const poolPolicy = policy[pool];

    if (!poolPolicy) {
      return false;
    }

    const allowedMonths = poolPolicy[structureRisk];

    if (!allowedMonths) {
      return false;
    }

    return months <= allowedMonths;
  }

  // ==========================================================================
  // FINAL LABEL
  // ==========================================================================

  function getFinalLabel(pool, structureRisk) {

    return `${structureRisk}｜${pool}`;
  }

  // ==========================================================================
  // MAIN PROCESS
  // ==========================================================================

  function process(record = {}) {

    const strike = Number(record.strike || 0);
    const ki = Number(record.ki || 0);
    const tenor = Number(record.tenor || 0);

    const compression = applyCompressionRule(strike, ki);

    const strikeRisk =
      getStrikeRisk(compression.effective_strike);

    const kiRisk =
      getKIRisk(compression.effective_ki);

    const structureRisk =
      getStructureRisk(strikeRisk, kiRisk);

    const timeLabel =
      getTimeLabel(tenor);

    const basketPool =
      getBasketPool({
        highlight: record.highlight || 0,
        watch: record.watch || 0,
        simulation: record.simulation || 0,
        reject: record.reject || 0,
        external_speculative:
          record.external_speculative || false
      });

    const valid =
      isValidByPolicy(
        basketPool,
        structureRisk,
        tenor
      );

    return {
      ...record,

      strike_risk: strikeRisk,
      ki_risk: kiRisk,
      structure_risk: structureRisk,

      compression_applied:
        compression.compression_applied,

      effective_strike:
        compression.effective_strike,

      effective_ki:
        compression.effective_ki,

      time_label: timeLabel,

      basket_pool: basketPool,

      final_label:
        getFinalLabel(
          basketPool,
          structureRisk
        ),

      validity:
        valid ? 'OK' : 'INVALID'
    };
  }

  // ==========================================================================
  // PUBLIC
  // ==========================================================================

  return {
    process,
    getStrikeRisk,
    getKIRisk,
    getStructureRisk,
    getBasketPool,
    getTimeLabel
  };

})();
