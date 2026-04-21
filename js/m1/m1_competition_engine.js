// ==========================================
// M1 Competition Engine V3（整合版：公司定位 + 人話 + M1定位）
// ==========================================

// ---------- 工具 ----------
function safe(v, d = "") {
  return v === undefined || v === null ? d : v;
}

// ---------- 公司做什麼 ----------
function buildBusinessSummary(stock) {
  const sector = (stock.sector || "").toUpperCase();
  const symbol = (stock.symbol || "").toUpperCase();

  const manualMap = {
    ETN: "Eaton 是全球電力管理公司，主要提供配電設備、電源管理、工業電氣元件與資料中心相關電力基礎建設方案。",
    NVDA: "NVIDIA 主要提供 GPU、AI 加速器與資料中心運算平台，是 AI 基礎建設核心供應商。",
    AVGO: "Broadcom 主要提供半導體與基礎設施軟體，涵蓋網通、AI、客製化晶片與企業軟體。",
    ORCL: "Oracle 主要提供資料庫、雲端基礎設施與企業軟體服務，是企業IT與資料中心的重要供應商。",
    COIN: "Coinbase 是美國主要加密資產交易平台，收入與加密市場交易活躍度高度相關。",
    PLD: "Prologis 是全球大型物流地產 REIT，核心資產為倉儲、物流中心與供應鏈基礎設施。"
  };

  if (manualMap[symbol]) return manualMap[symbol];

  if (sector.includes("INDUSTRIAL")) {
    return "公司屬工業/電氣設備領域，主要提供企業與基礎建設客戶所需的硬體、系統整合與工業解決方案。";
  }
  if (sector.includes("SEMI")) {
    return "公司屬半導體產業，主要提供晶片設計、平台技術或上游關鍵零組件。";
  }
  if (sector.includes("TECH")) {
    return "公司屬科技平台或企業軟體領域，主要提供雲端、平台、生態系或數位化服務。";
  }
  if (sector.includes("REIT")) {
    return "公司屬不動產投資信託，主要以資產出租與租金現金流為核心。";
  }

  return "公司屬特定產業龍頭或重要參與者，具備一定市場地位與長期投資觀察價值。";
}

// ---------- 公司在產業的位置 ----------
function buildCompanyPositioning(stock) {
  const sector = (stock.sector || "").toUpperCase();
  const cat = (stock.category || "").toLowerCase();

  if (sector.includes("INDUSTRIAL")) {
    return "位於電力管理 / 工業電氣 / 基礎建設供應鏈核心位置，受惠於電氣化、AI資料中心與能源轉型趨勢。";
  }
  if (sector.includes("SEMI")) {
    return "位於半導體產業鏈核心，通常扮演高技術門檻的設計、平台或關鍵零組件角色。";
  }
  if (sector.includes("TECH")) {
    return "位於企業數位化、雲端或平台經濟核心位置，依靠產品整合與客戶黏著度成長。";
  }
  if (sector.includes("REIT")) {
    return "位於實體資產與租金現金流產業鏈中，通常受利率與資本支出循環影響。";
  }
  if (cat.includes("core")) {
    return "屬於核心型標的，在其產業中具備穩定競爭地位與長期配置價值。";
  }

  return "位於所屬產業的重要位置，但仍需搭配景氣、估值與技術面判斷。";
}

// ---------- 為什麼進M1 ----------
function buildWhyInM1(stock) {
  const cat = (stock.category || "").toLowerCase();
  const score = Number(stock.m1_score || 0);

  if (cat.includes("core")) {
    return `因為公司體質穩定、產業趨勢清楚、適合長期配置，且 M1 score = ${score.toFixed(2)}，屬於核心觀察名單。`;
  }
  if (cat.includes("growth")) {
    return `因為公司具成長題材與產業爆發力，且 M1 score = ${score.toFixed(2)}，適合作為成長型觀察股。`;
  }
  if (cat.includes("defensive")) {
    return `因為公司現金流或商業模式相對穩定，且 M1 score = ${score.toFixed(2)}，適合作為防禦型配置。`;
  }

  return `因為公司具備一定產業地位與投資價值，且 M1 score = ${score.toFixed(2)}。`;
}

// ---------- 人話摘要 ----------
function buildHumanSummary(stock) {
  const cat = (stock.category || "").toLowerCase();

  if (cat.includes("core")) {
    return "這是一檔長期趨勢明確、體質不錯的核心股，但重點不是能不能買，而是不能買太貴。";
  }
  if (cat.includes("growth")) {
    return "這是一檔有成長性的題材股，爆發力夠，但波動也大，適合看時機而不是無腦抱。";
  }
  if (cat.includes("defensive")) {
    return "這是一檔偏穩定型股票，適合防守配置，但通常不會是成長最快的那一群。";
  }

  return "這檔股票可以看，但一定要搭配估值與時機，不是看到題材就追。";
}

