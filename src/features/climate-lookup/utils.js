export function fmtUSD(val) {
  if (val == null) return "—";
  if (val >= 1_000_000) return `USD ${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000)     return `USD ${(val / 1_000).toFixed(0)}K`;
  return `USD ${val}`;
}

export function fmtNum(v, decimals = 1) {
  if (v == null) return "—";
  return Number.isInteger(v) ? String(v) : v.toFixed(decimals);
}
