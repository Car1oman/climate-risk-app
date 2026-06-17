const WB_BASE = 'https://api.worldbank.org/v2/country/PE/indicator';

const INDICATORS = {
  poverty:          'SI.POV.NAHC',
  urban_population: 'SP.URB.TOTL.IN.ZS',
  agriculture_gdp:  'NV.AGR.TOTL.ZS',
  water_access:     'SH.H2O.BASW.ZS',
  gdp_per_capita:   'NY.GDP.PCAP.CD',
  slums:            'EN.POP.SLUM.UR.ZS',
};

async function fetchWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchIndicator(code) {
  try {
    const res = await fetchWithTimeout(`${WB_BASE}/${code}?format=json&per_page=10`, 15000);
    if (!res.ok) return null;
    const data = await res.json();
    if (!Array.isArray(data) || data.length < 2) return null;
    for (const row of data[1]) {
      if (row.value != null) return { value: row.value, year: row.date };
    }
  } catch {
    // indica silenciosamente si falla un indicador individual
  }
  return null;
}

async function getWorldBankData() {
  const entries = await Promise.all(
    Object.entries(INDICATORS).map(async ([key, code]) => [key, await fetchIndicator(code)])
  );
  return Object.fromEntries(entries);
}

function buildContextMessages(wb) {
  const messages = [];
  const poverty = wb.poverty?.value;
  const urban   = wb.urban_population?.value;
  const agri    = wb.agriculture_gdp?.value;
  const water   = wb.water_access?.value;
  const gdp     = wb.gdp_per_capita?.value;
  const slums   = wb.slums?.value;

  if (poverty != null) {
    const yr  = wb.poverty?.year ? ` (${wb.poverty.year})` : '';
    const ctx = poverty >= 20
      ? 'Contexto de vulnerabilidad que puede amplificar impactos climáticos y dificultar recuperación.'
      : 'Nivel moderado; resiliencia económica relativa ante eventos climáticos.';
    messages.push(`Pobreza nacional: ${poverty.toFixed(1)}%${yr}. ${ctx}`);
  }

  if (urban != null) {
    const yr  = wb.urban_population?.year ? ` (${wb.urban_population.year})` : '';
    const ctx = urban >= 80
      ? 'Alta concentración urbana incrementa exposición de infraestructura y población ante eventos extremos.'
      : 'Distribución mixta urbano-rural; riesgo distribuido en distintos tipos de territorio.';
    messages.push(`Población urbana: ${urban.toFixed(0)}%${yr}. ${ctx}`);
  }

  if (agri != null && agri >= 3) {
    const yr = wb.agriculture_gdp?.year ? ` (${wb.agriculture_gdp.year})` : '';
    messages.push(`Agricultura: ${agri.toFixed(1)}% del PBI${yr}. Sector sensible ante sequías y variabilidad de precipitaciones.`);
  }

  if (water != null) {
    const yr  = wb.water_access?.year ? ` (${wb.water_access.year})` : '';
    const ctx = water < 90
      ? 'Acceso limitado puede amplificar el impacto de episodios de estrés hídrico.'
      : 'Cobertura amplia; menor amplificación de impactos por estrés hídrico.';
    messages.push(`Acceso a agua potable: ${water.toFixed(0)}%${yr}. ${ctx}`);
  }

  if (gdp != null) {
    const yr = wb.gdp_per_capita?.year ? ` (${wb.gdp_per_capita.year})` : '';
    const ctx = gdp < 7000
      ? 'Indicador de capacidad económica limitada para inversión en adaptación climática.'
      : 'Capacidad económica moderada para financiar medidas de adaptación.';
    messages.push(`PBI per cápita: USD ${gdp.toLocaleString('en')}${yr}. ${ctx}`);
  }

  if (slums != null) {
    const yr = wb.slums?.year ? ` (${wb.slums.year})` : '';
    const ctx = slums >= 30
      ? 'Alta proporción de población en asentamientos informales incrementa exposición a deslizamientos, inundaciones y estrés térmico.'
      : 'Proporción moderada; exposición urbana parcial.';
    messages.push(`Población en barrios marginales: ${slums.toFixed(0)}%${yr}. ${ctx}`);
  }

  return messages;
}

export async function getTerritorialContext() {
  const wb = await getWorldBankData();
  return {
    indicators: wb,
    narrative:  buildContextMessages(wb),
  };
}
