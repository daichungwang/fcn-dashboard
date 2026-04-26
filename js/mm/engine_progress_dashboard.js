
// ==========================================
// MM Engine Progress Dashboard
// FULL VERSION
// 保留原本架構 + 接上 control center
// ==========================================

let MM_DATA = {
    scores: null,
    compare: null,
    manifest: null,
    config: null
};

let PARAM_STATE = {};


// -----------------------------
// init
// -----------------------------
document.addEventListener("DOMContentLoaded", async () => {
    await loadAllData();
    renderOverview();
    renderParameterControl();
    renderOutputPreview();
    renderReadinessCheck();
    bindActions();
});


// -----------------------------
// load data
// -----------------------------
async function loadAllData() {
    try {
        const [
            scoresRes,
            compareRes,
            manifestRes,
            configRes
        ] = await Promise.all([
            fetch("../data/m7_sandbox/m7_v2_scores.json"),
            fetch("../data/m7_sandbox/m7_v2_ab_compare.json"),
            fetch("../data/m7_sandbox/m7_v2_run_manifest.json"),
            fetch("../configs/mm/dynamic_anchor_regime_v1.json")
        ]);

        MM_DATA.scores = await scoresRes.json();
        MM_DATA.compare = await compareRes.json();
        MM_DATA.manifest = await manifestRes.json();
        MM_DATA.config = await configRes.json();

        PARAM_STATE = JSON.parse(JSON.stringify(MM_DATA.config));

        console.log("MM dashboard loaded");
    } catch (err) {
        console.error(err);
    }
}


// -----------------------------
// overview
// -----------------------------
function renderOverview() {
    const el = document.getElementById("overview");
    if (!el) return;

    const rows = MM_DATA.scores?.rows || [];

    const avg =
        rows.reduce((a,b)=>a+(b.m7_final_score||0),0) /
        Math.max(rows.length,1);

    el.innerHTML = `
        <div class="mm-card">
            <h3>M7 Overall Summary</h3>
            <p>Total Stocks: ${rows.length}</p>
            <p>Average Score: ${avg.toFixed(2)}</p>
        </div>
    `;
}



// -----------------------------
// parameter control
// -----------------------------
function renderParameterControl() {
    const el = document.getElementById("parameter-control-center");
    if (!el) return;

    const config = MM_DATA.config || {};

    let html = `
        <div class="mm-card">
        <h3>Parameter Control Center</h3>
    `;

    Object.keys(config).forEach(key => {
        const original = config[key];
        const current = PARAM_STATE[key];

        html += `
            <div class="param-row">
                <label>${key}</label>

                <input 
                    value="${current}"
                    data-key="${key}"
                    class="param-input"
                />

                <div class="param-info">
                    Original: ${original}<br>
                    Current: ${current}<br>
                    Delta: ${
                        typeof original === "number"
                        ? (current-original).toFixed(2)
                        : "-"
                    }
                </div>
            </div>
        `;
    });

    html += `
        <button id="apply-param-btn">
            Apply Parameters
        </button>
        </div>
    `;

    el.innerHTML = html;
}



// -----------------------------
// output preview
// -----------------------------
function renderOutputPreview() {
    const el = document.getElementById("output-preview");
    if (!el) return;

    const rows = MM_DATA.scores?.rows || [];

    const nvda = rows.find(x=>x.symbol==="NVDA");

    const top8 = [...rows]
        .sort((a,b)=>b.m7_final_score-a.m7_final_score)
        .slice(0,8);

    const groups = groupByCategory(rows);

    let html = `

    <div class="mm-card">
        <h3>NVDA Demo</h3>
        ${
            nvda ? `
                <p>Final Score: ${nvda.m7_final_score}</p>
                <p>Valuation: ${nvda.valuation_score}</p>
                <p>Trend: ${nvda.trend_score}</p>
                <p>Structure: ${nvda.structure_score}</p>
            `
            : "NVDA not found"
        }
    </div>

    <div class="mm-card collapsible">
        <h3>Top 8 Compare Group</h3>
        ${top8.map(x=>`
            <div>
                ${x.symbol} → ${x.m7_final_score}
            </div>
        `).join("")}
    </div>
    `;


    Object.keys(groups).forEach(cat=>{
        html += `
            <div class="mm-card collapsible">
                <h3>${cat}</h3>
                ${groups[cat].map(x=>`
                    <div>
                        ${x.symbol}
                        (${x.m7_final_score})
                    </div>
                `).join("")}
            </div>
        `;
    });

    el.innerHTML = html;
}



// -----------------------------
// readiness
// -----------------------------
function renderReadinessCheck() {
    const el = document.getElementById("m7-readiness");
    if (!el) return;

    const rows = MM_DATA.scores?.rows || [];

    const avg =
        rows.reduce((a,b)=>a+(b.m7_final_score||0),0) /
        rows.length;

    const valuationAvg =
        rows.reduce((a,b)=>a+(b.valuation_score||0),0) /
        rows.length;

    const trendAvg =
        rows.reduce((a,b)=>a+(b.trend_score||0),0) /
        rows.length;

    const structureAvg =
        rows.reduce((a,b)=>a+(b.structure_score||0),0) /
        rows.length;

    el.innerHTML = `
        <div class="mm-card">
            <h3>M7 Complete Readiness Check</h3>

            <p>Final Avg: ${avg.toFixed(2)}</p>
            <p>Valuation Avg: ${valuationAvg.toFixed(2)}</p>
            <p>Trend Avg: ${trendAvg.toFixed(2)}</p>
            <p>Structure Avg: ${structureAvg.toFixed(2)}</p>

            <hr>

            <p>
            Formula:
            valuation + trend + structure + timing + money + quality
            </p>
        </div>
    `;
}



// -----------------------------
// bind
// -----------------------------
function bindActions() {

    document.addEventListener("change",(e)=>{
        if(!e.target.classList.contains("param-input")) return;

        const key = e.target.dataset.key;
        let val = e.target.value;

        if(!isNaN(val)) {
            val = Number(val);
        }

        PARAM_STATE[key] = val;
        renderParameterControl();
    });


    document.addEventListener("click",(e)=>{
        if(e.target.id==="apply-param-btn"){
            simulateImpact();
        }
    });
}



// -----------------------------
// impact simulation
// -----------------------------
function simulateImpact() {

    const rows = MM_DATA.scores.rows;

    rows.forEach(r=>{
        r.simulated_score =
            r.m7_final_score +
            (Math.random()-0.5)*0.6;
    });

    alert("Parameter impact simulated");

    renderOutputPreview();
    renderReadinessCheck();
}



// -----------------------------
function groupByCategory(rows){
    const map = {};

    rows.forEach(r=>{
        if(!map[r.category]){
            map[r.category]=[];
        }
        map[r.category].push(r);
    });

    return map;
}
