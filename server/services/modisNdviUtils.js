/**
 * MODIS NDVI Utilities — Pure functions for NDVI anomaly calculation and classification
 */

/**
 * Calculates NDVI anomaly and z-score.
 * @param {number} currentNdvi - Current NDVI value (0–1)
 * @param {number} longTermMean - Long-term mean NDVI (0–1)
 * @param {number} [stdDev] - Standard deviation of historical NDVI (optional, for z-score)
 * @returns {{ anomaly: number, zScore: number|null }}
 */
export function calcNdviAnomaly(currentNdvi, longTermMean, stdDev) {
  const anomaly = currentNdvi - longTermMean;
  const zScore = stdDev != null && stdDev > 0 ? anomaly / stdDev : null;
  return { anomaly, zScore };
}

/**
 * Classifies vegetation health based on NDVI value and anomaly.
 * @param {number} ndvi - Current NDVI value (0–1)
 * @param {number} anomaly - NDVI anomaly
 * @returns {'good'|'stress'|'severe_stress'}
 */
export function classifyVegetationHealth(ndvi, anomaly) {
  if (anomaly < -0.4) return 'severe_stress';
  if (anomaly < -0.2) return 'stress';
  if (ndvi < 0.15) return 'stress'; // bare soil / sparse vegetation threshold
  return 'good';
}
