// ==========================================
// M7 Stock Profile（分類核心）
// ==========================================

export const STOCK_PROFILE = {

  // ===== AI 半導體（PEG）=====
  NVDA: { sector: "AI_SEMI", subsector: "GPU", category: "core", valuation_model: "PEG", allow_fcn: true },
  TSM:  { sector: "AI_SEMI", subsector: "FOUNDRY", category: "core", valuation_model: "PEG", allow_fcn: true },
  AVGO: { sector: "AI_SEMI", subsector: "ASIC", category: "core", valuation_model: "PEG", allow_fcn: true },
  AMAT: { sector: "AI_SEMI", subsector: "EQUIPMENT", category: "growth", valuation_model: "PEG", allow_fcn: true },
  MU:   { sector: "AI_SEMI", subsector: "MEMORY", category: "core", valuation_model: "PEG", allow_fcn: true },
  AMD:  { sector: "AI_SEMI", subsector: "CPU_GPU", category: "growth", valuation_model: "PEG", allow_fcn: true },
  MRVL: { sector: "AI_SEMI", subsector: "NETWORKING", category: "growth", valuation_model: "PEG", allow_fcn: true },

  CRDO: { sector: "AI_SEMI", subsector: "CONNECTIVITY", category: "speculative", valuation_model: "PEG", allow_fcn: false },
  ALAB: { sector: "AI_SEMI", subsector: "CONNECTIVITY", category: "speculative", valuation_model: "PEG", allow_fcn: false },

  // ===== AI 應用（NON PEG）=====
  MSFT: { sector: "AI_APPLICATION", subsector: "CLOUD_PLATFORM", category: "core", valuation_model: "NON_PEG", allow_fcn: true },
  GOOG: { sector: "AI_APPLICATION", subsector: "AI_CLOUD", category: "growth", valuation_model: "NON_PEG", allow_fcn: true },
  AMZN: { sector: "AI_APPLICATION", subsector: "CLOUD_COMMERCE", category: "core", valuation_model: "NON_PEG", allow_fcn: true },
  ORCL: { sector: "AI_APPLICATION", subsector: "ENTERPRISE_SOFTWARE", category: "growth", valuation_model: "NON_PEG", allow_fcn: true },
  PLTR: { sector: "AI_APPLICATION", subsector: "AI_SOFTWARE", category: "growth", valuation_model: "NON_PEG", allow_fcn: true },
  ARM:  { sector: "AI_APPLICATION", subsector: "AI_IP", category: "growth", valuation_model: "NON_PEG", allow_fcn: true },
  TSLA: { sector: "AI_APPLICATION", subsector: "AI_AUTO", category: "growth", valuation_model: "NON_PEG", allow_fcn: true },

  // ===== 平台 =====
  META: { sector: "PLATFORM", subsector: "SOCIAL_AD", category: "growth", valuation_model: "NON_PEG", allow_fcn: true },
  AAPL: { sector: "PLATFORM", subsector: "ECOSYSTEM", category: "core", valuation_model: "NON_PEG", allow_fcn: true },

  // ===== 傳產 =====
  COST: { sector: "CONSUMER", subsector: "RETAIL", category: "defensive", valuation_model: "PE", allow_fcn: true },
  TGT:  { sector: "CONSUMER", subsector: "RETAIL", category: "defensive", valuation_model: "PE", allow_fcn: true },
  EL:   { sector: "CONSUMER", subsector: "BEAUTY", category: "income", valuation_model: "PE", allow_fcn: true },

  // ===== 金融 =====
  COIN: { sector: "FINANCIAL", subsector: "CRYPTO_FINANCE", category: "speculative", valuation_model: "NON_PEG", allow_fcn: false },
  SOFI: { sector: "FINANCIAL", subsector: "FINTECH", category: "speculative", valuation_model: "NON_PEG", allow_fcn: false },

  // ===== 醫療 =====
  UNH:  { sector: "HEALTHCARE", subsector: "INSURANCE", category: "defensive", valuation_model: "PE", allow_fcn: true },

  // ===== 旅遊 =====
  CCL: { sector: "TRAVEL", subsector: "CRUISE", category: "income", valuation_model: "PE", allow_fcn: true },
  AAL: { sector: "TRAVEL", subsector: "AIRLINE", category: "income", valuation_model: "PE", allow_fcn: true },
  LVS: { sector: "TRAVEL", subsector: "CASINO", category: "defensive", valuation_model: "PE", allow_fcn: true },

  // ===== ETF =====
  SMH: { sector: "ETF", subsector: "SEMI", category: "defensive", valuation_model: "ETF", allow_fcn: true },
  QQQ: { sector: "ETF", subsector: "TECH", category: "defensive", valuation_model: "ETF", allow_fcn: true },
  LQD: { sector: "ETF", subsector: "BOND", category: "income", valuation_model: "ETF", allow_fcn: true }

};
