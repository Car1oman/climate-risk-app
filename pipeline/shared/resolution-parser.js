// Shared by Stage 03 (source-selection resolution ranking) and Stage 04
// (Source Quality's `resolution` component, resolution-profiles.json) so the
// two stages never drift into two different interpretations of the same
// resolution_native string.
export function parseResolutionToMeters(resolutionStr) {
  if (resolutionStr == null) return null;
  const str = String(resolutionStr).trim().toLowerCase();

  // Range notation "A°–B°" or "A–B km" — take the larger value (conservative bound).
  const rangeMatch = str.match(/([\d.]+)\s*([a-z°]*)\s*[–\-]\s*([\d.]+)\s*([a-z°]+)?/);
  if (rangeMatch) {
    const a = parseFloat(rangeMatch[1]);
    const b = parseFloat(rangeMatch[3]);
    // Prefer the explicit unit on the second value; fall back to the first; default "m".
    const unit = (rangeMatch[4] || rangeMatch[2] || "m").trim();
    return applyResolutionUnit(Math.max(a, b), unit);
  }

  const numMatch = str.match(/^([\d.]+)\s*([a-z°]+)?/);
  if (!numMatch) return null;
  return applyResolutionUnit(parseFloat(numMatch[1]), numMatch[2] || "m");
}

export function applyResolutionUnit(num, unit) {
  if (unit === "km") return num * 1000;
  if (unit === "°" || unit === "deg" || unit === "degree" || unit === "degrees") return num * 111000;
  if (unit === "'" || unit === "arcmin" || unit === "arc-minute" || unit === "arcminutes") return num * 1852;
  if (unit === "\"" || unit === "arcsec" || unit === "arc-second" || unit === "arcseconds") return num * 30.87;
  return num;
}
