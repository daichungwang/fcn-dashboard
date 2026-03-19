export function getPoolItem(pool, symbol) {
  return pool.find(item => item.symbol === symbol) || null;
}
