/*
 * AI assistant layer.
 *
 * The assistant answers questions about the weather that is currently shown.
 * It has two engines:
 *   1. Local engine   - reads the data already fetched and answers common
 *                       questions. Needs no key, no internet, never fails.
 *   2. Server engine  - sends the question to our own backend, which holds the
 *                       Gemini key and forwards the request to Google. The key
 *                       is never downloaded to the browser.
 *
 * If the server call fails for any reason the local engine answers instead,
 * so the assistant always replies.
 */
const Chat = {

  
  facts(location, weather, forecast) {
    const days = (forecast || []).map(day =>
      `${new Date(day.date).toLocaleDateString("en-GB", { weekday: "long" })}: ` +
      `${day.max}/${day.min}°C`).join(", ");

    return {
      city: location.name,
      temperature: weather.temperature,
      feelsLike: weather.feelsLike,
      humidity: weather.humidity,
      wind: weather.wind,
      description: weather.description,
      forecast: forecast || [],
      asText:
        `City: ${location.name}. Temperature: ${weather.temperature}°C ` +
        `(feels like ${weather.feelsLike}°C). Condition: ${weather.description}. ` +
        `Humidity: ${weather.humidity}%. Wind: ${weather.wind} km/h. ` +
        (days ? `Next days: ${days}.` : "")
    };
  },

  /* Questions the user can click instead of typing. */
  suggestions: [
    "Do I need an umbrella?",
    "What should I wear?",
    "Is it windy?",
    "What is the warmest day this week?"
  ],

  /* ---- Local engine ---- */

  /* Decide which topic the question is about, then answer from the facts. */
  answerLocally(question, facts) {
    const q = String(question).toLowerCase();
    const has = (...words) => words.some(word => q.includes(word));
    const wet = /rain|drizzle|thunder|snow/.test(facts.description.toLowerCase());

    if (has("umbrella", "rain", "raining", "wet")) {
      return wet
        ? `Yes. The sky over ${facts.city} is "${facts.description}", so take an umbrella.`
        : `No. It is "${facts.description}" in ${facts.city} right now, so you can leave the umbrella at home.`;
    }

    if (has("wear", "jacket", "coat", "dress", "clothes")) {
      const t = facts.temperature;
      const advice = t >= 32 ? "very light clothes, a hat and plenty of water"
                   : t >= 24 ? "light clothes such as a t-shirt"
                   : t >= 16 ? "a light jacket or a long-sleeved shirt"
                   : t >= 8  ? "a warm jacket"
                             : "a heavy coat, and cover your hands and head";
      return `It is ${t}°C in ${facts.city} and feels like ${facts.feelsLike}°C, so wear ${advice}.` +
             (wet ? " Add something waterproof." : "");
    }

    if (has("wind", "windy")) {
      const w = facts.wind;
      const level = w >= 40 ? "very windy" : w >= 20 ? "fairly windy" : w >= 10 ? "a light breeze" : "almost still";
      return `The wind in ${facts.city} is ${w} km/h, which is ${level}.`;
    }

    if (has("humid", "humidity")) {
      const h = facts.humidity;
      const level = h >= 70 ? "humid and sticky" : h >= 40 ? "comfortable" : "very dry";
      return `Humidity in ${facts.city} is ${h}%, which feels ${level}.`;
    }

    /* These two must be tested BEFORE the plain hot/cold question below,
       because "warmest" contains "warm" and "coldest" contains "cold". */
    if (has("warmest", "hottest", "best day") && facts.forecast.length) {
      const best = facts.forecast.reduce((a, b) => (b.max > a.max ? b : a));
      return `The warmest day coming up is ` +
             `${new Date(best.date).toLocaleDateString("en-GB", { weekday: "long" })} ` +
             `at ${best.max}°C.`;
    }

    if (has("coldest", "coolest") && facts.forecast.length) {
      const worst = facts.forecast.reduce((a, b) => (b.min < a.min ? b : a));
      return `The coldest day coming up is ` +
             `${new Date(worst.date).toLocaleDateString("en-GB", { weekday: "long" })} ` +
             `at ${worst.min}°C.`;
    }

    if (has("hot", "cold", "warm", "temperature", "degrees")) {
      const t = facts.temperature;
      const level = t >= 35 ? "very hot" : t >= 28 ? "hot" : t >= 20 ? "warm"
                  : t >= 12 ? "cool" : "cold";
      return `It is ${t}°C in ${facts.city} right now, which is ${level}. It feels like ${facts.feelsLike}°C.`;
    }

    if (has("tomorrow") && facts.forecast.length) {
      const d = facts.forecast[0];
      return `Tomorrow in ${facts.city}: a high of ${d.max}°C and a low of ${d.min}°C.`;
    }

    if (has("week", "forecast", "next days") && facts.forecast.length) {
      return `Next days in ${facts.city}: ` + facts.forecast.map(d =>
        `${new Date(d.date).toLocaleDateString("en-GB", { weekday: "short" })} ` +
        `${d.max}/${d.min}°C`).join(", ") + ".";
    }

    if (has("hello", "hi ", "salam", "marhaba") || q.trim() === "hi") {
      return `Hello! Ask me anything about the weather in ${facts.city}.`;
    }

    /* Nothing matched: give the summary rather than an empty answer. */
    return `Here is what I know about ${facts.city}: ${facts.temperature}°C, ` +
           `${facts.description}, humidity ${facts.humidity}%, wind ${facts.wind} km/h. ` +
           `Try asking about rain, clothing, wind or the warmest day.`;
  },

  /* ---- Server engine ---- */

  /*
   * The browser never holds the API key. It asks our own backend, and the
   * backend asks Google. aiReady is discovered once at start-up by calling
   * /api/health, which reports whether a key is configured on the server.
   */
  aiReady: false,

  async probe() {
    try {
      const response = await fetch(CONFIG.API_BASE + "/api/health");
      if (!response.ok) throw new Error("no backend");
      const data = await response.json();
      Chat.aiReady = Boolean(data.ai);
    } catch (error) {
      Chat.aiReady = false;      // opened without the backend - local engine only
    }
    return Chat.aiReady;
  },

  isAiEnabled() {
    return Chat.aiReady === true;
  },

  /* Send the question and the weather facts to our backend. */
  async askServer(question, facts) {
    const response = await fetch(CONFIG.API_BASE + "/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, facts: facts.asText })
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The assistant service failed.");
    if (!data.text) throw new Error("The assistant returned an empty answer.");
    return String(data.text).trim();
  },

  /* ---- Public entry point ---- */

  /* Returns { text, engine } so the interface can show which engine replied. */
  async ask(question, facts) {
    if (Chat.isAiEnabled()) {
      try {
        return { text: await Chat.askServer(question, facts), engine: "ai" };
      } catch (error) {
        return { text: Chat.answerLocally(question, facts), engine: "local-fallback" };
      }
    }
    return { text: Chat.answerLocally(question, facts), engine: "local" };
  }
};
