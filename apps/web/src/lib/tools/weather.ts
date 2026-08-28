import { tool } from 'ai';
import { z } from 'zod';

async function getCoordinates(city: string) {
  const rest = await fetch(
    `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1`,
  );
  const data = await rest.json();

  if (!data.results || data.results.length === 0) {
    throw new Error(`Could not find location: ${city}`);
  }

  const { latitude, longitude, name } = data.results[0];
  return { latitude, longitude, name };
}

async function getWeatherData(latitude: number, longitude: number) {
  const rest = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code,wind_speed_10m`,
  );
  const data = await rest.json();
  return data.current;
}

export const weatherTool = tool({
  description:
    'Get the current weather for a city. Use this whenever the user asks about weather, temperature, or conditions in a specific place.',
  inputSchema: z.object({
    city: z
      .string()
      .describe("The name of the city, e.g. 'Lisbon' or 'Kuala Lumpur'"),
  }),
  execute: async ({ city }) => {
    const location = await getCoordinates(city);
    const weather = await getWeatherData(location.latitude, location.longitude);

    return {
      city: location.name,
      temperature: weather.temperature_2m,
      windSpeed: weather.wind_speed_10m,
      weatherCode: weather.weather_code,
    };
  },
});
