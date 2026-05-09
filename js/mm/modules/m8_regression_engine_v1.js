// ============================================================================

        improvement_pct: improvementPct
      };
    });
  }

  function buildOverlayEffectivenessSummary(rows){

    const groups = {};

    rows.forEach(row => {

      const key = row.basket_template || "UNKNOWN";

      if(!groups[key]){
        groups[key] = [];
      }

      groups[key].push(row);
    });

    return Object.keys(groups).map(template => {

      const rows = groups[template];

      return {
        template,

        fcn_count: rows.length,

        avg_market_coupon: round2(avg(rows.map(r => r.market_coupon))),

        avg_fair_rate: round2(avg(rows.map(r => r.clean_global_fair))),

        avg_beta: round2(avg(rows.map(r => r.overlay_beta))),

        avg_final_fair_rate: round2(avg(rows.map(r => r.final_fair_rate))),

        avg_gap_before: round2(avg(rows.map(r => r.gap_before))),

        avg_gap_before_pct: round2(avg(rows.map(r => r.gap_before_pct))),

        avg_gap_after: round2(avg(rows.map(r => r.gap_after))),

        avg_gap_after_pct: round2(avg(rows.map(r => r.gap_after_pct))),

        improvement_pct: round2(avg(rows.map(r => r.improvement_pct))),

        avg_confidence: round2(avg(rows.map(r => r.overlay_confidence)))
      };
    });
  }

  global.M8RegressionEngineV1 = {
    VERSION,
    applyOverlayLifecycle,
    buildOverlayEffectivenessSummary
  };

})(window);


