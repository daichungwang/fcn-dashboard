import { runM8Case } from "../core/m8_batch_engine.js";
import { renderResult, renderHistory, renderBasketCompare, fmt } from "./m8_ui.js";

const $ = id => document.getElementById(id);

// ===== storage =====
function getStore() {
  return JSON.parse(localStorage.getItem("fcn")||"[]");
}
function saveStore(d) {
  localStorage.setItem("fcn", JSON.stringify(d));
}

// ===== 工具 =====
function today() {
  return new Date().toISOString().slice(0,10);
}
function genNo(date) {
  const key="seq_"+date;
  let s=Number(localStorage.getItem(key)||0)+1;
  localStorage.setItem(key,s);
  return "FCN"+date.replaceAll("-","")+String(s).padStart(3,"0");
}

function normalize(sym){
  return [...sym].sort().join("|");
}

// ===== 主流程 =====
async function runCase() {

  const payload = {
    caseName: $("caseName").value,
    symbols: $("symbols").value.split(",").map(x=>x.trim()),
    KI: Number($("ki").value),
    Strike: Number($("strike").value),
    T: Number($("tenor").value),
    type: $("type").value,
    marketYield: Number($("marketYield").value)
  };

  const result = await runM8Case(payload);
  renderResult(result);

  const date = today();
  const no = genNo(date);

  const store = getStore();
  store.push({
    inquiry_no:no,
    date,
    basket: normalize(payload.symbols),
    input: payload,
    result
  });

  saveStore(store);
  renderAll();
}

// ===== render =====
function renderAll() {
  const data = getStore().slice().reverse();
  renderHistory(data);

  const sym = $("symbols").value.split(",");
  const key = normalize(sym);

  renderBasketCompare(
    data.filter(x=>x.basket===key)
  );
}

// ===== click =====
window.loadHistory = function(i){
  const d = getStore()[i];
  $("symbols").value = d.input.symbols.join(",");
  runCase();
}

// ===== init =====
document.addEventListener("DOMContentLoaded", () => {

  $("inquiryDate").value = today();
  $("inquiryNo").value = genNo(today());

  $("runBtn").onclick = runCase;

  $("inputMode").onchange = ()=>{
    $("singlePanel").style.display =
      $("inputMode").value==="single"?"block":"none";
    $("batchPanel").style.display =
      $("inputMode").value==="batch"?"block":"none";
  };

  renderAll();
});
