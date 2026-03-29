export async function fetchNews() {
  try {
    // 👉 優先用本地（穩定）
    const res = await fetch("./data/news.json");
    if (!res.ok) throw new Error("local news.json fail");

    const data = await res.json();

    console.log("✅ 使用本地 news.json:", data);
    return data;

  } catch (err) {
    console.error("❌ fetchNews error:", err);
    return [];
  }
}
