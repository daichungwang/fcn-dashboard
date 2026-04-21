// ==========================================
// M1 Competition Engine V4
// 輸出格式直接對口 m1_new_stock.html
// ==========================================

// ---------- 工具 ----------
function safe(v, d = "") {
  return v === undefined || v === null ? d : v;
}

function n(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function pctText(v) {
  const x = Number(v);
  if (!Number.isFinite(x)) return "--";
  return `${x >= 0 ? "+" : ""}${x.toFixed(1)}%`;
}

// ---------- 公司做什麼 ----------
function buildBusinessSummary(stock) {
  const sector = (stock.sector || "").toUpperCase();
  const symbol = (stock.symbol || "").toUpperCase();

  const manualMap = {
    ETN: "Eaton 是全球電力管理公司，主要提供配電設備、電源管理、工業電氣元件與資料中心相關電力基礎建設方案。",
    NVDA: "NVIDIA 主要提供 GPU、AI 加速器與資料中心運算平台，是 AI 基礎建設核心供應商。",
    AVGO: "Broadcom 主要提供半導體與基礎設施軟體，涵蓋網通、AI、客製化晶片與企業軟體。",
    ORCL: "Oracle 主要提供資料庫、雲端基礎設施與企業軟體服務，是企業 IT 與資料中心的重要供應商。",
    COIN: "Coinbase 是美國主要加密資產交易平台，收入與加密市場交易活躍度高度相關。",
    PLD: "Prologis 是全球大型物流地產 REIT，核心資產為倉儲、物流中心與供應鏈基礎設施。",
    TSM: "台積電是全球最大晶圓代工公司，提供先進製程與封裝技術，是 AI 與高效能運算晶片的核心製造夥伴。",
    MSFT: "Microsoft 主要提供作業系統、企業軟體、雲端平台 Azure 與 AI 服務，是全球企業數位化的重要平台。",
    AMD: "AMD 主要提供 CPU、GPU 與資料中心加速器，是高效能運算與 AI 晶片的重要參與者。",
    MU: "Micron 主要提供 DRAM、NAND 與高頻寬記憶體，是 AI 伺服器與資料中心關鍵記憶體供應商."
  };

  if (manualMap[symbol]) return manualMap[symbol];

  if (
    sector.includes("SEMI") ||
    sector.includes("FOUNDRY") ||
    sector.includes("AI_SEMI") ||
    sector.includes("CHIP")
  ) {
    return "公司屬半導體產業，主要提供晶片設計、晶圓製造、平台技術或關鍵零組件，通常受惠於 AI、高效能運算與電子化趨勢。";
  }

  if (
    sector.includes("TECH") ||
    sector.includes("CLOUD") ||
    sector.includes("SOFTWARE") ||
    sector.includes("PLATFORM")
  ) {
    return "公司屬科技平台或企業軟體領域，主要提供雲端、平台、生態系或數位化服務。";
  }

  if (sector.includes("INDUSTRIAL") || sector.includes("POWER") || sector.includes("ELECTRICAL")) {
    return "公司屬工業 / 電氣設備領域，主要提供企業與基礎建設客戶所需的硬體、系統整合與工業解決方案。";
  }

  if (sector.includes("REIT") || sector.includes("REAL ESTATE")) {
    return "公司屬不動產投資信託，主要以資產出租與租金現金流為核心。";
  }

  if (sector.includes("CRYPTO") || sector.includes("EXCHANGE")) {
    return "公司屬數位資產 / 交易平台領域，主要收入來自交易活動、資產託管與相關金融服務。";
  }

  return "公司屬特定產業龍頭或重要參與者，具備一定市場地位與長期投資觀察價值。";
}

// ---------- 公司在產業的位置 ----------
function buildCompanyPositioning(stock) {
  const sector = (stock.sector || "").toUpperCase();
  const cat = (stock.category || "").toLowerCase();

  if (sector.includes("FOUNDRY")) {
    return "位於半導體供應鏈製造核心位置，屬高技術與高資本門檻產業，對 AI、HPC 與先進晶片供應至關重要。";
  }

  if (
    sector.includes("SEMI") ||
    sector.includes("AI_SEMI") ||
    sector.includes("CHIP")
  ) {
    return "位於半導體產業鏈核心，通常扮演高技術門檻的設計、平台或關鍵零組件角色。";
  }

  if (
    sector.includes("TECH") ||
    sector.includes("CLOUD") ||
    sector.includes("SOFTWARE") ||
    sector.includes("PLATFORM")
  ) {
    return "位於企業數位化、雲端或平台經濟核心位置，依靠產品整合與客戶黏著度成長。";
  }

  if (sector.includes("INDUSTRIAL") || sector.includes("POWER") || sector.includes("ELECTRICAL")) {
    return "位於電力管理 / 工業電氣 / 基礎建設供應鏈核心位置，受惠於電氣化、AI 資料中心與能源轉型趨勢。";
  }

  if (sector.includes("REIT") || sector.includes("REAL ESTATE")) {
    return "位於實體資產與租金現金流產業鏈中，通常受利率與資本支出循環影響。";
  }

  if (cat.includes("core")) {
    return "屬於核心型標的，在其產業中具備穩定競爭地位與長期配置價值。";
  }

  return "位於所屬產業的重要位置，但仍需搭配景氣、估值與技術面判斷。";
}

// ---------- 為什麼進 M1 ----------
function buildWhyInM1(stock) {
  const cat = (stock.category || "").toLowerCase();
  const score = n(stock.m1_score, 0);

  if (cat.includes("core")) {
    return `因為公司體質穩定、產業趨勢清楚、適合長期配置，且 M1 score = ${score.toFixed(2)}，屬於核心觀察名單。`;
  }
  if (cat.includes("growth")) {
    return `因為公司具成長題材與產業爆發力，且 M1 score = ${score.toFixed(2)}，適合作為成長型觀察股。`;
  }
  if (cat.includes("defensive")) {
    return `因為公司現金流或商業模式相對穩定，且 M1 score = ${score.toFixed(2)}，適合作為防禦型配置。`;
  }
  if (cat.includes("income")) {
    return `因為公司具穩定收益或現金流特性，且 M1 score = ${score.toFixed(2)}，適合作為收益型觀察標的。`;
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
  if (cat.includes("income")) {
    return "這是一檔偏收益型標的，重點在穩定性與現金流，不是追求最高成長。";
  }

  return "這檔股票可以看，但一定要搭配估值與時機，不是看到題材就追。";
}

// ---------- M1 定位（星等） ----------
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
  } else if (cat.includes("income")) {
    capex = "⭐⭐⭐";
    trend = "⭐⭐⭐";
    competition = "⭐⭐⭐";
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

// ---------- M1 分數（數字） ----------
function buildM1Scores(stock) {
  const cat = (stock.category || "").toLowerCase();
  const m1Score = n(stock.m1_score, 7.0);

  let capex = 7.0;
  let trend = 7.0;
  let competition = 7.0;

  if (cat.includes("core")) {
    capex = Math.min(9.5, Math.max(8.2, m1Score + 0.3));
    trend = Math.min(9.6, Math.max(8.2, m1Score + 0.4));
    competition = Math.min(9.2, Math.max(7.8, m1Score - 0.1));
  } else if (cat.includes("growth")) {
    capex = Math.min(8.8, Math.max(7.2, m1Score - 0.1));
    trend = Math.min(9.4, Math.max(8.0, m1Score + 0.3));
    competition = Math.min(8.4, Math.max(6.8, m1Score - 0.5));
  } else if (cat.includes("defensive")) {
    capex = Math.min(8.7, Math.max(7.2, m1Score + 0.1));
    trend = Math.min(7.8, Math.max(6.2, m1Score - 0.6));
    competition = Math.min(8.8, Math.max(7.2, m1Score + 0.2));
  } else {
    capex = Math.min(8.0, Math.max(6.0, m1Score));
    trend = Math.min(8.0, Math.max(6.0, m1Score));
    competition = Math.min(8.0, Math.max(6.0, m1Score));
  }

  return {
    capex: Number(capex.toFixed(1)),
    trend: Number(trend.toFixed(1)),
    competition: Number(competition.toFixed(1)),
    valuation_detail: "FPE -- / Anchor -- / PEG --",
    capex_comment: "高資本效率，具長期競爭優勢",
    trend_comment: "產業動能強，屬結構性成長",
    competition_comment: "具護城河，但仍有競爭壓力",
    valuation_comment: "市場預期已高，需留意回檔風險"
  };
}

// ---------- 競爭對手 ----------
function buildCompetitors(stock) {
  const sector = (stock.sector || "").toUpperCase();
  const symbol = (stock.symbol || "").toUpperCase();

  if (symbol === "ORCL") {
    return {
      direct: ["Microsoft", "Amazon", "Google", "Salesforce"],
      indirect: ["IBM", "SAP", "Snowflake"]
    };
  }

  if (symbol === "TSM") {
    return {
      direct: ["Samsung", "Intel Foundry"],
      indirect: ["GlobalFoundries", "UMC", "SMIC"]
    };
  }

  if (symbol === "NVDA") {
    return {
      direct: ["AMD", "Intel", "Broadcom"],
      indirect: ["TSMC", "Arm", "custom AI chip vendors"]
    };
  }

  if (symbol === "COIN") {
    return {
      direct: ["Robinhood", "Kraken", "Binance"],
      indirect: ["PayPal", "Block", "traditional brokers entering crypto"]
    };
  }

  if (sector.includes("INDUSTRIAL") || sector.includes("POWER") || sector.includes("ELECTRICAL")) {
    return {
      direct: ["Schneider Electric", "Siemens", "ABB", "Rockwell Automation"],
      indirect: ["GE Vernova", "Honeywell", "Vertiv", "Emerson Electric"]
    };
  }

  if (
    sector.includes("SEMI") ||
    sector.includes("FOUNDRY") ||
    sector.includes("AI_SEMI") ||
    sector.includes("CHIP")
  ) {
    return {
      direct: ["AMD", "AVGO", "MRVL", "INTC"],
      indirect: ["TSM", "ARM", "QCOM"]
    };
  }

  if (
    sector.includes("TECH") ||
    sector.includes("CLOUD") ||
    sector.includes("SOFTWARE") ||
    sector.includes("PLATFORM")
  ) {
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

  if (sector.includes("INDUSTRIAL") || sector.includes("POWER")) {
    return "產品整合能力、全球客戶基礎、長期專案訂單與高切換成本，形成穩定護城河。";
  }
  if (
    sector.includes("SEMI") ||
    sector.includes("FOUNDRY") ||
    sector.includes("AI_SEMI")
  ) {
    return "技術門檻高、產品迭代快、研發與資本支出密集，使後進者難以快速追上。";
  }
  if (
    sector.includes("TECH") ||
    sector.includes("CLOUD") ||
    sector.includes("SOFTWARE")
  ) {
    return "平台、生態系與資料 / 客戶黏著度形成高切換成本。";
  }
  if (sector.includes("REIT")) {
    return "資產規模、地段品質與租戶網路形成長期競爭優勢。";
  }
  return "具一定規模、產品或客戶基礎優勢。";
}

// ---------- 贏的原因 ----------
function buildWhyWin(stock) {
  const sector = (stock.sector || "").toUpperCase();
  const symbol = (stock.symbol || "").toUpperCase();

  if (symbol === "ORCL") {
    return [
      "企業級客戶基礎深厚",
      "資料庫與關鍵系統切換成本高",
      "AI 基建與雲端需求可能帶來估值重評"
    ];
  }

  if (symbol === "TSM") {
    return [
      "先進製程領先",
      "客戶驗證門檻高",
      "AI 與 HPC 晶片需求長期支撐"
    ];
  }

  if (symbol === "NVDA") {
    return [
      "AI 需求強勁且龍頭優勢明顯",
      "硬體 + 軟體平台整合能力強",
      "高毛利與高獲利能力支撐估值"
    ];
  }

  if (sector.includes("INDUSTRIAL")) {
    return [
      "受惠 AI 資料中心與電力基建需求",
      "電氣化與能源轉型趨勢明確",
      "專案導向與客戶黏著度高"
    ];
  }

  if (
    sector.includes("SEMI") ||
    sector.includes("FOUNDRY") ||
    sector.includes("AI_SEMI")
  ) {
    return [
      "AI / 高效能運算需求支撐",
      "技術門檻高",
      "產業集中度高，龍頭優勢明顯"
    ];
  }

  if (
    sector.includes("TECH") ||
    sector.includes("CLOUD") ||
    sector.includes("SOFTWARE")
  ) {
    return [
      "雲端 / 平台化趨勢長期存在",
      "客戶續約與生態系優勢",
      "企業數位化需求穩定"
    ];
  }

  return [
    "具一定產業地位",
    "受惠長期趨勢"
  ];
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

  if (sector.includes("INDUSTRIAL") || sector.includes("POWER")) {
    return "寡占 + 高技術門檻 + 專案導向產業，龍頭通常同時具規模與交期優勢。";
  }
  if (
    sector.includes("SEMI") ||
    sector.includes("FOUNDRY") ||
    sector.includes("AI_SEMI")
  ) {
    return "全球寡占結構明顯，技術、客戶驗證與資本門檻都很高。";
  }
  if (
    sector.includes("TECH") ||
    sector.includes("CLOUD") ||
    sector.includes("SOFTWARE")
  ) {
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

  if (sector.includes("INDUSTRIAL") || sector.includes("POWER")) {
    return "短期受 AI 電力基建帶動需求強，中期競爭會加劇，但龍頭集中度通常更高。";
  }
  if (
    sector.includes("SEMI") ||
    sector.includes("FOUNDRY") ||
    sector.includes("AI_SEMI")
  ) {
    return "短期 AI 熱潮支撐需求，中期將進入技術與供應鏈整合競爭。";
  }
  if (
    sector.includes("TECH") ||
    sector.includes("CLOUD") ||
    sector.includes("SOFTWARE")
  ) {
    return "短期看雲端 / AI 導入，中期看平台整合與企業客戶留存。";
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

// ---------- 完成度 ----------
function buildResearchStatus() {
  return {
    basic_info_done: true,
    competition_done: true,
    technical_done: false,
    fcn_view_done: false,
    final_verdict_done: true
  };
}

function buildCoverageScore(status) {
  let score = 0;
  if (status.basic_info_done) score += 20;
  if (status.competition_done) score += 20;
  if (status.technical_done) score += 20;
  if (status.fcn_view_done) score += 20;
  if (status.final_verdict_done) score += 20;
  return score;
}

// ---------- 主卡 ----------
function buildCompetitionCard(stock) {
  const competitors = buildCompetitors(stock);
  const m1Positioning = buildM1Positioning(stock);
  const m1Scores = buildM1Scores(stock);
  const researchStatus = buildResearchStatus();
  const coverageScore = buildCoverageScore(researchStatus);

  return {
    symbol: safe(stock.symbol),
    company_name: safe(stock.name),

    basic_info: {
      business_summary: buildBusinessSummary(stock),
      company_positioning: buildCompanyPositioning(stock),
      why_in_m1: buildWhyInM1(stock),
      initial_pool30_view: buildHumanSummary(stock)
    },

    competition: {
      competitive_position: buildCompanyPositioning(stock),
      direct_competitors: competitors.direct,
      indirect_competitors: competitors.indirect,
      moat_summary: buildMoat(stock),
      why_it_wins: buildWhyWin(stock),
      why_it_can_lose: buildWhyLose(stock),
      industry_structure: buildIndustryStructure(stock),
      competition_trend_1y_3y: buildCompetitionTrend(stock)
    },

    m1_positioning: m1Positioning,
    m1_scores: m1Scores,

    investment_view: {
      human_summary: buildHumanSummary(stock),
      action_hint: buildActionHint(stock),
      fcn_view: buildFCNView(stock),
      final_verdict: buildFinalVerdict(stock)
    },

    // 保留 template，讓你舊資料邏輯也可相容
    template: {
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
      m1_positioning: m1Positioning,
      action_hint: buildActionHint(stock),
      fcn_view: buildFCNView(stock),
      final_verdict: buildFinalVerdict(stock),
      updated_at: new Date().toISOString().slice(0, 10)
    },

    research_status: researchStatus,
    coverage_score: coverageScore,
    updated_at: new Date().toISOString().slice(0, 10)
  };
}

// ---------- 批次 ----------
function enrichPoolWithCompetition(pool) {
  return pool.map(stock => buildCompetitionCard(stock));
}

// ---------- export ----------
const M1CompetitionEngine = {
  buildCompetitionCard,
  enrichPoolWithCompetition
};

// 👉 Node 環境
if (typeof module !== "undefined" && module.exports) {
  module.exports = M1CompetitionEngine;
}

// 👉 Browser 環境
if (typeof window !== "undefined") {
  window.M1CompetitionEngine = M1CompetitionEngine;
}
