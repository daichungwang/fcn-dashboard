export function renderModule2(positions, quotes) {

  function getPrice(symbol) {
    return quotes[symbol]?.price || null;
  }

  function getEntryPrice(item) {
    if (item.trigger_price && item.trigger_ratio) {
      return item.trigger_price / item.trigger_ratio;
    }
    if (item.ki_price && item.ki_ratio) {
      return item.ki_price / item.ki_ratio;
    }
    if (item.strike_price && item.strike_ratio) {
      return item.strike_price / item.strike_ratio;
    }
    return null;
  }

  function getLowerBarrier(item) {
    if (!item.ki_price || item.ki_price === 0) {
      return item.strike_price; // 沒有KI → 用Strike
    }
    return item.ki_price;
  }

  function checkDataIssue(pos) {
    let issues = [];

    pos.underlyings.forEach(u => {
      if (!getPrice(u.symbol)) {
        issues.push(`${u.symbol} 無現價`);
      }
      if (!u.ki_price && !u.strike_price) {
        issues.push(`${u.symbol} 無KI/Strike`);
      }
    });

    if (!pos.maturity_date) {
      issues.push("無到期日");
    }

    return issues;
  }

  function calcDaysToMaturity(date) {
    if (!date) return null;
    const today = new Date();
    const m = new Date(date);
    return Math.ceil((m - today) / (1000 * 60 * 60 * 24));
  }

  function classify(pos) {

    const issues = checkDataIssue(pos);
    if (issues.length > 0) {
      return { status: "待確認", issues };
    }

    let worst = 999;

    pos.underlyings.forEach(u => {
      const price = getPrice(u.symbol);
      const ki = getLowerBarrier(u);

      const dist = (price - ki) / ki;
      if (dist < worst) worst = dist;
    });

    if (worst < 0) return { status: "風險" };
    if (worst < 0.05) return { status: "追蹤" };
    return { status: "健康" };
  }

  function maturityTag(days) {
    if (days === null) return "⚪";
    if (days <= 7) return "🔴";
    if (days <= 30) return "🟠";
    return "🟢";
  }

  // ===== 主流程 =====

  let result = {
    全部: positions.length,
    健康: [],
    追蹤: [],
    風險: [],
    待確認: []
  };

  positions.forEach(p => {
    const c = classify(p);

    if (c.status === "待確認") {
      result.待確認.push({ ...p, issues: c.issues });
    } else {
      result[c.status].push(p);
    }
  });

  // ===== UI =====

  let html = `
  <div class="m2-container">

    <h2>📊 持倉健康總覽</h2>
    <div class="m2-summary">
      <div>全部：${result.全部}</div>
      <div class="green">健康：${result.健康.length}</div>
      <div class="orange">追蹤：${result.追蹤.length}</div>
      <div class="red">風險：${result.風險.length}</div>
      <div class="gray">待確認：${result.待確認.length}</div>
    </div>
  `;

  function renderCard(p, detail = false) {

    const days = calcDaysToMaturity(p.maturity_date);

    let header = `
      <div class="card">
        <div class="card-header">
          <span>${p.name}</span>
          <span>${maturityTag(days)} ${days ? days + "天" : ""}</span>
        </div>
    `;

    if (!detail) {
      return header + `</div>`;
    }

    let body = `<div class="card-body">`;

    p.underlyings.forEach(u => {

      const price = getPrice(u.symbol);
      const entry = getEntryPrice(u);
      const ki = getLowerBarrier(u);
      const strike = u.strike_price;

      const ratio = entry ? (price / entry * 100).toFixed(1) : "-";
      const distKI = ki ? ((price - ki) / ki * 100).toFixed(1) : "-";
      const distStrike = strike ? ((price - strike) / strike * 100).toFixed(1) : "-";

      body += `
        <div class="stock">
          <b>${u.symbol}</b><br>
          現價：${price}<br>
          進場價：${entry?.toFixed(1)}<br>
          現價比：${ratio}%<br>
          下限價：${ki}<br>
          距離KI：${distKI}%<br>
          執行價：${strike}<br>
          距離Strike：${distStrike}%
        </div>
        <hr/>
      `;
    });

    body += `</div></div>`;

    return header + body;
  }

  function renderSection(title, list, color) {
    if (list.length === 0) return "";

    let html = `<h3 class="${color}">${title}（${list.length}）</h3>`;

    html += renderCard(list[0], true);

    if (list.length > 1) {
      html += `<details><summary>展開更多</summary>`;
      list.slice(1).forEach(p => {
        html += renderCard(p, false);
      });
      html += `</details>`;
    }

    return html;
  }

  html += renderSection("🚨 風險持倉", result.風險, "red");
  html += renderSection("👀 追蹤持倉", result.追蹤, "orange");
  html += renderSection("✅ 健康持倉", result.健康, "green");

  // ===== 待確認 =====
  if (result.待確認.length > 0) {
    html += `<h3 class="gray">⚠️ 待確認（${result.待確認.length}）</h3>`;

    result.待確認.forEach(p => {
      html += `
        <div class="card gray">
          <b>${p.name}</b><br>
          ${p.issues.join("<br>")}
        </div>
      `;
    });
  }

  html += `</div>`;

  document.getElementById("module2").innerHTML = html;
}
