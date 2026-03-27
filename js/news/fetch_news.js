/* =========================================
   News Fetcher V1
   功能：
   1. 從 NewsAPI 抓新聞
   2. 轉成系統可用的 raw format
========================================= */

export async function fetchNews() {
  try {
    const API_KEY = "YOUR_NEWSAPI_KEY"; // 🔥 換成你的 key

    const url = `https://newsapi.org/v2/everything?q=(
      fed OR inflation OR interest rate OR CPI OR oil OR AI OR semiconductor OR stock market
    )&language=en&sortBy=publishedAt&pageSize=30&apiKey=${API_KEY}`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error("News API 讀取失敗");
    }

    const data = await res.json();

    console.log("📰 Raw News API:", data);

    // 👉 轉成你系統用的格式
    const rawNews = data.articles.map((a, i) => ({
      id: "RAW_" + (i + 1),
      title: a.title || "",
      summary: a.description || "",
      source: a.source?.name || "",
      url: a.url || "",
      published_at: a.publishedAt || "",
    }));

    console.log("✅ rawNews:", rawNews);

    return rawNews;

  } catch (err) {
    console.error("❌ fetchNews error:", err);
    return [];
  }
}
