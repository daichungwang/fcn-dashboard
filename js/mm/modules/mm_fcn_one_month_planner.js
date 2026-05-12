(() => {
  const CONFIG_URL = '../data/mm/fcn_one_month_plan.json';
  const FCN_URLS = ['../data/fcn_pool.json', '../data/fcn_pool_old.json'];
  const M1_URL = '../data/m1/m1_scores.json';
  const M7_URL = '../data/m7_sandbox/m7_v2_scores.json';
  const OPTION_URL = '../data/options/option_runtime.json';
  const SCALE = 0.1;
  const TODAY = new Date('2026-05-12T00:00:00+08:00');
  const WINDOW_DAYS = 30;
  const TRANSFER_FEE_USD = 20;
  const MIN_TICKET = { 'Bank-w': 30000, 'Bank-t': 10000 };
  const BANK_ALIAS = {
    '永豐': 'Bank-w',
    'sinopac': 'Bank-w',
    'Sinopac': 'Bank-w',
    'SinoPac': 'Bank-w',
    '富邦': 'Bank-t',
    'fubon': 'Bank-t',
    'Fubon': 'Bank-t'
  };
  const TARGETS = {
    stable_cashflow: { label: '長期穩定現金流', target: 40, min: 12, max: 17.99 },
    reasonable_investment: { label: '合理投資型', target: 30, min: 18, max: 20.99 },
    aggressive: { label: '積極單', target: 20, min: 21, max: 25 },
    short_term_speculative: { label: '短期投機單', target: 10, tenorMax: 6 }
  };

  const $ = (id) => document.getElementById(id);
  const fmt = (n, digits = 0) => Number.isFinite(Number(n)) ? Number(n).toLocaleString('en-US', { maximumFractionDigits: digits }) : '--';
  const pct = (n, digits = 1) => Number.isFinite(Number(n)) ? `${Number(n).toFixed(digits)}%` : '--';
  const num = (v, fallback = 0) => {
    if (typeof v === 'number' && Number.isFinite(v)) return v;
    if (typeof v === 'string') {
      const cleaned = v.replace(/[,%\s]/g, '');
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed)) return parsed;
    }
    return fallback;
  };
  const dateOf = (v) => {
    if (!v) return null;
    const d = new Date(String(v).replace(/\//g, '-'));
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
    if (!v) return 'Unknown';
    return BANK_ALIAS[v] || BANK_ALIAS[String(v).trim()] || String(v).trim();
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
      const amount = num(r.amount ?? r.principal ?? r.notional ?? r.invest_amount ?? r.money ?? r.display_amount, 0);
      const coupon = num(r.coupon_rate ?? r.rate ?? r.coupon ?? r.annual_coupon ?? r.apr, 0);
      const tenor = num(r.tenor_months ?? r.tenor ?? r.period_months ?? r.months, 0);
      const maturity = dateOf(r.maturity_date ?? r.expiry_date ?? r.end_date ?? r.mature_date);
      const entry = dateOf(r.entry_date ?? r.create_date ?? r.trade_date ?? r.start_date);
      const expectedCash = dateOf(r.expected_cash_release_date ?? r.cash_date ?? r.payment_date ?? r.settlement_date);
      const symbols = extractSymbols(r);
      const bank = aliasBank(r.bank ?? r.broker ?? r.source_bank ?? r.platform);
      const id = r.fcn_id || r.id || r.no || r.product_id || `FCN-${idx + 1}`;
      const currentPrice = num(r.current_price ?? r.spot ?? r.worst_of_price ?? r.price_now, 0);
      const kiPrice = num(r.ki_price ?? r.knock_in_price ?? r.lower_barrier_price, 0);
      const rawStatus = String(r.status ?? r.state ?? '').toLowerCase();
      return {
        raw: r,
        id,
        bank,
        amount,
        displayAmount: amount * SCALE,
        coupon,
        tenor,
        maturity,
        entry,
        expectedCash,
        symbols,
        strike: num(r.strike ?? r.strike_pct ?? r.strike_price, 0),
        ki: num(r.ki ?? r.ki_pct ?? r.knock_in ?? r.knock_in_pct, 0),
        currentPrice,
        kiPrice,
        status: rawStatus,
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

  function classifyIncome(row) {
    if (row.tenor > 0 && row.tenor <= 6) return 'short_term_speculative';
    if (row.coupon >= 21 && row.coupon <= 25) return 'aggressive';
    if (row.coupon >= 18 && row.coupon <= 20.99) return 'reasonable_investment';
    if (row.coupon >= 12 && row.coupon <= 17.99) return 'stable_cashflow';
    if (row.coupon > 25) return 'short_term_speculative';
    return 'stable_cashflow';
  }

  function inferDeliveryRisk(row, health) {
    const explicit = row.raw.stock_delivery_risk === true || row.raw.expected_stock_delivery === true || row.raw.must_take_stock === true;
    const statusHit = /接股|入股|破下限|knock.?in|ki hit|barrier hit|delivery/.test(row.status);
    const priceHit = row.currentPrice > 0 && row.kiPrice > 0 && row.currentPrice <= row.kiPrice;
    const pctHit = row.ki >= 60 && health.basketScore < 5.8;
    const criticalMaturity = row.isMaturing30d && (health.risk === 'Critical' || health.flags.includes('near_KI'));
    const risk = explicit || statusHit || priceHit || pctHit || criticalMaturity;
    const reason = explicit ? '原始資料標記可能接股' : statusHit ? '狀態含破下限/接股訊號' : priceHit ? '現價低於或接近 KI price' : pctHit ? 'KI 偏高且 basket score 偏弱' : criticalMaturity ? '30 天到期但風險為 Critical / near_KI' : '';
    return { stockDeliveryRisk: risk, stockDeliveryReason: reason };
  }

  function healthCheck(row, m1, m7, opt, exposureBySymbol) {
    const symbols = row.symbols.length ? row.symbols : [row.worstOf].filter(Boolean);
    const worst = inferWorstOf(row, m1, m7, opt);
    const scores = symbols.map(s => stockScore(s, m1, m7, opt));
    const avgQuality = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 6;
    const worstScore = worst && worst !== '--' ? stockScore(worst, m1, m7, opt) : Math.min(...scores, 6);
    const diversification = Math.min(10, 4 + symbols.length * 1.3);
    const kiSafety = row.ki ? Math.max(1, Math.min(10, (70 - row.ki) / 2.5)) : 6;
    const valuationTiming = worstScore;
    const basketScore = Math.max(1, Math.min(10, 0.35 * worstScore + 0.25 * avgQuality + 0.2 * diversification + 0.1 * kiSafety + 0.1 * valuationTiming));
    const flags = [];
    if (row.ki >= 60) flags.push('near_KI');
    if (worstScore < 5.5) flags.push('weak_worst_of');
    if (symbols.length >= 3 && sectorLikeConcentrated(symbols)) flags.push('sector_concentration');
    if (worst && exposureBySymbol[worst] && exposureBySymbol[worst] > 25) flags.push('single_name_overexposure');
    if (row.tenor >= 10 && worstScore < 6.5) flags.push('long_tenor_high_vol');
    if (row.coupon < 18 && worstScore < 5.8) flags.push('m8_underpaid_risk');
    const risk = basketScore < 4.5 || flags.includes('near_KI') && worstScore < 5.5 ? 'Critical' : basketScore < 5.5 ? 'High Risk' : basketScore < 6.5 ? 'Caution' : basketScore < 7.5 ? 'Watch' : 'Healthy';
    const action = risk === 'Critical' ? '停止加碼 / 列入處理' : risk === 'High Risk' ? '不新增同類 basket' : risk === 'Caution' ? '觀察 / 降低集中' : risk === 'Watch' ? '續抱但不急加碼' : '可續抱';
    return { worst, basketScore, flags, risk, action };
  }

  function sectorLikeConcentrated(symbols) {
    const semi = ['NVDA','TSM','AVGO','AMD','MU','MRVL','ARM','AMAT','ASML','SMH','INTC','QCOM','LRCX'];
    const tech = ['MSFT','GOOG','AMZN','META','AAPL','ORCL','PLTR','CRM','NOW'];
    const count = (list) => symbols.filter(s => list.includes(s)).length;
    return count(semi) >= Math.max(3, symbols.length - 1) || count(tech) >= Math.max(3, symbols.length - 1);
  }

  function analyze(rows, m1, m7, opt) {
    const total = rows.reduce((s, r) => s + r.displayAmount, 0);
    const bySymbolAmt = {};
    rows.forEach(r => r.symbols.forEach(s => { bySymbolAmt[s] = (bySymbolAmt[s] || 0) + r.displayAmount; }));
    const exposureBySymbol = Object.fromEntries(Object.entries(bySymbolAmt).map(([k, v]) => [k, total ? v / total * 100 : 0]));

    rows.forEach(r => {
      r.incomeClass = classifyIncome(r);
      r.daysToMaturity = r.maturity ? daysBetween(TODAY, r.maturity) : null;
      r.isMaturing30d = r.daysToMaturity !== null && r.daysToMaturity >= 0 && r.daysToMaturity <= WINDOW_DAYS;
      r.isExpectedExit = /exit|autocall|called|出場|提前|到期/.test(r.status) || (r.raw.expected_exit === true);
      Object.assign(r, healthCheck(r, m1, m7, opt, exposureBySymbol));
      Object.assign(r, inferDeliveryRisk(r, r));
      r.excludeFromBase = r.isMaturing30d || r.isExpectedExit;
      r.cashAvailable = r.excludeFromBase && !r.stockDeliveryRisk;
      r.bankCapacityHold = r.excludeFromBase && r.stockDeliveryRisk;
    });

    const exitRows = rows.filter(r => r.excludeFromBase);
    const cashRows = rows.filter(r => r.cashAvailable);
    const deliveryRows = rows.filter(r => r.bankCapacityHold);
    const baseRows = rows.filter(r => !r.excludeFromBase);
    const cash = sumBy(cashRows, r => r.bank, r => r.displayAmount);
    const deliveryHold = sumBy(deliveryRows, r => r.bank, r => r.displayAmount);
    const mix = {};
    Object.keys(TARGETS).forEach(k => mix[k] = { ...TARGETS[k], amount: 0, pct: 0, gapPct: 0, gapAmount: 0 });
    baseRows.forEach(r => { mix[r.incomeClass].amount += r.displayAmount; });
    const baseTotal = baseRows.reduce((s, r) => s + r.displayAmount, 0);
    Object.keys(mix).forEach(k => {
      mix[k].pct = baseTotal ? mix[k].amount / baseTotal * 100 : 0;
      mix[k].gapPct = mix[k].target - mix[k].pct;
      mix[k].gapAmount = baseTotal ? baseTotal * mix[k].target / 100 - mix[k].amount : 0;
    });
    const worstBars = sumBy(baseRows, r => r.worst || r.worstOf || '--', r => r.displayAmount);
    const riskCounts = countBy(baseRows, r => r.risk);
    const flagCounts = {};
    baseRows.forEach(r => r.flags.forEach(f => { flagCounts[f] = (flagCounts[f] || 0) + 1; }));
    const avgScore = baseRows.length ? baseRows.reduce((s, r) => s + r.basketScore, 0) / baseRows.length : 0;
    return { rows, exitRows, cashRows, deliveryRows, baseRows, total, baseTotal, excludedTotal: exitRows.reduce((s,r)=>s+r.displayAmount,0), availableCashTotal: cashRows.reduce((s,r)=>s+r.displayAmount,0), deliveryHoldTotal: deliveryRows.reduce((s,r)=>s+r.displayAmount,0), cash, deliveryHold, mix, worstBars, riskCounts, flagCounts, avgScore };
  }

  function sumBy(rows, keyFn, valFn) {
    return rows.reduce((acc, r) => { const k = keyFn(r); acc[k] = (acc[k] || 0) + valFn(r); return acc; }, {});
  }
  function countBy(rows, keyFn) {
    return rows.reduce((acc, r) => { const k = keyFn(r); acc[k] = (acc[k] || 0) + 1; return acc; }, {});
  }

  function bar(label, value, max, cls='') {
    const w = max ? Math.max(2, Math.min(100, value / max * 100)) : 0;
    return `<div class="bar-row"><span>${label}</span><div class="bar-bg"><div class="bar-fill ${cls}" style="width:${w}%"></div></div><b>${fmt(value)}</b></div>`;
  }
  function metric(k, v) { return `<div class="metric"><span>${k}</span><b>${v}</b></div>`; }
  function pillForRisk(r) { return r === 'Critical' ? 'bad' : r === 'High Risk' ? 'bad' : r === 'Caution' ? 'warn' : r === 'Watch' ? 'warn' : 'ok'; }

  function renderKpis(a, cfg) {
    const high = (a.riskCounts['High Risk'] || 0);
    const critical = (a.riskCounts['Critical'] || 0);
    const topWorst = Object.entries(a.worstBars).sort((x,y)=>y[1]-x[1])[0]?.[0] || '--';
    const budget = cfg?.new_allocation_budget?.total_display || 140000;
    $('kpiGrid').innerHTML = [
      ['30 天可用現金', fmt(a.availableCashTotal), '排除高機率接股 FCN'],
      ['接股 / 額度占用', fmt(a.deliveryHoldTotal), '不列入可配置資金'],
      ['本月新增配置', fmt(budget), 'Bank-t 90,000 + Bank-w 50,000'],
      ['分析母體', fmt(a.baseTotal), '扣除一個月內離場後'],
      ['Basket 平均分數', a.avgScore ? a.avgScore.toFixed(2) : '--', '持股健檢核心指標'],
      ['High Risk', high, '不新增同類 basket'],
      ['Critical', critical, '停止加碼 / 列處理'],
      ['Top Worst-of', topWorst, '最大集中風險標的']
    ].map(([k,v,d]) => `<div class="kpi"><div class="k">${k}</div><div class="v">${v}</div><div class="d">${d}</div></div>`).join('');
  }

  function renderCash(a) {
    $('cashSummary').innerHTML = `<h3>資金回收摘要</h3>` +
      metric('30 天到期 / 出場總額', fmt(a.excludedTotal)) +
      metric('可用現金', fmt(a.availableCashTotal)) +
      metric('可能接股 / 額度占用', fmt(a.deliveryHoldTotal)) +
      metric('Bank-t 可用', fmt(a.cash['Bank-t'] || 0)) +
      metric('Bank-w 可用', fmt(a.cash['Bank-w'] || 0)) +
      `<p class="note">到期 FCN 若有破下限、接股或 Critical/near_KI 訊號，不納入可配置現金；該銀行先視為額度被占用。</p>`;
    const merged = { ...a.cash };
    Object.entries(a.deliveryHold).forEach(([k,v]) => { merged[`${k} 接股占用`] = v; });
    const max = Math.max(...Object.values(merged), 1);
    $('cashBankBars').innerHTML = Object.entries(merged).map(([k,v]) => bar(k, v, max, k.includes('接股') ? 'bad' : '')).join('') || '<p class="note">目前沒有偵測到 30 天內回收單。</p>';
    $('cashTimeline').innerHTML = a.exitRows.slice(0,10).map(r => bar(`${r.id}｜${r.daysToMaturity ?? '--'}d${r.stockDeliveryRisk ? '｜接股風險' : ''}`, r.displayAmount, max, r.stockDeliveryRisk ? 'bad' : r.daysToMaturity !== null && r.daysToMaturity < 10 ? 'warn' : '')).join('') || '<p class="note">沒有可顯示的時間軸。</p>';
  }

  function renderBase(a) {
    const excludedPct = a.total ? a.excludedTotal / a.total * 100 : 0;
    $('baseSummary').innerHTML = `<h3>扣除後母體</h3>` +
      metric('原始總額', fmt(a.total)) + metric('排除金額', fmt(a.excludedTotal)) + metric('其中接股占用', fmt(a.deliveryHoldTotal)) + metric('分析母體', fmt(a.baseTotal)) + metric('排除比例', pct(excludedPct)) +
      `<p class="note">只用分析母體判斷未來一個月風險；接股占用不視為新單現金。</p>`;
    $('baseDonut').style.background = `conic-gradient(#2f80ed 0 ${100-excludedPct}%, #f4a261 ${100-excludedPct}% 100%)`;
    $('baseDonutText').innerHTML = `保留 ${pct(100-excludedPct)} / 排除 ${pct(excludedPct)}；接股占用 ${fmt(a.deliveryHoldTotal)}`;
    const entries = Object.entries(a.worstBars).sort((x,y)=>y[1]-x[1]).slice(0,8);
    const max = Math.max(...entries.map(x=>x[1]),1);
    $('worstOfBars').innerHTML = entries.map(([k,v]) => bar(k, v, max, v/a.baseTotal*100>25?'bad':'' )).join('') || '<p class="note">尚無 worst-of 資料。</p>';
  }

  function renderMix(a) {
    const sorted = Object.entries(a.mix).sort((x,y)=>Math.abs(y[1].gapPct)-Math.abs(x[1].gapPct));
    const mostNeed = sorted.find(([_,m]) => m.gapPct > 0)?.[1]?.label || '暫無明顯缺口';
    const over = sorted.find(([_,m]) => m.gapPct < -3)?.[1]?.label || '暫無明顯過多';
    $('mixSummary').innerHTML = `<h3>收益配置摘要</h3>` + metric('最需要補', mostNeed) + metric('目前過多', over) + metric('母體總額', fmt(a.baseTotal)) + `<p class="note">收益配置用 rate / tenor；風險健檢不用 rate。</p>`;
    $('mixBars').innerHTML = Object.entries(a.mix).map(([k,m]) => {
      const cls = m.gapPct < -5 ? 'bad' : m.gapPct > 5 ? 'warn' : '';
      return `<div class="bar-row"><span>${m.label}<br><small>目標 ${m.target}% / 現況 ${pct(m.pct)}</small></span><div class="bar-bg"><div class="bar-fill ${cls}" style="width:${Math.max(2,Math.min(100,m.pct))}%"></div></div><b>${m.gapAmount>=0?'+':''}${fmt(m.gapAmount)}</b></div>`;
    }).join('');
  }

  function renderHealth(a) {
    const scoreBuckets = { '7.5+ Healthy':0, '6.5-7.5 Watch':0, '5.5-6.5 Caution':0, '<5.5 High':0 };
    a.baseRows.forEach(r => { if (r.basketScore>=7.5) scoreBuckets['7.5+ Healthy']++; else if (r.basketScore>=6.5) scoreBuckets['6.5-7.5 Watch']++; else if (r.basketScore>=5.5) scoreBuckets['5.5-6.5 Caution']++; else scoreBuckets['<5.5 High']++; });
    const maxScore = Math.max(...Object.values(scoreBuckets),1);
    $('scoreBars').innerHTML = Object.entries(scoreBuckets).map(([k,v])=>bar(k,v,maxScore,k.includes('<')?'bad':k.includes('Caution')?'warn':'' )).join('');
    const flags = Object.entries(a.flagCounts).sort((x,y)=>y[1]-x[1]);
    const maxFlag = Math.max(...flags.map(x=>x[1]),1);
    $('flagBars').innerHTML = flags.map(([k,v])=>bar(k,v,maxFlag,k.includes('near')||k.includes('weak')?'bad':'warn')).join('') || '<p class="note">未偵測到重大 danger flag。</p>';
    $('healthRows').innerHTML = a.baseRows.map(r => `<tr><td>${r.id}</td><td>${r.bank}</td><td>${r.symbols.join('+') || '--'}</td><td><b>${r.worst}</b></td><td>${r.basketScore.toFixed(2)}</td><td><span class="pill ${pillForRisk(r.risk)}">${r.risk}</span></td><td>${r.flags.join(', ') || 'none'}</td><td>${r.action}</td></tr>`).join('') || '<tr><td colspan="8">尚無分析母體資料</td></tr>';
  }

  function renderPlan(a, cfg) {
    const budget = cfg?.new_allocation_budget?.by_bank_display || { 'Bank-t':90000, 'Bank-w':50000 };
    const effectiveBudget = Object.fromEntries(Object.entries(budget).map(([bank, amt]) => [bank, Math.max(0, amt - (a.deliveryHold[bank] || 0))]));
    const needs = Object.entries(a.mix).sort((x,y)=>y[1].gapPct-x[1].gapPct).filter(([_,m])=>m.gapPct>0);
    const blocked = a.baseRows.concat(a.deliveryRows).filter(r => ['Critical','High Risk'].includes(r.risk) || r.stockDeliveryRisk).map(r => r.worst).filter(Boolean);
    const blockedUnique = [...new Set(blocked)].slice(0,6);
    const bankWNote = effectiveBudget['Bank-w'] > 0 && effectiveBudget['Bank-w'] < MIN_TICKET['Bank-w'] ? '低於永豐最低 30,000，不建議硬做或轉資。' : '滿足永豐最低 30,000 才規劃新單。';
    const bankTNote = effectiveBudget['Bank-t'] > 0 && effectiveBudget['Bank-t'] < MIN_TICKET['Bank-t'] ? '低於富邦最低 10,000，不建議硬做或轉資。' : '滿足富邦最低 10,000 才規劃新單。';
    const transferNote = `跨銀行轉資成本約 ${TRANSFER_FEE_USD} USD；除非能滿足最低投資門檻且配置缺口明確，否則不建議隨意轉移。`;
    const cards = [
      ['Bank-t 可規劃', fmt(effectiveBudget['Bank-t']||0), `原額度 ${fmt(budget['Bank-t']||0)}，扣除接股占用 ${fmt(a.deliveryHold['Bank-t']||0)}。${bankTNote}`],
      ['Bank-w 可規劃', fmt(effectiveBudget['Bank-w']||0), `原額度 ${fmt(budget['Bank-w']||0)}，扣除接股占用 ${fmt(a.deliveryHold['Bank-w']||0)}。${bankWNote}`],
      ['優先補足', needs[0]?.[1]?.label || '暫無明顯缺口', '依收益配置缺口排序，但必須先通過持股健檢。'],
      ['避免加碼', blockedUnique.join(', ') || '暫無', `High Risk / Critical / 接股風險的 worst-of 暫停新增。${transferNote}`]
    ];
    $('recommendCards').innerHTML = cards.map(([h,v,d])=>`<div class="rec-card"><h4>${h}</h4><div class="kpi"><div class="v">${v}</div><div class="d">${d}</div></div></div>`).join('');
    const max = Math.max(...Object.values(budget),1);
    const planRows = Object.entries(budget).flatMap(([bank, amt]) => [[`${bank} 原配置`, amt, ''], [`${bank} 接股占用`, a.deliveryHold[bank] || 0, 'bad'], [`${bank} 可規劃`, effectiveBudget[bank] || 0, (effectiveBudget[bank] || 0) < (MIN_TICKET[bank] || 0) && (effectiveBudget[bank] || 0) > 0 ? 'warn' : '']]);
    $('bankPlanBars').innerHTML = planRows.map(([k,v,c])=>bar(k,v,max,c)).join('');
  }

  function wireButtons() {
    $('expandAll').onclick = () => document.querySelectorAll('.planner-section').forEach(d => d.open = true);
    $('collapseAll').onclick = () => document.querySelectorAll('.planner-section').forEach(d => d.open = false);
    $('showRiskOnly').onclick = () => document.querySelectorAll('.planner-section').forEach(d => d.open = d.classList.contains('risk-section'));
    $('resetView').onclick = () => document.querySelectorAll('.planner-section').forEach(d => d.open = ['cash','base','mix','health','plan'].includes(d.id));
    document.querySelectorAll('.nav-item').forEach(n => n.onclick = () => $(n.dataset.target)?.scrollIntoView({ behavior:'smooth', block:'start' }));
  }

  function renderNotes(rows, cfg) {
    $('dataNotes').innerHTML = `讀取 FCN 筆數：${rows.length}<br>資安：${cfg?.security_mode?.amount_note || 'display_amount = real_amount / 10'}<br>銀行最低投資：Bank-w 30,000、Bank-t 10,000；跨銀行轉資估計 ${TRANSFER_FEE_USD} USD。<br>限制：若原始資料缺少 KI / strike / worst_of，系統會用 basket 內最低 stock score 估算 worst-of；接股風險以資料標記、狀態文字、KI 與 basket score 做保守判斷。`;
  }

  async function init() {
    wireButtons();
    const [cfg, p1, p2, m1, m7, opt] = await Promise.all([
      loadJson(CONFIG_URL, {}), loadJson(FCN_URLS[0], []), loadJson(FCN_URLS[1], []), loadJson(M1_URL, {}), loadJson(M7_URL, {}), loadJson(OPTION_URL, {})
    ]);
    const rows = normalizeRows(p1).length ? normalizeRows(p1) : normalizeRows(p2);
    const analysis = analyze(rows, m1, m7, opt);
    renderKpis(analysis, cfg); renderCash(analysis); renderBase(analysis); renderMix(analysis); renderHealth(analysis); renderPlan(analysis, cfg); renderNotes(rows, cfg);
  }

  document.addEventListener('DOMContentLoaded', init);
})();
