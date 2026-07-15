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

export const MOCK_WEATHERAPI_RESPONSE = {
  current: {
    temp_c: 22.5,
    humidity: 68,
    wind_kph: 12.3,
    pressure_mb: 1015,
  },
};

export const MOCK_NASAPOWER_RESPONSE = {
  properties: {
    parameter: {
      T2M: {
        "20230101": 22.1, "20230102": 21.8, "20230103": 23.0,
        "20230104": 22.5, "20230105": 21.9, "20230106": 22.7,
        "20230107": 23.1, "20230108": 22.4, "20230109": 21.6,
        "20230110": 22.0,
      },
    },
  },
};

export const MOCK_OPENMETEO_RESPONSE = {
  daily: {
    temperature_2m_max: [24.1, 25.3, 23.8, 26.2, 24.9, 25.7],
    precipitation_sum: [0.0, 0.5, 2.1, 0.0, 1.3, 0.0],
  },
};

export const MOCK_OPENTOPODATA_RESPONSE = {
  results: [{ elevation: 950 }],
};
