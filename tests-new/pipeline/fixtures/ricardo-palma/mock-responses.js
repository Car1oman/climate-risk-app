export const RICARDO_PALMA = {
  location: {
    lat: -11.8996,
    lon: -76.67358,
    location_name: "Ricardo Palma, Lima, Perú",
    country: "Perú",
    region: "Lima",
  },
  sector: "retail",
};

export const MOCK_RESPONSES = {
  weatherapi: {
    current: {
      temp_c: 22.5,
      humidity: 68,
      wind_kph: 12.3,
      pressure_mb: 1015,
    },
  },
  nasa_power: {
    properties: {
      parameter: {
        T2M: Object.fromEntries(
          Array.from({ length: 365 }, (_, i) => {
            const date = `2023${String(i + 1).padStart(3, "0")}`;
            return [date, 20 + Math.random() * 6];
          })
        ),
      },
    },
  },
  openmeteo_cmip6: {
    daily: {
      temperature_2m_max: Array.from({ length: 365 }, () => 22 + Math.random() * 8),
      temperature_2m_min: Array.from({ length: 365 }, () => 14 + Math.random() * 6),
      precipitation_sum: Array.from({ length: 365 }, () => Math.random() > 0.7 ? Math.random() * 10 : 0),
    },
  },
  opentopodata_srtm30m: {
    results: [{ elevation: 950 }],
  },
  gracefo_jpl: {
    twsa: -2.5,
    unit: "cm",
    date: "2024-01",
  },
};
