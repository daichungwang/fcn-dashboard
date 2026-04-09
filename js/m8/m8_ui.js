export function fmt(v) {
  return Number((Number(v)||0).toFixed(2));
}

export function renderResult(r) {
  document.getElementById("resultArea").innerHTML = `
    <h3>結果</h3>
    <table>
      <tr><th>Fair</th><td>${fmt(r.fair_yield)}</td></tr>
      <tr><th>Vol</th><td>${fmt(r.basket_vol)}</td></tr>
      <tr><th>VolAdj</th><td>${fmt(r.vol_adj)}</td></tr>
    </table>
  `;
}

export function renderHistory(data, onClick) {
  if (!data.length) {
    document.getElementById("historyList").innerHTML = "無資料";
    return;
  }

  document.getElementById("historyList").innerHTML = `
    <table>
      ${data.map((r,i)=>`
        <tr onclick="window.loadHistory(${i})">
          <td>${r.inquiry_no}</td>
          <td>${fmt(r.result.fair_yield)}</td>
        </tr>
      `).join("")}
    </table>
  `;
}

export function renderBasketCompare(rows) {
  if (!rows.length) {
    document.getElementById("basketCompare").innerHTML = "無資料";
    return;
  }

  document.getElementById("basketCompare").innerHTML = `
    <table>
      ${rows.map(r=>`
        <tr>
          <td>${r.date}</td>
          <td>${fmt(r.result.fair_yield)}</td>
        </tr>
      `).join("")}
    </table>
  `;
}
