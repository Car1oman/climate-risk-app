const WB_BASE = 'https://api.worldbank.org/v2/country/PE/indicator';

const INDICATORS = {
  poverty:          'SI.POV.NAHC',
  urban_population: 'SP.URB.TOTL.IN.ZS',
  agriculture_gdp:  'NV.AGR.TOTL.ZS',
  water_access:     'SH.H2O.BASW.ZS',
  gdp_per_capita:   'NY.GDP.PCAP.CD',
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

function buildNarrative(wb) {
  const messages = [];
  const poverty = wb.poverty?.value;
  const urban   = wb.urban_population?.value;
  const agri    = wb.agriculture_gdp?.value;
  const water   = wb.water_access?.value;

  if (poverty != null && poverty >= 20) {
    messages.push('La vulnerabilidad socioeconómica puede dificultar la recuperación ante eventos climáticos extremos.');
  }
  if (urban != null && urban >= 80) {
    messages.push('La alta urbanización incrementa la exposición de población e infraestructura ante eventos extremos.');
  }
  if (agri != null && agri >= 5) {
    messages.push('La dependencia del sector agrícola incrementa la vulnerabilidad ante sequías prolongadas.');
  }
  if (water != null && water < 90) {
    messages.push('El acceso limitado al agua potable puede amplificar los impactos del estrés hídrico.');
  }

  if (!messages.length) {
    messages.push('El contexto socioeconómico del territorio no muestra vulnerabilidades críticas adicionales.');
  }

  return messages;
}

export async function getTerritorialContext() {
  const wb = await getWorldBankData();
  return {
    indicators: wb,
    narrative:  buildNarrative(wb),
  };
}
