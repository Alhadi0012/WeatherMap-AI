/*
 * Data layer: all asynchronous network calls live here.
 * Every function returns a Promise and uses async/await (ES6+).
 */
const Api = {

  /* Weather condition -> emoji, shared by both providers. */
  icons: {
    clear: "☀️", clouds: "☁️", rain: "🌧️",
    drizzle: "🌦️", thunderstorm: "⛈️", snow: "❄️",
    mist: "🌫️", default: "🌡️"
  },

  iconFor(condition) {
    return Api.icons[String(condition).toLowerCase()] || Api.icons.default;
  },

  /* Turn a text location into coordinates (JSON geocoding, no API key). */
  async geocode(place) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(place)}`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Geocoding service is not responding.");

    const results = await response.json();
    if (!results.length) throw new Error(`Location "${place}" was not found. Please check the spelling.`);

    return {
      name: results[0].display_name.split(",")[0],
      fullName: results[0].display_name,
      lat: parseFloat(results[0].lat),
      lon: parseFloat(results[0].lon)
    };
  },

  /* Current weather. Uses OpenWeatherMap when a key is set, Open-Meteo otherwise. */
  async currentWeather(lat, lon) {
    if (CONFIG.OPENWEATHER_KEY) {
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}` +
                  `&units=${CONFIG.UNITS}&appid=${CONFIG.OPENWEATHER_KEY}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("The weather service refused the request. Check your API key.");
      return Api.readOpenWeather(await response.json());
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("The weather service is not responding right now.");
    return Api.readOpenMeteo(await response.json());
  },

  /* Five day forecast from the same provider as the current weather. */
  async forecast(lat, lon) {
    if (CONFIG.OPENWEATHER_KEY) {
      const url = `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}` +
                  `&units=${CONFIG.UNITS}&appid=${CONFIG.OPENWEATHER_KEY}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error("Could not load the forecast.");
      return Api.readOpenWeatherForecast(await response.json());
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
                `&daily=temperature_2m_max,temperature_2m_min,weather_code&forecast_days=6&timezone=auto`;
    const response = await fetch(url);
    if (!response.ok) throw new Error("Could not load the forecast.");
    return Api.readOpenMeteoForecast(await response.json());
  },

  /* ---- Converters: both providers end up in the same simple shape ---- */

  readOpenWeather(data) {
    return {
      temperature: Math.round(data.main.temp),
      feelsLike: Math.round(data.main.feels_like),
      humidity: data.main.humidity,
      wind: Math.round(data.wind.speed * 3.6),      // m/s -> km/h
      description: data.weather[0].description,
      icon: Api.iconFor(data.weather[0].main)
    };
  },

  readOpenWeatherForecast(data) {
    const days = [];
    data.list.forEach(slot => {
      const date = slot.dt_txt.split(" ")[0];
      const found = days.find(day => day.date === date);
      if (found) {
        found.max = Math.max(found.max, Math.round(slot.main.temp_max));
        found.min = Math.min(found.min, Math.round(slot.main.temp_min));
      } else {
        days.push({
          date,
          max: Math.round(slot.main.temp_max),
          min: Math.round(slot.main.temp_min),
          icon: Api.iconFor(slot.weather[0].main)
        });
      }
    });
    return days.slice(0, 5);
  },

  /* Open-Meteo returns a numeric WMO code instead of a text condition. */
  codeToCondition(code) {
    if (code === 0) return "clear";
    if (code <= 3) return "clouds";
    if (code <= 48) return "mist";
    if (code <= 57) return "drizzle";
    if (code <= 67) return "rain";
    if (code <= 77) return "snow";
    if (code <= 82) return "rain";
    if (code <= 86) return "snow";
    return "thunderstorm";
  },

  readOpenMeteo(data) {
    const condition = Api.codeToCondition(data.current.weather_code);
    return {
      temperature: Math.round(data.current.temperature_2m),
      feelsLike: Math.round(data.current.apparent_temperature),
      humidity: data.current.relative_humidity_2m,
      wind: Math.round(data.current.wind_speed_10m),
      description: condition,
      icon: Api.iconFor(condition)
    };
  },

  readOpenMeteoForecast(data) {
    return data.daily.time.slice(1, 6).map((date, index) => ({
      date,
      max: Math.round(data.daily.temperature_2m_max[index + 1]),
      min: Math.round(data.daily.temperature_2m_min[index + 1]),
      icon: Api.iconFor(Api.codeToCondition(data.daily.weather_code[index + 1]))
    }));
  }
};
