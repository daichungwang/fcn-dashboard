export function renderModule3Decision(positions, pool, config) {
  if (!pool || pool.length === 0) {
    return `<p>目前無股票池資料</p>`;
  }

  const groups = {
    core: [],
    defensive: [],
    balanced: [],
    yield: [],
    avoid: []
  };

  pool.forEach((s) => {
    if (!s) return;

    const pref = s.fcn_preference || "";
    const risk = s.risk_level || "";
    const score = Number(s.risk_score ?? 999);
    const category = s.category || "";
    const allow = s.allow_fcn;

    if (allow === false || pref === "avoid" || pref === "low") {
      groups.avoid.push(s);
      return;
    }

    if (
      pref === "very_high" &&
      (category === "core" || category === "ETF" || category === "bond") &&
      score <= 45
    ) {
      groups.core.push(s);
      return;
    }

    if (
      risk === "low_vol" &&
      (category === "bond" || category === "ETF" || category === "defensive")
    ) {
      groups.defensive.push(s);
      return;
    }

    if (
      risk === "high_vol" ||
      score >= 60 ||
      category === "high_beta"
    ) {
      groups.yield.push(s);
      return;
    }

    groups.balanced.push(s);
  });

  sortGroup(groups.core);
  sortGroup(groups.defensive);
  sortGroup(groups.balanced);
  sortGroup(groups.yield);
  sortAvoidGroup(groups.avoid);

  function stockCard(s, idx, prefix = "group") {
    const id = `${prefix}-${s.symbol}-${idx}`;

    return `
      <div class="stock-card" onclick="toggleDetail('${id}')">
        <div class="stock-title">
          ${s.symbol || "-"}｜${s.sector || "-"}｜${getDecisionLabel(s)}
        </div>

        <div id="${id}" class="stock-detail hidden">
          <div class="line2">
            ${s.category || "-"} / ${s.risk_level || "-"} / ${s.fcn_preference || "-"}
            / risk ${safeVal(s.risk_score)} / pref ${safeVal(s.preference_score)}
          </div>

          <div class="line3">
            價格：${formatPrice(s.price)}
            / 漲跌幅：${formatPct(s.price_change_pct)}
            / PE25：${safeVal(s.pe_2025)}
            / PE26：${safeVal(s.pe_2026)}
            / EPS26：${safeVal(s.eps_2026)}
            / 1M：${formatPct(s.perf_1m_pct)}
            / 6M：${formatPct(s.perf_6m_pct)}
          </div>
        </div>
      </div>
    `;
  }

  function section(title, list, prefix) {
    return `
      <div class="section">
        <h3>${title}（${list.length}）</h3>
        ${list.length > 0 ? list.map((s, i) => stockCard(s, i, prefix)).join("") : `<p>目前無資料</p>`}
      </div>
    `;
  }

  function allStocksSection() {
    const sorted = [...pool].sort((a, b) => {
      const aScore = Number(a.risk_score ?? 999);
      const bScore = Number(b.risk_score ?? 999);
      return aScore - bScore;
    });

    return `
      <div class="section">
        <h3 onclick="toggleAll()" style="cursor:pointer;">📊 所有股票（點擊展開/收合）</h3>
        <div id="allStocks" class="hidden">
          ${sorted.map((s, i) => stockCard(s, i, "all")).join("")}
        </div>
      </div>
    `;
  }

  return `
    <div class="module3">

      <div class="summary">
        Module3-A 今日股票池總覽<br>
        Pool 總數：${pool.length} ｜ 
        核心：${groups.core.length} ｜ 
        防守：${groups.defensive.length} ｜ 
        平衡：${groups.balanced.length} ｜ 
        收益：${groups.yield.length} ｜ 
        避免：${groups.avoid.length}
      </div>

      ${section("今日核心可做", groups.core, "core")}
      ${section("今日防守可做", groups.defensive, "defensive")}
      ${section("今日平衡可做", groups.balanced, "balanced")}
      ${section("今日高收益候選", groups.yield, "yield")}
      ${section("今日避免股票", groups.avoid, "avoid")}

      ${allStocksSection()}
    </div>
  `;
}

function sortGroup(list) {
  list.sort((a, b) => {
    const aPref = preferenceRank(a.fcn_preference);
    const bPref = preferenceRank(b.fcn_preference);
    if (aPref !== bPref) return bPref - aPref;

    const aRisk = Number(a.risk_score ?? 999);
    const bRisk = Number(b.risk_score ?? 999);
    return aRisk - bRisk;
  });
}

function sortAvoidGroup(list) {
  list.sort((a, b) => {
    const aRisk = Number(a.risk_score ?? 0);
    const bRisk = Number(b.risk_score ?? 0);
    return bRisk - aRisk;
  });
}

function preferenceRank(pref) {
  if (pref === "very_high") return 5;
  if (pref === "high") return 4;
  if (pref === "medium") return 3;
  if (pref === "low") return 2;
  if (pref === "avoid") return 1;
  return 0;
}

function getDecisionLabel(s) {
  const pref = s.fcn_preference || "";
  const risk = s.risk_level || "";
  const category = s.category || "";
  const score = Number(s.risk_score ?? 999);
  const allow = s.allow_fcn;

  if (allow === false || pref === "avoid" || pref === "low") return "今日避免";
  if (pref === "very_high" && (category === "core" || category === "ETF" || category === "bond") && score <= 45) return "核心優先";
  if (risk === "low_vol" && (category === "bond" || category === "ETF" || category === "defensive")) return "防守配置";
  if (risk === "high_vol" || score >= 60 || category === "high_beta") return "收益增強";
  return "平衡補位";
}

function safeVal(v) {
  if (v === undefined || v === null || v === "") return "-";
  return v;
}

function formatPct(v) {
  if (v === undefined || v === null || v === "") return "-";
  const num = Number(v);
  if (Number.isNaN(num)) return v;
  return `${num > 0 ? "+" : ""}${num}%`;
}

function formatPrice(v) {
  if (v === undefined || v === null || v === "") return "-";
  const num = Number(v);
  if (Number.isNaN(num)) return v;
  return `$${num}`;
}

window.toggleDetail = function (id) {
  const el = document.getElementById(id);
  if (el) el.classList.toggle("hidden");
};

window.toggleAll = function () {
  const el = document.getElementById("allStocks");
  if (el) el.classList.toggle("hidden");
};
