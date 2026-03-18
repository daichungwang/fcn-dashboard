document.addEventListener("DOMContentLoaded", () => {

  fetch("positions.json")
    .then(response => response.json())
    .then(data => {

      const count = data.length;

      document.getElementById("healthBox").textContent =
        "持倉筆數：" + count;

    })
    .catch(error => {
      document.getElementById("healthBox").textContent =
        "讀取失敗";
      console.error(error);
    });

});
