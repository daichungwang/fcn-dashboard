# js/mm/modules/m8_regression_engine_v1.js

```javascript
(function (global) {
  'use strict';

  function toNum(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function avg(arr) {
    if (!Array.isArray(arr) || !arr.length) return 0;
    return arr.reduce((a, b) => a + toNum(b), 0) / arr.length;
  }

  function median(arr) {
    if (!Array.isArray(arr) || !arr.length) return 0;

    const s = [...arr]
      .map(v => toNum(v))
      .sort((a, b) => a - b);

    const mid = Math.floor(s.length / 2);

    return s.length % 2
      ? s[mid]
      : (s[mid - 1] + s[mid]) / 2;
  }

  function bucketAvg(rows, field) {
    return avg(rows.map(r => toNum(r[field])));
  }

  function buildTemplateSummary(rows) {
    const map = {};

    rows.forEach(r => {
      const k = r.basket_template || 'UNKNOWN';

      if (!map[k]) {
        map[k] = {
          template: k,
          count: 0,
          coupons: [],
          brakes: [],
          fairs: [],
          newFairs: []
        };
      }

      map[k].count += 1;
      map[k].coupons.push(toNum(r.market_coupon));
      map[k].brakes.push(toNum(r.market_implied_brake));
      map[k].fairs.push(toNum(r.fair_rate));
    });

    return Object.values(map)
      .map(v => ({
        template: v.template,
        count: v.count,
        avg_coupon: avg(v.coupons),
        median_coupon: median(v.coupons),
        avg_brake: avg(v.brakes),
        avg_fair_rate: avg(v.fairs)
      }))
      .sort((a, b) => b.count - a.count);
  }

  function buildRiskSurface(rows) {
    const map = {};

    rows.forEach(r => {
      const k = r.risk_template || 'UNKNOWN';

      if (!map[k]) {
        map[k] = {
          risk_template: k,
          count: 0,
          coupons: [],
          brakes: []
        };
      }

      map[k].count += 1;
      map[k].coupons.push(toNum(r.market_coupon));
      map[k].brakes.push(toNum(r.market_implied_brake));
    });

    return Object.values(map)
      .map(v => ({
        risk_template: v.risk_template,
        count: v.count,
        avg_coupon: avg(v.coupons),
        avg_brake: avg(v.brakes)
      }))
      .sort((a, b) => b.avg_coupon - a.avg_coupon);
  }

  function buildTenorCurve(rows) {
    const map = {};

    rows.forEach(r => {
      const k = r.tenor_template || 'UNKNOWN';

      if (!map[k]) {
        map[k] = {
          tenor_template: k,
          count: 0,
          coupons: [],
          brakes: []
        };
      }

      map[k].count += 1;
      map[k].coupons.push(toNum(r.market_coupon));
      map[k].brakes.push(toNum(r.market_implied_brake));
    });

    return Object.values(map)
      .map(v => ({
        tenor_template: v.tenor_template,
        count: v.count,
        avg_coupon: avg(v.coupons),
        avg_brake: avg(v.brakes)
      }))
      .sort((a, b) => b.avg_coupon - a.avg_coupon);
  }

  function buildStructureCurve(rows) {
    const map = {};

    rows.forEach(r => {
      const k = r.structure_template || 'UNKNOWN';

      if (!map[k]) {
        map[k] = {
          structure_template: k,
          count: 0,
          coupons: [],
          brakes: []
        };
      }

      map[k].count += 1;
      map[k].coupons.push(toNum(r.market_coupon));
      map[k].brakes.push(toNum(r.market_implied_brake));
    });

    return Object.values(map)
      .map(v => ({
        structure_template: v.structure_template,
        count: v.count,
        avg_coupon: avg(v.coupons),
        avg_brake: avg(v.brakes)
      }))
      .sort((a, b) => b.avg_coupon - a.avg_coupon);
  }

  function buildM7Overlay(rows) {
    const buckets = {
      high_8: [],
      strong_7_8: [],
      medium_6_7: [],
      weak_lt6: []
    };

    rows.forEach(r => {
      const s = toNum(r.avg_m7_score);

      if (s >= 8) {
        buckets.high_8.push(r);
      } else if (s >= 7) {
        buckets.strong_7_8.push(r);
      } else if (s >= 6) {
        buckets.medium_6_7.push(r);
      } else {
        buckets.weak_lt6.push(r);
      }
    });

    return Object.entries(buckets).map(([k, rows]) => ({
      bucket: k,
      count: rows.length,
      avg_coupon: bucketAvg(rows, 'market_coupon'),
      avg_brake: bucketAvg(rows, 'market_implied_brake')
    }));
  }

  function buildDNAStats(rows) {
    const map = {};

    rows.forEach(r => {
      const k = r.core_dna_2 || 'UNKNOWN';

      if (!map[k]) {
        map[k] = {
          dna: k,
          count: 0,
          coupons: []
        };
      }

      map[k].count += 1;
      map[k].coupons.push(toNum(r.market_coupon));
    });

    return Object.values(map)
      .map(v => ({
        dna: v.dna,
        count: v.count,
        avg_coupon: avg(v.coupons)
      }))
      .sort((a, b) => b.count - a.count);
  }

  function calcTemplateBaseRate(row, templateSummary) {
    const hit = templateSummary.find(
      t => t.template === row.basket_template
    );

    return hit
      ? toNum(hit.avg_coupon)
      : toNum(row.fair_rate);
  }

  function calcRiskAdjustment(row, riskSurface) {
    const hit = riskSurface.find(
      r => r.risk_template === row.risk_template
    );

    if (!hit) return 0;

    return (toNum(hit.avg_coupon) - 18) * 0.35;
  }

  function calcTenorAdjustment(row, tenorCurve) {
    const hit = tenorCurve.find(
      r => r.tenor_template === row.tenor_template
    );

    if (!hit) return 0;

    return (toNum(hit.avg_brake) - 2) * 0.45;
  }

  function calcStructureAdjustment(row, structureCurve) {
    const hit = structureCurve.find(
      r => r.structure_template === row.structure_template
    );

    if (!hit) return 0;

    return (toNum(hit.avg_coupon) - 18) * 0.12;
  }

  function calcM7OverlayAdjustment(row) {
    const m7 = toNum(row.avg_m7_score, 7);

    if (m7 >= 8.5) return -1.4;
    if (m7 >= 8) return -1.0;
    if (m7 >= 7.5) return -0.6;
    if (m7 >= 7) return -0.2;
    if (m7 >= 6.5) return 0.5;
    if (m7 >= 6) return 1.2;

    return 2.5;
  }

  function calcNewFairRate(
    row,
    templateSummary,
    riskSurface,
    tenorCurve,
    structureCurve
  ) {
    const templateBase = calcTemplateBaseRate(
      row,
      templateSummary
    );

    const riskAdj = calcRiskAdjustment(
      row,
      riskSurface
    );

    const tenorAdj = calcTenorAdjustment(
      row,
      tenorCurve
    );

    const structureAdj = calcStructureAdjustment(
      row,
      structureCurve
    );

    const m7Adj = calcM7OverlayAdjustment(row);

    const newFairRate =
      templateBase +
      riskAdj +
      tenorAdj +
      structureAdj +
      m7Adj;

    return {
      template_base_rate: templateBase,
      risk_adjustment: riskAdj,
      tenor_adjustment: tenorAdj,
      structure_adjustment: structureAdj,
      m7_overlay_adjustment: m7Adj,
      new_fair_rate: newFairRate,
      pricing_gap_vs_old:
        toNum(row.market_coupon) -
        toNum(row.fair_rate),
      pricing_gap_vs_new:
        toNum(row.market_coupon) -
        newFairRate
    };
  }

  function runM8Regression(rows) {
    const templateSummary = buildTemplateSummary(rows);

    const riskSurface = buildRiskSurface(rows);

    const tenorCurve = buildTenorCurve(rows);

    const structureCurve = buildStructureCurve(rows);

    const m7Overlay = buildM7Overlay(rows);

    const dnaStats = buildDNAStats(rows);

    const calibratedRows = rows.map(r => {
      const regression = calcNewFairRate(
        r,
        templateSummary,
        riskSurface,
        tenorCurve,
        structureCurve
      );

      return {
        ...r,
        ...regression
      };
    });

    return {
      template_summary: templateSummary,
      risk_surface: riskSurface,
      tenor_curve: tenorCurve,
      structure_curve: structureCurve,
      m7_overlay: m7Overlay,
      dna_stats: dnaStats,
      calibrated_rows: calibratedRows
    };
  }

  global.M8RegressionEngineV1 = {
    runM8Regression,
    buildTemplateSummary,
    buildRiskSurface,
    buildTenorCurve,
    buildStructureCurve,
    buildM7Overlay,
    buildDNAStats,
    calcNewFairRate
  };

})(window);
```

---

# mm/m8_regression_dashboard_v1.html

新增 section：

1. Template Regression Summary
2. Risk Surface
3. Tenor Curve
4. Structure Curve
5. M7 Overlay Curve
6. DNA Leaderboard
7. FCN Coupon vs Fair Rate vs New Fair Rate

---

# dashboard integration

```javascript
const regression =
  M8RegressionEngineV1.runM8Regression(rows);

window.m8Regression = regression;
```

---

# row rendering

新增欄位：

| 欄位            |
| ------------- |
| New Fair Rate |
| Gap vs Old    |
| Gap vs New    |
| Template Base |
| Risk Adj      |
| Tenor Adj     |
| Structure Adj |
| M7 Overlay    |

---

# 新核心公式

```text
new_fair_rate =
market_template_base_rate
+ risk_adjustment
+ tenor_adjustment
+ structure_adjustment
+ m7_overlay_adjustment
```
