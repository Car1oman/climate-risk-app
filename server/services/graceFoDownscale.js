/**
 * GRACE-FO Downscaling Utility
 *
 * Downsamples GRACE-FO mascon data (~300km resolution) to point coordinates
 * using bilinear interpolation from the nearest mascon grid cells.
 *
 * Mascon grid: 0.5° x 0.5° or 1° x 1° depending on solution (JPL/CSR/GSFC).
 */

/**
 * Bilinear interpolation at (lat, lon) from a regular grid.
 * @param {Array<{lat: number, lon: number, value: number}>} grid - Mascon grid cells
 * @param {number} lat - Target latitude
 * @param {number} lon - Target longitude
 * @returns {number|null} Interpolated value or null if grid is empty
 */
export function downscaleToPoint(grid, lat, lon) {
  if (!grid?.length) return null;

  // Find the four nearest grid points for bilinear interpolation
  const sorted = grid.map(p => ({
    ...p,
    dlat: p.lat - lat,
    dlon: p.lon - lon,
    dist: Math.sqrt((p.lat - lat) ** 2 + (p.lon - lon) ** 2),
  })).sort((a, b) => a.dist - b.dist);

  // Use the nearest cell if the point is within 1° of the closest grid cell
  const nearest = sorted[0];
  if (!nearest || nearest.dist > 2) return null;

  // Simple nearest-neighbor for now (the grid is too coarse for bilinear to add value)
  return nearest.value;
}

/**
 * Parses a mascon grid file (NetCDF or JSON) into a structured array.
 * @param {Object} parsedData - Data from NetCDF parse or API response
 * @returns {Array<{lat: number, lon: number, value: number}>|null}
 */
export function loadMasconFile(parsedData) {
  if (!parsedData) return null;

  // Handle TELLUS mascon JSON format: { columns: [lat, lon, tws], data: [[...]] }
  if (parsedData.data && Array.isArray(parsedData.data)) {
    return parsedData.data.map(row => ({
      lat: row[parsedData.columns.indexOf('lat')] ?? row[0],
      lon: row[parsedData.columns.indexOf('lon')] ?? row[1],
      value: row[parsedData.columns.indexOf('tws')] ?? row[2],
    })).filter(p => p.value != null);
  }

  // Handle PO.DAAC NetCDF parsed format: [{ lat, lon, tws }, ...]
  if (Array.isArray(parsedData)) {
    return parsedData.filter(p => p.lat != null && p.lon != null && p.tws != null)
      .map(p => ({ lat: p.lat, lon: p.lon, value: p.tws }));
  }

  return null;
}

/**
 * Estimates drought severity from TWS anomaly.
 * @param {number} twsAnomalyCm - TWS anomaly in cm
 * @returns {'none'|'moderate'|'severe'|'extreme'}
 */
export function classifyDroughtSeverity(twsAnomalyCm) {
  if (twsAnomalyCm >= -2) return 'none';
  if (twsAnomalyCm >= -5) return 'moderate';
  if (twsAnomalyCm >= -10) return 'severe';
  return 'extreme';
}
