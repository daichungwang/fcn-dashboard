# mm_fcn_simulating_allocating_engine_v1.js

```javascript
window.MMMarketIntelligenceEngine = (() => {

  function analyzeMarketHistory(history) {
    const records = history?.records || [];

    const symbolStats = {};
    const basketStats = {};

    let totalCoupon = 0;

    records.forEach(record => {
      totalCoupon += Number(record.coupon_pct || 0);

      basketStats[record.basket_type] =
        (basketStats[record.basket_type] || 0) + 1;

      (record.symbols || []).forEach(symbol => {
        if (!symbolStats[symbol]) {
          symbolStats[symbol] = {
            count: 0,
            avg_coupon: 0,
            total_coupon: 0
          };
        }

        symbolStats[symbol].count += 1;
        symbolStats[symbol].total_coupon +=
          Number(record.coupon_pct || 0);
      });
    });

    Object.keys(symbolStats).forEach(symbol => {
      symbolStats[symbol].avg_coupon =
        symbolStats[symbol].total_coupon /
        symbolStats[symbol].count;
    });

    return {
      market_style:
        history?.market_summary?.market_style || "neutral",
      ai_appetite:
        history?.market_summary?.ai_appetite || "neutral",
      avg_market_coupon:
        records.length > 0
          ? totalCoupon / records.length
          : 0,
      symbol_stats: symbolStats,
      basket_stats: basketStats,
      observations:
        history?.market_summary?.market_observation || []
    };
  }

  function calculateMarketTightness({
    marketCoupon,
    m8FairYield
  }) {

    if (!m8FairYield || m8FairYield <= 0) {
      return {
        ratio: 1,
        status: "neutral"
      };
    }

    const ratio = marketCoupon / m8FairYield;

    let status = "fair";

    if (ratio >= 1.05) {
      status = "attractive";
    } else if (ratio >= 0.95) {
      status = "fair";
    } else if (ratio >= 0.85) {
      status = "slightly_tight";
    } else if (ratio >= 0.75) {
      status = "tight";
    } else {
      status = "very_tight";
    }

    return {
      ratio,
      status
    };
  }

  function calculateOverlap({
    basketSymbols,
    marketIntel
  }) {

    const topSymbols = Object.entries(
      marketIntel.symbol_stats || {}
    )
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(x => x[0]);

    const overlap = basketSymbols.filter(symbol =>
      topSymbols.includes(symbol)
    );

    return {
      overlap_symbols: overlap,
      overlap_score:
        basketSymbols.length > 0
          ? overlap.length / basketSymbols.length
          : 0
    };
  }

  return {
    analyzeMarketHistory,
    calculateMarketTightness,
    calculateOverlap
  };
})();

window.MMBasketBuilder = (() => {

  function getRoleCandidates({
    role,
    stockRoles,
    pools,
    usedSymbols,
    allowedPoolType
  }) {

    const candidates = [];

    pools.forEach(pool => {
      pool.forEach(stock => {
        const roles = stockRoles[stock.symbol] || [];

        if (
          roles.includes(role) &&
          !usedSymbols.includes(stock.symbol)
        ) {
          if (
            stock.pool_type === "watch" &&
            allowedPoolType.watch <= 0
          ) {
            return;
          }

          if (
            stock.pool_type === "simulation" &&
            allowedPoolType.simulation <= 0
          ) {
            return;
          }

          candidates.push(stock);
        }
      });
    });

    return candidates;
  }

  function sortByContribution(candidates) {
    return candidates.sort((a, b) => {
      const scoreA =
        (a.volatility_score || 0) * 0.5 +
        (a.m7_score || 0) * 0.3 +
        (a.market_overlap_score || 0) * 0.2;

      const scoreB =
        (b.volatility_score || 0) * 0.5 +
        (b.m7_score || 0) * 0.3 +
        (b.market_overlap_score || 0) * 0.2;

      return scoreB - scoreA;
    });
  }

  function buildBasket({
    template,
    stockRoles,
    highlightPool,
    watchPool,
    simulationPool
  }) {

    const basket = [];
    const usedSymbols = [];

    const pools = [
      highlightPool,
      watchPool,
      simulationPool
    ];

    const allowedPoolType = {
      watch:
        template.allowed_pools.watch || 0,
      simulation:
        template.allowed_pools.simulation || 0
    };

    Object.entries(template.roles).forEach(
      ([role, qty]) => {

        let candidates = getRoleCandidates({
          role,
          stockRoles,
          pools,
          usedSymbols,
          allowedPoolType
        });

        candidates = sortByContribution(candidates);

        candidates.slice(0, qty).forEach(stock => {
          basket.push({
            symbol: stock.symbol,
            role,
            pool_type: stock.pool_type,
            m7_score: stock.m7_score
          });

          usedSymbols.push(stock.symbol);

          if (stock.pool_type === "watch") {
            allowedPoolType.watch -= 1;
          }

          if (stock.pool_type === "simulation") {
            allowedPoolType.simulation -= 1;
          }
        });
      }
    );

    return basket;
  }

  return {
    buildBasket
  };
})();

window.MMSimulationEvaluator = (() => {

  function evaluateCouponTarget({
    fairYield,
    style
  }) {

    if (style === "conservative") {
      return fairYield >= 10 && fairYield < 15;
    }

    if (style === "rational") {
      return fairYield >= 15 && fairYield < 19;
    }

    if (style === "aggressive") {
      return fairYield >= 19;
    }

    return false;
  }

  function classifyResult({
    pass,
    marketTightness
  }) {

    if (pass) {
      return "PASS";
    }

    if (
      marketTightness === "tight" ||
      marketTightness === "very_tight"
    ) {
      return "FAIL_MARKET_TIGHT";
    }

    return "FAIL_BASKET_QUALITY";
  }

  function evaluateSimulation({
    template,
    basket,
    fairYield,
    marketCoupon,
    marketTightness,
    overlap
  }) {

    const pass = evaluateCouponTarget({
      fairYield,
      style: template.basket_style
    });

    const result = classifyResult({
      pass,
      marketTightness
    });

    return {
      basket_style: template.basket_style,
      basket,
      fair_yield: fairYield,
      market_coupon: marketCoupon,
      market_tightness: marketTightness,
      overlap_score: overlap.overlap_score,
      overlap_symbols: overlap.overlap_symbols,
      result
    };
  }

  return {
    evaluateSimulation
  };
})();

window.MMPortfolioFitEngine = (() => {

  function evaluatePortfolioFit({
    currentPool,
    newBasket
  }) {

    const currentSymbols = currentPool || [];

    const basketSymbols = newBasket.map(x => x.symbol);

    const overlap = basketSymbols.filter(symbol =>
      currentSymbols.includes(symbol)
    );

    let fit = "good";

    if (overlap.length >= 3) {
      fit = "concentration_warning";
    }

    return {
      overlap,
      overlap_count: overlap.length,
      fit
    };
  }

  return {
    evaluatePortfolioFit
  };
})();

window.MMSimulatingAllocatingEngine = (() => {

  async function runSimulation({
    template,
    marketHistory,
    stockRoles,
    pools,
    m8FairYield,
    currentPool
  }) {

    const marketIntel =
      MMMarketIntelligenceEngine.analyzeMarketHistory(
        marketHistory
      );

    const basket =
      MMBasketBuilder.buildBasket({
        template,
        stockRoles,
        highlightPool: pools.highlight,
        watchPool: pools.watch,
        simulationPool: pools.simulation
      });

    const basketSymbols = basket.map(x => x.symbol);

    const overlap =
      MMMarketIntelligenceEngine.calculateOverlap({
        basketSymbols,
        marketIntel
      });

    const marketCoupon =
      marketIntel.avg_market_coupon;

    const tightness =
      MMMarketIntelligenceEngine.calculateMarketTightness({
        marketCoupon,
        m8FairYield
      });

    const evaluation =
      MMSimulationEvaluator.evaluateSimulation({
        template,
        basket,
        fairYield: m8FairYield,
        marketCoupon,
        marketTightness: tightness.status,
        overlap
      });

    const portfolioFit =
      MMPortfolioFitEngine.evaluatePortfolioFit({
        currentPool,
        newBasket: basket
      });

    return {
      market_intelligence: marketIntel,
      basket,
      evaluation,
      portfolio_fit: portfolioFit,
      decision: buildDecision({
        evaluation,
        portfolioFit
      })
    };
  }

  function buildDecision({
    evaluation,
    portfolioFit
  }) {

    if (
      evaluation.result === "FAIL_MARKET_TIGHT"
    ) {
      return "市場偏緊，建議降低 coupon target 或改保守版本。";
    }

    if (
      portfolioFit.fit ===
      "concentration_warning"
    ) {
      return "Basket 可做，但目前 pool 集中度偏高，建議小部位。";
    }

    if (evaluation.result === "PASS") {
      return "Basket 達標，可進入下一步 FCN 評估。";
    }

    return "Basket 未達標，建議重新 simulation。";
  }

  return {
    runSimulation
  };
})();
```

---

# Suggested File Path

```text
js/mm/modules/mm_fcn_simulating_allocating_engine_v1.js
```