// ---------- M1定位 ----------
function buildM1Positioning(stock) {
  const cat = (stock.category || "").toLowerCase();

  let capex = "⭐⭐⭐";
  let trend = "⭐⭐⭐";
  let competition = "⭐⭐⭐";
  let valuation = "正常";

  if (cat.includes("core")) {
    capex = "⭐⭐⭐⭐⭐";
    trend = "⭐⭐⭐⭐⭐";
    competition = "⭐⭐⭐⭐";
    valuation = "⚠️偏高";
  } else if (cat.includes("growth")) {
    capex = "⭐⭐⭐⭐";
    trend = "⭐⭐⭐⭐⭐";
    competition = "⭐⭐⭐";
    valuation = "⚠️波動大";
  } else if (cat.includes("defensive")) {
    capex = "⭐⭐⭐⭐";
    trend = "⭐⭐⭐";
    competition = "⭐⭐⭐⭐";
    valuation = "合理";
  }

  return {
    capex_to_profit: capex,
    industry_trend: trend,
    competition_strength: competition,
    valuation_status: valuation,
    m1_tag: stock.category || "UNKNOWN"
  };
}

// ---------- 競爭對手 ----------
function buildCompetitors(stock) {
  const sector = (stock.sector || "").toUpperCase();

  if (sector.includes("INDUSTRIAL")) {
    return {
      direct: ["Schneider Electric", "Siemens", "ABB", "Rockwell Automation"],
      indirect: ["GE Vernova", "Honeywell", "Vertiv", "Emerson Electric"]
    };
  }
  if (sector.includes("SEMI")) {
    return {
      direct: ["AMD", "AVGO", "MRVL", "INTC"],
      indirect: ["TSM", "ARM", "QCOM"]
    };
  }
  if (sector.includes("TECH")) {
    return {
      direct: ["Microsoft", "Google", "Amazon"],
      indirect: ["Oracle", "Meta", "Salesforce"]
    };
  }
  if (sector.includes("REIT")) {
    return {
      direct: ["Prologis", "Equinix", "Digital Realty"],
      indirect: ["Public Storage", "Americold"]
    };
  }

  return {
    direct: [],
    indirect: []
  };
}

// ---------- 護城河 ----------
function buildMoat(stock) {
  const sector = (stock.sector || "").toUpperCase();

  if (sector.includes("INDUSTRIAL")) {
    return "產品整合能力、全球客戶基礎、長期專案訂單與高切換成本，形成穩定護城河。";
  }
  if (sector.includes("SEMI")) {
    return "技術門檻高、產品迭代快、研發資本密集，使後進者難以快速追上。";
  }
  if (sector.includes("TECH")) {
    return "平台、生態系與資料/客戶黏著度形成高切換成本。";
  }
  if (sector.includes("REIT")) {
    return "資產規模、地段品質與租戶網路形成長期競爭優勢。";
  }

  return "具一定規模、產品或客戶基礎優勢。";
}

// ---------- 贏的原因 ----------
function buildWhyWin(stock) {
  const sector = (stock.sector || "").toUpperCase();
  const res = [];

  if (sector.includes("INDUSTRIAL")) {
    res.push("受惠 AI 資料中心與電力基建需求");
    res.push("電氣化與能源轉型趨勢明確");
    res.push("專案導向與客戶黏著度高");
  } else if (sector.includes("SEMI")) {
    res.push("AI / 高效能運算需求支撐");
    res.push("技術門檻高");
    res.push("產業集中度高，龍頭優勢明顯");
  } else if (sector.includes("TECH")) {
    res.push("雲端/平台化趨勢長期存在");
    res.push("客戶續約與生態系優勢");
  } else if (sector.includes("REIT")) {
    res.push("核心資產稀缺");
    res.push("現金流穩定");
  } else {
    res.push("具一定產業地位");
    res.push("受惠長期趨勢");
  }

  return res;
}

// ---------- 輸的原因 ----------
function buildWhyLose(stock) {
  return [
    "估值過高時，容易先反映過頭",
    "景氣循環或資本支出放緩會影響成長",
    "競爭對手追趕可能壓縮優勢",
    "市場預期過高時，財報小失望也可能大修正"
  ];
}

