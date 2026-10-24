/*
 * Frontend configuration - safe to commit, holds NO secrets.
 *
 * The Gemini key is NOT here and never reaches the browser. It lives in
 * backend/.env and is used only by backend/server.js.
 *
 * OPENWEATHER_KEY is optional: leave it empty to use Open-Meteo, which needs
 * no key at all. If you do set it, remember it IS visible to visitors.
 */
const CONFIG = {
  OPENWEATHER_KEY: "",

  /* Where the backend lives. Empty means "the same server that served this
     page", which is correct when you run  node backend/server.js  */
  API_BASE: "",

  UNITS: "metric",                      // metric = Celsius
  DEFAULT_CENTER: [15.5007, 32.5599],   // Khartoum
  DEFAULT_ZOOM: 5,
  LOCATED_ZOOM: 10
};
