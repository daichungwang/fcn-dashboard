document.addEventListener("DOMContentLoaded", () => {
  fetch("positions.json")
    .then(response => response.json())
    .then(data => {
      const count = data.length;
      const first = data[0];

      const firstId = first?.id || "無資料";
      const stockNames = first?.stocks?.map(s => s.symbol).join(" / ") || "無資料";

      let worst = first?.stocks?.[0];
      if (first?.stocks?.length > 0) {
        first.stocks.forEach(s => {
          if (s.score < worst.score) {
            worst = s;
          }
        });
      }

      const worstSymbol = worst?.symbol || "無資料";

      document.getElementById("healthBox").innerHTML =
        "持倉筆數：" + count + "<br>" +
        "第一筆編號：" + firstId + "<br>" +
        "股票組合：" + stockNames + "<br>" +
        "Worst-of：" + worstSymbol;
    })
    .catch(error => {
      document.getElementById("healthBox").textContent = "讀取失敗";
      console.error(error);
    });
});
