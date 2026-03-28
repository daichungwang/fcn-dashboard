/* =========================================
   News Fetcher V1
   功能：
   1. 從 NewsAPI 抓新聞
   2. 轉成系統可用的 raw format
========================================= */
console.log("🌐 Fetch URL:", url);
export async function fetchNews() {
  try {
    const API_KEY = "e334543f5b2046eba15d66f9ce060d28"; // 🔥 換成你的 key

    const url = `https://newsapi.org/v2/everything?q=(
  fed OR inflation OR interest rate OR CPI OR oil OR AI OR semiconductor OR stock market
)&language=en&sortBy=publishedAt&pageSize=30&apiKey=${API_KEY}`;

console.log("🌐 Fetch URL:", url);

const res = await fetch(url);

console.log("📡 response status:", res.status);

const data = await res.json();

console.log("📦 API data:", data); 

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
console.log("📡 response status:", res.status);