// ---------- 產業結構 ----------
function buildIndustryStructure(stock) {
  const sector = (stock.sector || "").toUpperCase();

  if (sector.includes("INDUSTRIAL")) {
    return "寡占 + 高技術門檻 + 專案導向產業，龍頭通常同時具規模與交期優勢。";
  }
  if (sector.includes("SEMI")) {
    return "全球寡占結構明顯，技術、客戶驗證與資本門檻都很高。";
  }
  if (sector.includes("TECH")) {
    return "平台與生態系競爭明顯，贏家通常持續擴大市占。";
  }
  if (sector.includes("REIT")) {
    return "資產型產業，利率、出租率與資本成本是核心因素。";
  }

  return "競爭市場，但龍頭仍有規模優勢。";
}

// ---------- 競爭趨勢 ----------
function buildCompetitionTrend(stock) {
  const sector = (stock.sector || "").toUpperCase();

  if (sector.includes("INDUSTRIAL")) {
    return "短期受 AI 電力基建帶動需求強，中期競爭會加劇，但龍頭集中度通常更高。";
  }
  if (sector.includes("SEMI")) {
    return "短期 AI 熱潮支撐需求，中期將進入技術與供應鏈整合競爭。";
  }
  if (sector.includes("TECH")) {
    return "短期看雲端/AI導入，中期看平台整合與企業客戶留存。";
  }
  if (sector.includes("REIT")) {
    return "短期受利率波動影響，中期仍看資產品質與租金成長。";
  }

  return "短期有需求支撐，中期競爭仍會持續。";
}

// ---------- FCN view ----------
function buildFCNView(stock) {
  const cat = (stock.category || "").toLowerCase();

  if (cat.includes("core")) {
    return "屬高品質核心股，可納入 FCN，但不建議用太高 strike 去接貴股票。";
  }
  if (cat.includes("growth")) {
    return "可用來拉高 FCN 利率，但波動較大，權重要控制。";
  }
  if (cat.includes("defensive")) {
    return "適合當 FCN 防守型底倉。";
  }

  return "僅適合小比例觀察或特殊情境使用。";
}

// ---------- 行動建議 ----------
function buildActionHint(stock) {
  const cat = (stock.category || "").toLowerCase();

  if (cat.includes("core")) {
    return "可長期持有，回檔再看，不建議追高。";
  }
  if (cat.includes("growth")) {
    return "控制部位，以時機和風險管理為主。";
  }
  if (cat.includes("defensive")) {
    return "可穩定持有，適合防守配置。";
  }

  return "先觀察，再決定是否納入。";
}

// ---------- 最終結論 ----------
function buildFinalVerdict(stock) {
  const cat = (stock.category || "").toLowerCase();

  if (cat.includes("core")) {
    return "屬於可長期追蹤與配置的核心股，重點在估值與進場時機。";
  }
  if (cat.includes("growth")) {
    return "屬於高成長高波動股，適合做成長配置，但不能失去風險控管。";
  }
  if (cat.includes("defensive")) {
    return "屬於穩健配置股，適合作為組合中的防守與現金流穩定來源。";
  }

  return "有研究價值，但需要更看重時機與價格。";
}

// ---------- 主卡 ----------
function buildCompetitionCard(stock) {
  const competitors = buildCompetitors(stock);

  return {
    company_name: safe(stock.name),
    business_summary: buildBusinessSummary(stock),
    company_positioning: buildCompanyPositioning(stock),
    why_in_m1: buildWhyInM1(stock),

    competitive_position: buildCompanyPositioning(stock),
    direct_competitors: competitors.direct,
    indirect_competitors: competitors.indirect,
    moat_summary: buildMoat(stock),
    why_it_wins: buildWhyWin(stock),
    why_it_can_lose: buildWhyLose(stock),
    industry_structure: buildIndustryStructure(stock),
    competition_trend_1y_3y: buildCompetitionTrend(stock),

    human_summary: buildHumanSummary(stock),
    m1_positioning: buildM1Positioning(stock),
    action_hint: buildActionHint(stock),
    fcn_view: buildFCNView(stock),
    final_verdict: buildFinalVerdict(stock),

    updated_at: new Date().toISOString().slice(0, 10)
  };
}

// ---------- 批次 ----------
function enrichPoolWithCompetition(pool) {
  return pool.map(stock => ({
    ...stock,
    template: buildCompetitionCard(stock)
  }));
}

// ---------- export ----------
window.M1CompetitionEngine = {
  buildCompetitionCard,
  enrichPoolWithCompetition
};
