(() => {
  const CONFIG_URL = '../data/mm/fcn_one_month_plan.json';
  const FCN_URL = '../data/fcn_pool.json';
  const M1_URL = '../data/m1/m1_scores.json';
  const M7_URL = '../data/m7_sandbox/m7_v2_scores.json';
  const OPTION_URL = '../data/options/option_runtime.json';
  const SCALE = 0.1;
  const TODAY = new Date('2026-05-12T00:00:00+08:00');
  const WINDOW_DAYS = 30;
  const BANK_ALIAS = {
    '永豐': 'Bank-w', 'sinopac': 'Bank-w', 'Sinopac': 'Bank-w', 'SinoPac': 'Bank-w',
    '富邦': 'Bank-t', 'fubon': 'Bank-t', 'Fubon': 'Bank-t'
  };

  const $ = (id) => document.getElementById(id);
  const fmt = (n, d = 0) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { maximumFractionDigits: d }) : '--';
  const num = (v, fb = 0) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const s = v.replace(/[,%\s]/g, '');
      if (!s) return fb;
      const x = Number(s);
      return Number.isFinite(x) ? x : fb;
    }
    return fb;
  };
  const dateOf = (v) => {
    if (v === null || v === undefined) return null;
    const s = String(v).trim();
    if (!s) return null;
    const d = new Date(s.replace(/\//g, '-'));
    return Number.isFinite(d.getTime()) ? d : null;
  };
  const daysBetween = (a, b) => Math.floor((b.getTime() - a.getTime()) / 86400000);
  const safeArr = (x) => Array.isArray(x) ? x : (x && typeof x === 'object' ? Object.values(x) : []);

  async function loadJson(url, fallback) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`${res.status} ${url}`);
      return await res.json();
    } catch (err) {
      console.warn('[FCN Planner] load failed:', url, err.message);
      return fallback;
    }
  }

  function aliasBank(v) {
    const raw = String(v ?? '').trim();
    return BANK_ALIAS[raw] || raw || 'Unknown';
  }

  function extractSymbols(row) {
    const raw = row.basket || row.symbols || row.underlyings || row.stocks || row.stock_list || row.tickers || row.symbol;
    if (Array.isArray(raw)) return raw.map(String).map(s => s.trim().toUpperCase()).filter(Boolean);
    if (typeof raw === 'string') return raw.split(/[+,/|;\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean);
    return [];
  }

  function normalizeRows(rawPool) {
    const rows = safeArr(rawPool && rawPool.data ? rawPool.data : rawPool);
    return rows.map((r, idx) => {
      const amount = num(r.amt ?? r.amount ?? r.principal ?? r.notional ?? r.invest_amount ?? r.money ?? r.display_amount, 0);
      const symbols = extractSymbols(r);
      const exit = dateOf(r.exit_time ?? r.exit_date);
      const entry = dateOf(r.entry_time ?? r.created_time ?? r.date ?? r.entry_date ?? r.create_date ?? r.trade_date ?? r.start_date);
      return {
        raw: r,
        id: r.fcn_id || r.id || r.no || r.product_id || `FCN-${idx + 1}`,
        bank: aliasBank(r.tw_bank ?? r.bank ?? r.broker ?? r.source_bank ?? r.platform),
        sourceBank: String(r.bank ?? '').trim(),
        amount,
        displayAmount: amount * SCALE,
        realAmount: amount,
        coupon: num(r.coupon_rate ?? r.rate ?? r.coupon ?? r.annual_coupon ?? r.apr, 0),
        tenor: num(r.tenor_months ?? r.tenor ?? r.period_months ?? r.months, 0),
        maturity: dateOf(r.maturity_time ?? r.maturity_date ?? r.expiry_date ?? r.end_date ?? r.mature_date),
        entry,
        exit,
        symbols,
        strike: num(r.strike ?? r.strike_pct ?? r.strike_price, 0),
        ki: num(r.ki ?? r.ki_pct ?? r.knock_in ?? r.knock_in_pct, 0),
        status: String(r.status ?? r.state ?? '').trim().toLowerCase(),
        hasPosition: r.has_position !== false,
        hasKiBreach: r.has_ki_breach === true,
        entryPrices: r.entry_prices && typeof r.entry_prices === 'object' ? r.entry_prices : {},
        currentPrices: r.current_prices && typeof r.current_prices === 'object' ? r.current_prices : (r.market_prices && typeof r.market_prices === 'object' ? r.market_prices : {}),
        worstOf: String(r.worst_of ?? r.worstOf ?? r.worst_symbol ?? symbols[0] ?? '').toUpperCase()
      };
    }).filter(r => r.amount > 0 || r.symbols.length || r.coupon > 0);
  }

  function stockScore(symbol, m1, m7, opt) {
    const m1Obj = m1?.[symbol] || m1?.data?.[symbol] || {};
    const m7Obj = m7?.[symbol] || m7?.data?.[symbol] || {};
    const optObj = opt?.[symbol] || opt?.data?.[symbol] || {};
    const m1s = num(m1Obj.m1_score ?? m1Obj.score ?? m1Obj.m1_raw_scaled, 6);
    const m7s = num(m7Obj.m7_v2_score ?? m7Obj.score ?? m7Obj.final_score, 6);
    const trend = num(m7Obj.trend_score ?? m7Obj.trend ?? 6, 6);
    const rp = num(optObj.rate_pressure_score ?? optObj.rp_score ?? 5, 5);
    return Math.max(1, Math.min(10, 0.35 * m1s + 0.35 * m7s + 0.2 * trend + 0.1 * (10 - Math.min(10, rp))));
  }

  function inferWorstOf(row, m1, m7, opt) {
    if (row.worstOf) return row.worstOf;
    if (!row.symbols.length) return '--';
    return row.symbols.map(s => ({ s, score: stockScore(s, m1, m7, opt) })).sort((a, b) => a.score - b.score)[0].s;
  }

  function sectorLikeConcentrated(symbols) {
    const semi = ['NVDA','TSM','AVGO','AMD','MU','MRVL','ARM','AMAT','ASML','SMH','INTC','QCOM','LRCX'];
    const tech = ['MSFT','GOOG','AMZN','META','AAPL','ORCL','PLTR','CRM','NOW'];
    const count = (list) => symbols.filter(s => list.includes(s)).length;
    return count(semi) >= Math.max(3, symbols.length - 1) || count(tech) >= Math.max(3, symbols.length - 1);
  }

  function healthCheck(row, m1, m7, opt, exposureBySymbol) {
    const symbols = row.symbols.length ? row.symbols : [row.worstOf].filter(Boolean);
    const worst = inferWorstOf(row, m1, m7, opt);
    const scores = symbols.map(s => stockScore(s, m1, m7, opt));
    const avgQuality = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 6;
    const worstScore = worst && worst !== '--' ? stockScore(worst, m1, m7, opt) : Math.min(...scores, 6);
    const diversification = Math.min(10, 4 + symbols.length * 1.3);
    const kiSafety = row.ki ? Math.max(1, Math.min(10, (70 - row.ki) / 2.5)) : 6;
    const basketScore = Math.max(1, Math.min(10, 0.35 * worstScore + 0.25 * avgQuality + 0.2 * diversification + 0.1 * kiSafety + 0.1 * worstScore));
    const flags = [];
    if (row.hasKiBreach) flags.push('ki_breach');
    if (row.ki >= 60) flags.push('near_KI');
    if (worstScore < 5.5) flags.push('weak_worst_of');
    if (symbols.length >= 3 && sectorLikeConcentrated(symbols)) flags.push('sector_concentration');
    if (worst && exposureBySymbol[worst] && exposureBySymbol[worst] > 25) flags.push('single_name_overexposure');
    const risk = row.hasKiBreach || basketScore < 5.5 ? 'danger' : basketScore < 6.8 || flags.length ? 'tracking' : 'healthy';
    return { worst, basketScore, flags, risk };
  }

  function isExited(row) {
    return Boolean(row.exit);
  }

  function expectedExitRadar(row) {
    if (isExited(row) || !row.entry) return false;
    const age = daysBetween(row.entry, TODAY);
    if (age <= 21) return false;
    const rec = row.raw?.early_exit_record;
    if (rec && typeof rec === 'object') {
      const vals = Object.values(rec);
      if (vals.length && vals.every(v => v && v.hit === true)) return true;
    }
    if (!row.symbols.length || !Object.keys(row.currentPrices).length) return false;
    return row.symbols.every(s => num(row.currentPrices[s], 0) > 0 && num(row.entryPrices[s], 0) > 0 && num(row.currentPrices[s], 0) > num(row.entryPrices[s], 0));
  }

  function deliveryRisk(row, health) {
    if (isExited(row)) return { stockDeliveryRisk: false, stockDeliveryReason: 'closed/exited; not evaluated' };
    if (row.hasKiBreach) return { stockDeliveryRisk: true, stockDeliveryReason: 'has_ki_breach=true' };
    // M2-compatible: 接股/額度占用 only for actual delivery/barrier signals.
    // High KI / near_KI / weak basket are Danger/Tracking, not delivery hold.
    const statusText = String(row.status || '').toLowerCase();
    const rawText = String(row.raw?.note || row.raw?.memo || row.raw?.remark || row.raw?.risk_note || '').toLowerCase();
    const explicitDelivery = row.raw?.stock_delivery_risk === true || row.raw?.expected_stock_delivery === true || row.raw?.must_take_stock === true;
    if (explicitDelivery) return { stockDeliveryRisk: true, stockDeliveryReason: 'M2-compatible explicit delivery flag=true' };
    if (/接股|入股|破下限|knock.?in|ki breach|barrier breach|delivery/.test(statusText + ' ' + rawText)) {
      return { stockDeliveryRisk: true, stockDeliveryReason: 'M2-compatible status/note indicates delivery or barrier breach' };
    }
    return { stockDeliveryRisk: false, stockDeliveryReason: 'no M2-compatible delivery signal' };
  }

  function classifyRow(row, m1, m7, opt, exposureBySymbol) {
    Object.assign(row, healthCheck(row, m1, m7, opt, exposureBySymbol));
    Object.assign(row, deliveryRisk(row, row));
    row.daysSinceEntry = row.entry ? daysBetween(row.entry, TODAY) : null;
    row.daysToMaturity = row.maturity ? daysBetween(TODAY, row.maturity) : null;
    row.isNew30d = row.daysSinceEntry !== null && row.daysSinceEntry >= 0 && row.daysSinceEntry <= 30;

    if (isExited(row)) {
      row.lifecycle = 'closed';
      row.cashClass = 'excluded_closed';
      row.reason = 'exit_time has date => exited';
      return row;
    }

    row.lifecycle = 'active';
    row.isMaturing30d = row.daysToMaturity !== null && row.daysToMaturity >= 0 && row.daysToMaturity <= WINDOW_DAYS;
    row.isExpectedExitRadar = expectedExitRadar(row);
    row.cashAvailable = row.isMaturing30d && !row.stockDeliveryRisk;
    row.deliveryHold = row.stockDeliveryRisk;

    if (row.deliveryHold) {
      row.cashClass = 'delivery_hold';
      row.reason = row.stockDeliveryReason || 'delivery/ki risk';
    } else if (row.cashAvailable) {
      row.cashClass = 'maturity_available';
      row.reason = 'active + maturity within 30d + no delivery risk';
    } else if (row.isExpectedExitRadar) {
      row.cashClass = 'expected_available';
      row.reason = 'expected exit radar: all hits/current > entry and age >21d';
    } else {
      row.cashClass = 'active_holding';
      row.reason = 'active: exit_time empty/null';
    }
    return row;
  }

  function sumRows(rows) {
    return rows.reduce((s, r) => s + r.displayAmount, 0);
  }
  function countRows(rows) { return rows.length; }
  function byBank(rows, bank) { return rows.filter(r => r.bank === bank); }
  function rowStat(rows) { return { amount: sumRows(rows), count: countRows(rows) }; }

  function analyze(rows, m1, m7, opt) {
    const totalAll = sumRows(rows);
    const bySymbolAmt = {};
    rows.forEach(r => r.symbols.forEach(s => { bySymbolAmt[s] = (bySymbolAmt[s] || 0) + r.displayAmount; }));
    const exposureBySymbol = Object.fromEntries(Object.entries(bySymbolAmt).map(([k, v]) => [k, totalAll ? v / totalAll * 100 : 0]));
    rows.forEach(r => classifyRow(r, m1, m7, opt, exposureBySymbol));

    const active = rows.filter(r => r.lifecycle === 'active');
    const closed = rows.filter(r => r.lifecycle === 'closed');
    const maturity = active.filter(r => r.cashClass === 'maturity_available');
    const expected = active.filter(r => r.cashClass === 'expected_available');
    const delivery = active.filter(r => r.cashClass === 'delivery_hold');
    const available30 = maturity.concat(expected);
    const dangerTracking = active.filter(r => r.risk === 'danger' || r.risk === 'tracking');
    const healthy = active.filter(r => r.risk === 'healthy');
    const analysisBody = active.filter(r => !maturity.includes(r) && !delivery.includes(r));

    return {
      rows, active, closed, maturity, expected, delivery, available30, dangerTracking, healthy, analysisBody,
      summary: {
        active: rowStat(active), closed: rowStat(closed), available30: rowStat(available30), maturity: rowStat(maturity), expected: rowStat(expected), delivery: rowStat(delivery),
        bankT: rowStat(byBank(active, 'Bank-t')), bankW: rowStat(byBank(active, 'Bank-w')),
        dangerTracking: rowStat(dangerTracking), healthy: rowStat(healthy), analysisBody: rowStat(analysisBody)
      }
    };
  }

  function statLine(label, rows) {
    return `<div class="metric"><span>${label}</span><b>${fmt(sumRows(rows))} <small>(${rows.length}檔)</small></b></div>`;
  }
  function summaryBlock(title, rows, subRows, note='') {
    return `<div class="kpi"><div class="k">${title}</div><div class="v">${fmt(sumRows(rows))}</div><div class="d">${rows.length} 檔${note ? '｜' + note : ''}</div><div style="margin-top:10px">${subRows.join('')}</div></div>`;
  }

  function renderKpis(a) {
    const bT = byBank(a.active, 'Bank-t');
    const bW = byBank(a.active, 'Bank-w');
    const dtT = byBank(a.dangerTracking, 'Bank-t');
    const dtW = byBank(a.dangerTracking, 'Bank-w');
    const hT = byBank(a.healthy, 'Bank-t');
    const hW = byBank(a.healthy, 'Bank-w');
    $('kpiGrid').innerHTML = [
      summaryBlock('30天可用現金', a.available30, [statLine('到期可用', a.maturity), statLine('預計可用', a.expected), statLine('接股 / 額度占用', a.delivery)]),
      summaryBlock('富邦', bT, [statLine('到期可用', byBank(a.maturity, 'Bank-t')), statLine('預計可用', byBank(a.expected, 'Bank-t')), statLine('接股 / 額度占用', byBank(a.delivery, 'Bank-t'))]),
      summaryBlock('永豐', bW, [statLine('到期可用', byBank(a.maturity, 'Bank-w')), statLine('預計可用', byBank(a.expected, 'Bank-w')), statLine('接股 / 額度占用', byBank(a.delivery, 'Bank-w'))]),
      summaryBlock('Danger / Tracking', a.dangerTracking, [statLine('富邦', dtT), statLine('永豐', dtW)]),
      summaryBlock('健康', a.healthy, [statLine('富邦', hT), statLine('永豐', hW)]),
      summaryBlock('實際持倉總額', a.active, [statLine('富邦', bT), statLine('永豐', bW)], 'active only / exit_time 空'),
      summaryBlock('分析母體', a.analysisBody, [statLine('Closed 排除', a.closed), statLine('Active 留存', a.analysisBody)], '不超過實際持倉')
    ].join('');
  }

  function renderCash(a) {
    $('cashSummary').innerHTML = `<h3>資金回收摘要</h3>` +
      statLine('30天可用現金', a.available30) + statLine('到期可用', a.maturity) + statLine('預計可用', a.expected) + statLine('接股 / 額度占用', a.delivery) +
      `<p class="note">Phase 1C：exit_time 有日期一律 closed，不進入 cash radar / 接股 / 分析母體。</p>`;
    const banks = ['Bank-t', 'Bank-w'];
    $('cashBankBars').innerHTML = banks.map(bank => {
      const rows = byBank(a.available30, bank);
      const max = Math.max(sumRows(a.available30), 1);
      return bar(`${bank} 30天可用`, sumRows(rows), max);
    }).join('');
    const timelineRows = a.available30.concat(a.delivery).slice(0, 12);
    const max = Math.max(...timelineRows.map(r=>r.displayAmount), 1);
    $('cashTimeline').innerHTML = timelineRows.map(r => bar(`${r.id}｜${r.cashClass}｜${r.reason}`, r.displayAmount, max, r.cashClass === 'delivery_hold' ? 'bad' : 'warn')).join('') || '<p class="note">目前沒有 30 天可用或接股占用資料。</p>';
  }

  function renderBase(a) {
    $('baseSummary').innerHTML = `<h3>扣除後母體</h3>` +
      statLine('實際持倉總額', a.active) + statLine('Closed 排除', a.closed) + statLine('接股占用', a.delivery) + statLine('分析母體', a.analysisBody) +
      `<p class="note">分析母體 = active 持倉扣除到期可用與接股占用；closed 不列入。</p>`;
    const pct = sumRows(a.active) ? Math.max(0, Math.min(100, sumRows(a.analysisBody) / sumRows(a.active) * 100)) : 0;
    $('baseDonut').style.background = `conic-gradient(#2f80ed 0 ${pct}%, #f4a261 ${pct}% 100%)`;
    $('baseDonutText').innerHTML = `分析母體 ${fmt(sumRows(a.analysisBody))} / 實際持倉 ${fmt(sumRows(a.active))}`;
    const worst = Object.entries(a.active.reduce((acc,r)=>{ acc[r.worst]=(acc[r.worst]||0)+r.displayAmount; return acc; },{})).sort((x,y)=>y[1]-x[1]).slice(0,8);
    const max = Math.max(...worst.map(x=>x[1]),1);
    $('worstOfBars').innerHTML = worst.map(([k,v])=>bar(k,v,max)).join('') || '<p class="note">尚無 worst-of 資料。</p>';
  }

  function renderMix(a) {
    $('mixSummary').innerHTML = `<h3>收益配置摘要</h3>` + statLine('Active', a.active) + statLine('健康', a.healthy) + statLine('Danger / Tracking', a.dangerTracking) + `<p class="note">Phase 1C 先聚焦 lifecycle 與 dashboard，收益配置細節留 Phase 2+。</p>`;
    $('mixBars').innerHTML = ['Bank-t','Bank-w'].map(bank => bar(bank, sumRows(byBank(a.active, bank)), Math.max(sumRows(a.active),1))).join('');
  }

  function renderHealth(a) {
    const groups = { healthy: a.healthy, tracking: a.active.filter(r=>r.risk==='tracking'), danger: a.active.filter(r=>r.risk==='danger') };
    const max = Math.max(...Object.values(groups).map(sumRows), 1);
    $('scoreBars').innerHTML = Object.entries(groups).map(([k, rows])=>bar(k, sumRows(rows), max, k==='danger'?'bad':k==='tracking'?'warn':'')).join('');
    $('flagBars').innerHTML = '<p class="note">High Risk / Critical / Top Worst-of 留到 Phase 3/4；本版只顯示 healthy / tracking / danger。</p>';
    $('healthRows').innerHTML = a.active.map(r => `<tr><td>${r.id}</td><td>${r.bank}</td><td>${r.symbols.join('+') || '--'}</td><td><b>${r.worst}</b></td><td>${r.basketScore.toFixed(2)}</td><td><span class="pill ${r.risk==='danger'?'bad':r.risk==='tracking'?'warn':'ok'}">${r.risk}</span></td><td>${r.flags.join(', ') || 'none'}</td><td>${r.reason}</td></tr>`).join('') || '<tr><td colspan="8">尚無 active 資料</td></tr>';
  }

  function renderPlan(a) {
    $('recommendCards').innerHTML = [
      ['本版重點', 'Lifecycle + Dashboard', '先把 exit_time 與 active/closed/cash radar 分類做乾淨。'],
      ['普通單門檻', 'Bank-t 1 lot / Bank-w 3 lots', '金額建議與 M8 market scanner 留下一階段。'],
      ['下一步', 'Phase 2+', '140萬庫存水位、M8 template、market_fcn_history scanner。']
    ].map(([h,v,d])=>`<div class="rec-card"><h4>${h}</h4><div class="kpi"><div class="v">${v}</div><div class="d">${d}</div></div></div>`).join('');
    $('bankPlanBars').innerHTML = ['Bank-t','Bank-w'].map(bank=>bar(`${bank} active`, sumRows(byBank(a.active, bank)), Math.max(sumRows(a.active),1))).join('');
  }

  function ensureDetailSection() {
    if ($('allFcnDetail')) return;
    const main = document.querySelector('main') || document.body;
    const wrap = document.createElement('details');
    wrap.id = 'allFcnDetail';
    wrap.className = 'planner-section';
    wrap.open = true;
    wrap.innerHTML = `<summary><span>所有 FCN 分析明細 / All FCN Analysis Detail</span><em>Explainability</em></summary><div class="section-body"><div id="fcnFilterChips" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px"></div><div style="overflow:auto"><table><thead><tr><th>FCN</th><th>Lifecycle</th><th>Cash</th><th>Bank</th><th>Amt</th><th>Entry</th><th>Exit</th><th>Maturity</th><th>Status</th><th>Basket</th><th>Risk</th><th>Reason</th></tr></thead><tbody id="allFcnRows"></tbody></table></div></div>`;
    main.appendChild(wrap);
  }

  function renderAllFcnTable(a) {
    ensureDetailSection();
    const filters = [
      ['all','All'], ['active','Active'], ['closed','Closed'], ['maturity','到期可用'], ['expected','預計可用'], ['delivery','接股 / 額度占用'], ['danger','Danger'], ['tracking','Tracking'], ['healthy','健康'], ['bankt','富邦'], ['bankw','永豐'], ['new30','新增FCN']
    ];
    const chips = $('fcnFilterChips');
    const tbody = $('allFcnRows');
    const pick = (key) => {
      if (key === 'active') return a.rows.filter(r=>r.lifecycle==='active');
      if (key === 'closed') return a.closed;
      if (key === 'maturity') return a.maturity;
      if (key === 'expected') return a.expected;
      if (key === 'delivery') return a.delivery;
      if (key === 'danger') return a.active.filter(r=>r.risk==='danger');
      if (key === 'tracking') return a.active.filter(r=>r.risk==='tracking');
      if (key === 'healthy') return a.healthy;
      if (key === 'bankt') return byBank(a.active,'Bank-t');
      if (key === 'bankw') return byBank(a.active,'Bank-w');
      if (key === 'new30') return a.rows.filter(r=>r.isNew30d);
      return a.rows;
    };
    const draw = (key) => {
      const rows = pick(key);
      tbody.innerHTML = rows.map(r => `<tr><td>${r.id}</td><td>${r.lifecycle}</td><td>${r.cashClass}</td><td>${r.bank}</td><td>${fmt(r.displayAmount)}</td><td>${r.entry ? r.entry.toISOString().slice(0,10) : '--'}</td><td>${r.exit ? r.exit.toISOString().slice(0,10) : '--'}</td><td>${r.maturity ? r.maturity.toISOString().slice(0,10) : '--'}</td><td>${r.status || '--'}</td><td>${r.symbols.join('+')}</td><td>${r.risk}</td><td>${r.reason}</td></tr>`).join('') || '<tr><td colspan="12">No rows</td></tr>';
    };
    chips.innerHTML = filters.map(([k,label])=>`<button class="nav-item" data-filter="${k}" type="button">${label}</button>`).join('');
    chips.querySelectorAll('[data-filter]').forEach(btn => btn.onclick = () => draw(btn.dataset.filter));
    draw('all');
  }

  function wireButtons() {
    const safe = (id, fn) => { const el = $(id); if (el) el.onclick = fn; };
    safe('expandAll', () => document.querySelectorAll('.planner-section').forEach(d => d.open = true));
    safe('collapseAll', () => document.querySelectorAll('.planner-section').forEach(d => d.open = false));
    safe('showRiskOnly', () => document.querySelectorAll('.planner-section').forEach(d => d.open = d.classList.contains('risk-section')));
    safe('resetView', () => document.querySelectorAll('.planner-section').forEach(d => d.open = ['cash','base','mix','health','plan','allFcnDetail'].includes(d.id)));
    document.querySelectorAll('.nav-item').forEach(n => { if (n.dataset.target) n.onclick = () => $(n.dataset.target)?.scrollIntoView({ behavior:'smooth', block:'start' }); });
  }

  function renderNotes(rows) {
    const el = $('dataNotes');
    if (!el) return;
    el.innerHTML = `讀取 FCN 筆數：${rows.length}<br>資料源：data/fcn_pool.json only，不讀 fcn_pool_old.json。<br>金額：amt × 0.1。<br>Lifecycle：exit_time 有日期 = closed；exit_time null/empty = active 再細分。`;
  }

  async function init() {
    wireButtons();
    const [cfg, pool, m1, m7, opt] = await Promise.all([
      loadJson(CONFIG_URL, {}), loadJson(FCN_URL, []), loadJson(M1_URL, {}), loadJson(M7_URL, {}), loadJson(OPTION_URL, {})
    ]);
    const rows = normalizeRows(pool);
    const analysis = analyze(rows, m1, m7, opt);
    renderKpis(analysis, cfg); renderCash(analysis); renderBase(analysis); renderMix(analysis); renderHealth(analysis); renderPlan(analysis, cfg); renderAllFcnTable(analysis); renderNotes(rows, cfg);
  }

  document.addEventListener('DOMContentLoaded', init);
})();



