export async function normalizeNewsWithAI(rawNews) {
  const prompt = `
你是一個金融分析系統，請將以下新聞轉成結構化資料。

請嚴格輸出 JSON，格式如下：

{
  "type": "macro | industry | market",
  "subtype": "",
  "sid_label": "利多 | 利空 | 中性",
  "sid_score": -2 ~ +2,
  "affected_sectors": [],
  "reason": ""
}

九大產業分類只能使用以下：
AI_SEMI
AI_APPLICATION
PLATFORM
CLOUD_SOFTWARE
CONSUMER
FINANCIAL
HEALTHCARE
TRAVEL
ENERGY
ETF

新聞內容：
標題: ${rawNews.title}
摘要: ${rawNews.summary}
`;

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer YOUR_API_KEY"
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    })
  });

  const data = await res.json();

  return JSON.parse(data.choices[0].message.content);
}
