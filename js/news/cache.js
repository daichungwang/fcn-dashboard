/* =========================================
   Simple Cache（localStorage）
========================================= */

const KEY = "NEWS_CACHE_V1";

export function loadCache() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || {};
  } catch {
    return {};
  }
}

export function saveCache(cache) {
  localStorage.setItem(KEY, JSON.stringify(cache));
}

export function getCached(title) {
  const cache = loadCache();
  return cache[title];
}

export function setCached(title, value) {
  const cache = loadCache();
  cache[title] = value;
  saveCache(cache);
}
