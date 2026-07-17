/**
 * Combina source_quality y signal_strength según el método configurado.
 *
 * Métodos soportados (contrato stage-05-phenomena.md, config.confidence_combination):
 * - "geometric_mean": √(sq × ss) — default. Penaliza desequilibrios entre
 *   dimensiones, no permite compensación total (OECD/JRC §6.3).
 * - "min": min(sq, ss) — el resultado está limitado por la peor dimensión.
 *   Útil cuando ambas dimensiones son igualmente críticas y cualquiera puede
 *   invalidar la otra.
 * - "weighted": w1 × sq + w2 × ss — ponderación lineal. Requiere
 *   confidence_weights en thresholds.json. Útil cuando se quiere controlar
 *   explícitamente la influencia relativa de cada componente.
 *
 * @param {number} sq - source_quality promedio [0, 1]
 * @param {number} ss - signal_strength promedio [0, 1]
 * @param {string} method - "geometric_mean" | "min" | "weighted"
 * @param {{ source_quality?: number, signal_strength?: number }} [weights] - pesos para método "weighted"
 * @returns {number} confianza combinada [0, 1]
 */
export function combineConfidence(sq, ss, method, weights) {
  switch (method) {
    case "min":
      return Math.min(sq, ss);
    case "weighted": {
      const wSQ = weights?.source_quality ?? 0.5;
      const wSS = weights?.signal_strength ?? 0.5;
      const total = wSQ + wSS;
      return (wSQ * sq + wSS * ss) / total;
    }
    case "geometric_mean":
    default:
      return Math.sqrt(sq * ss);
  }
}
