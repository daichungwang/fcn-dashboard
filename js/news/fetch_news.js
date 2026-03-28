/* =========================================
   News Fetcher V1 Debug
========================================= */

export async function fetchNews() {
  try {
    const API_KEY = "e334543f5b2046eba15d66f9ce060d28";

    const query = "fed OR inflation OR interest rate OR CPI OR oil OR AI OR semiconductor OR stock market";
    const url =
      `https://newsapi.org/v2/everything?` +
      `q=${encodeURIComponent(query)}` +
      `&language=en` +
      `&sortBy=publishedAt` +
      `&pageSize=30` +
      `&apiKey=${API_KEY}`;

    console.log("🌐 Fetch URL:", url);

    const res = await fetch(url);
    console.log("📡 response status:", res.status);

    const data = await res.json();
    console.log("📦 API data:", data);

    if (!res.ok) {
      throw new Error(`News API 讀取失敗: ${res.status} ${data?.message || ""}`);
    }

    const articles = Array.isArray(data.articles) ? data.articles : [];

    const rawNews = articles.map((a, i) => ({
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
