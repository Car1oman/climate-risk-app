/**
 * Servicio de datos climáticos real
 * Usa WeatherAPI y cache en Supabase para evitar llamadas innecesarias.
 */
import { supabase } from "../supabaseClient.js";

const CACHE_HOURS = 6;

const getClimateData = async (lat, lng) => {
  const latNum = Number(lat);
  const lngNum = Number(lng);

  if (Number.isNaN(latNum) || Number.isNaN(lngNum)) {
    throw new Error("Coordenadas inválidas");
  }

  try {
    const apiKey = process.env.WEATHER_API_KEY;

    if (!apiKey) {
      throw new Error('WEATHER_API_KEY no configurada');
    }

    const { data: cached, error: cacheError } = await supabase
      .from("climate_data")
      .select("*")
      .eq("lat", latNum)
      .eq("lng", lngNum)
      .order("recorded_at", { ascending: false })
      .limit(1);

    if (cacheError) {
      console.warn("⚠️ Error consultando cache climática:", cacheError.message);
    }

    if (cached?.length > 0) {
      const last = new Date(cached[0].recorded_at);
      const diffHours = (Date.now() - last.getTime()) / (1000 * 60 * 60);

      if (diffHours < CACHE_HOURS) {
        return cached[0];
      }
    }

    const url = `https://api.weatherapi.com/v1/current.json?key=${apiKey}&q=${latNum},${lngNum}&aqi=no`;
    console.log("🌐 Llamando WeatherAPI:", url.replace(apiKey, "***"));

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`WeatherAPI error: ${response.status}`);
    }

    const data = await response.json();

    const payload = {
      lat: latNum,
      lng: lngNum,
      temperature: data.current?.temp_c ?? null,
      humidity: data.current?.humidity ?? null,
      wind_kph: data.current?.wind_kph ?? null,
      precipitation: data.current?.precip_mm ?? 0,
      condition: data.current?.condition?.text ?? "Desconocido",
      icon: data.current?.condition?.icon ?? null,
      source: "weatherapi",
      recorded_at: new Date().toISOString(),
    };

    const { error: insertError } = await supabase.from("climate_data").insert([payload]);

    if (insertError) {
      console.warn("⚠️ No se pudo guardar cache climática:", insertError.message);
    }

    return payload;
  } catch (error) {
    console.error("❌ Error clima:", error.message);

    const { data, error: fallbackError } = await supabase
      .from("climate_data")
      .select("*")
      .eq("lat", latNum)
      .eq("lng", lngNum)
      .order("recorded_at", { ascending: false })
      .limit(1);

    if (fallbackError) {
      console.warn("⚠️ Error fallback cache climática:", fallbackError.message);
    }

    return data?.[0] || null;
  }
};

export { getClimateData };
