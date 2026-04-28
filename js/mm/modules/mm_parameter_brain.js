// mm_parameter_brain.js
// B2/B3 Parameter Brain renderer for MM dashboard.
// Heavy calculation still lives in mm_m7_runtime_full.js during safe transition.
// This module owns the B2/B3 UI markup so Codex can continue extracting logic here.
window.MMParameterBrain = (function () {
  function fallbackNum(v, d = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : d;
  }

  function renderB2B3Controls(ctx) {
    const box = document.getElementById("valuation-secondary-controls");
    if (!box) return;

    const cfg = ctx?.M7_PARAM_CONFIG || {};
    const row = typeof ctx?.row === "function" ? ctx.row : function (key, value) {
      return `
        <div class="form-row mm-brain-row" data-key="${key}" data-original="${Number(value || 0).toFixed(2)}">
          <div>${key}</div>
          <div>${Number(value || 0).toFixed(2)}</div>
          <div><input class="m7-sim-input mm-brain-input" data-key="${key}" type="number" step="0.01" value="${Number(value || 0).toFixed(2)}" /></div>
          <div class="mm-brain-delta">0.00</div>
        </div>
      `;
    };
    const num = typeof ctx?.num === "function" ? ctx.num : fallbackNum;

    const moneyPreset = cfg?.money?.module_presets?.M7 || {};

    box.innerHTML = `
      <details class="subsection" open>
        <summary>B2 Valuation：market / industry / archetype multiplier</summary>
        <div class="subsection-body">
          <div class="form-row header"><div>項目</div><div>now</div><div>new</div><div>delta</div></div>
          ${row("valuation_market_multiplier", 1.00)}
          ${row("valuation_industry_multiplier", 1.00)}
          ${row("valuation_archetype_multiplier", 1.00)}
          <div class="muted">公式：final anchor = base anchor × market × industry × archetype；這裡只做 MM preview，不寫回 production。</div>
        </div>
      </details>

      <details class="subsection" open>
        <summary>B2 Structure：allowed models</summary>
        <div class="subsection-body">
          <label><input class="m7-sim-input mm-brain-input" data-key="structure_allow_linear" type="checkbox" checked style="width:auto;"> linear</label><br>
          <label><input class="m7-sim-input mm-brain-input" data-key="structure_allow_quadratic" type="checkbox" checked style="width:auto;"> quadratic</label><br>
          <label><input class="m7-sim-input mm-brain-input" data-key="structure_allow_logarithmic" type="checkbox" checked style="width:auto;"> logarithmic</label>
          <div class="muted" style="margin-top:8px;">B3 curve：r² &lt;0.2=0；0.2=1；0.4=2；0.8=8；1.0=10。</div>
        </div>
      </details>

      <details class="subsection" open>
        <summary>B2 Money：Liquidity + Flow</summary>
        <div class="subsection-body">
          <div class="form-row header"><div>項目</div><div>now</div><div>new</div><div>delta</div></div>
          ${row("money_liquidity_weight", num(moneyPreset.liquidity_weight, 0.70))}
          ${row("money_flow_weight", num(moneyPreset.flow_weight, 0.30))}
          <div class="muted">M1/M7 預設 70/30；M6 預設 20/80。Liquidity = 接股後能不能出手；Flow = 市場是否突然重視。</div>
        </div>
      </details>
    `;
  }

  return {
    init: function () {},
    render: function () {},
    renderB2B3Controls
  };
})();
