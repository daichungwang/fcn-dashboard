/* =========================================
   News Fetcher V1 Debug
========================================= */


    export async function fetchNews() {
  console.log("⚠️ 使用 mock news");

  return [
    {
      id: "MOCK_1",
      title: "Fed signals rate cuts coming",
      summary: "The Federal Reserve hints at lowering interest rates.",
      source: "Mock",
      url: "",
      published_at: new Date().toISOString(),
    },
    {
      id: "MOCK_2",
      title: "AI demand surges for semiconductors",
      summary: "AI boom boosts demand for chips.",
      source: "Mock",
      url: "",
      published_at: new Date().toISOString(),
    },
  ];
}
