export function renderModule1News(newsData) {
  if (!newsData) {
    return `<p>目前沒有新聞資料</p>`;
  }

  function renderSection(title, items) {
    if (!items || items.length === 0) {
      return `
        <div style="margin-bottom:16px;">
          <h3>${title}</h3>
          <p>目前沒有資料</p>
        </div>
      `;
    }

    return `
      <div style="margin-bottom:20px;">
        <h3>${title}</h3>
        ${items.map(item => `
          <div style="margin-bottom:14px;">
            <strong>${item.title}</strong><br>
            <span>${item.summary}</span><br>
            <span>影響標的：${(item.impact_symbols || []).join(", ")}</span><br>
            <span>影響 FCN Pool：${item.affects_pool ? "是" : "否"}</span><br>
            <span>影響強度：${item.impact_level || "未標記"}</span><br>
            <span>來源：${item.source || "manual"}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  return `
    <div style="margin-bottom:12px;">更新時間：${newsData.generated_at || "未提供"}</div>
    ${renderSection("國際新聞", newsData.international)}
    ${renderSection("國際財經新聞", newsData.financial)}
    ${renderSection("AI 趨勢", newsData.ai_trends)}
  `;
}
