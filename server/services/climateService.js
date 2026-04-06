/**
 * Servicio de datos climáticos real
 * Usa WeatherAPI para obtener información climática actual
 */

const getClimateData = async (lat, lng) => {
  try {
    const apiKey = process.env.WEATHER_API_KEY;

    if (!apiKey) {
      throw new Error('WEATHER_API_KEY no configurada');
    }

    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${lat},${lng}&aqi=no`;

    console.log("🌐 Llamando WeatherAPI:", url.replace(apiKey, '***'));

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`WeatherAPI error: ${response.status}`);
    }

    const data = await response.json();

    console.log("✅ Datos recibidos de WeatherAPI");

    // Extraer datos relevantes
    const climateData = {
      temperature: data.current?.temp_c ?? null,
      humidity: data.current?.humidity ?? null,
      wind_kph: data.current?.wind_kph ?? null,
      condition: data.current?.condition?.text ?? "Desconocido",
      icon: data.current?.condition?.icon ?? null,
    };

    return climateData;
  } catch (error) {
    console.error("❌ Error en climateService:", error.message);
    throw error;
  }
};

export { getClimateData };
