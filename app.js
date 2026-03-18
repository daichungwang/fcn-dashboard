document.addEventListener("DOMContentLoaded", () => {

  fetch("positions.json")
    .then(response => response.json())
    .then(data => {

      const count = data.length;
      const first = data[0];

      const firstId = first?.id || "無資料";
      const stocks = first?.stocks || [];

      const stockNames = stocks.map(s => s.symbol).join(" / ");

      // 排序（由差到好）
      const sorted = [...stocks].sort((a, b) => a.score - b.score);

      let worstList = [];

      if (stocks.length === 3) {
        worstList = [sorted[0]];
      } else if (stocks.length === 4) {
        worstList = [sorted[0], sorted[1]];
      } else if (stocks.length === 5) {
        worstList = [sorted[0], sorted[1]];
      }

      const worstSymbols = worstList.map(s => s.symbol).join(" / ");

      // 判斷是否同級
      let penalty = 0;
      if (worstList.length === 2) {
        if (worstList[0].score === worstList[1].score) {
          penalty = -2;
        }
      }

      document.getElementById("healthBox").innerHTML =
        "持倉筆數：" + count + "<br>" +
        "第一筆編號：" + firstId + "<br>" +
        "股票組合：" + stockNames + "<br>" +
        "Worst-of：" + worstSymbols + "<br>" +
        "懲罰分數：" + penalty;

    })
    .catch(error => {
      document.getElementById("healthBox").textContent = "讀取失敗";
      console.error(error);
    });

});
