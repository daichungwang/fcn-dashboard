/* ==========================================
   振宇 FCN 系統 main.js V8（模組化架構）
========================================== */

import { initModule3 } from "./modules/module3_decision.js";

// ------------------------------------------
// 初始化（總開關）
// ------------------------------------------
document.addEventListener("DOMContentLoaded", () => {
  console.log("🚀 FCN 系統啟動");

  initModule3();
});
