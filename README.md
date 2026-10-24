# WeatherMap — Asynchronous Client-Side SPA with a Secure AI Backend

"Our project is WeatherMap AI, a web application developed using HTML, CSS, JavaScript, and Node.js. It allows users to search for cities, view current weather conditions and a five-day forecast, explore locations on an interactive map, save favourite cities, share weather information, and ask questions through a weather assistant.

The frontend is divided into modules, each responsible for a specific function. The main application controller connects these modules and manages the user interaction.

We also developed a Node.js backend to protect the AI API key. When a user asks a question, the backend communicates with Google Gemini and returns the answer. If the AI service is unavailable, the application uses its local answering system.

Our main objective is to provide a simple, interactive weather application that combines real-time weather information, maps, and AI assistance while keeping the AI API key out of the browser."

---

## Run it

powershell
npm install jsdom
node backend/server.js


Then open `http://localhost:3000`. .

---

## Turn the AI on (optional)

The app works fully without any key: the weather comes from Open-Meteo and the
assistant uses its built-in local engine.

1. Get a free key at `aistudio.google.com` → **Get API key**.
2. Copy `backend/.env.example` to `backend/.env`.
3. Fill it in:

```
GEMINI_KEY=AIza...your-key
GEMINI_MODEL=gemini-flash-lite-latest,gemini-3.5-flash-lite,gemini-3.8-flash
PORT=3000
```



#

## Project structure

```
weathermap-ai/
   index.html          structure only - no inline styles, no inline onclick
    css/
│         style.css       all styling
├ js/
│     config.js       public settings (NO secrets)
│     api.js          weather fetch calls + async/await   (data layer)
│     mapView.js      everything related to Leaflet        (map layer)
│     favourites.js   LocalStorage helper
│     share.js        share message, Web Share API, clipboard
│     chat.js         assistant: local engine + backend calls
│     app.js          events, rendering, workflow          (controller)
└ backend/
          server.js       static files + /api/chat proxy
          package.json    no dependencies
         .env            YOUR KEY - git-ignored, never committed
         .env.example    template, safe to commit




## Features

- **Search** — city name → coordinates (Nominatim) → live weather → map popup.
- **5-Day Forecast** — from the same provider as the current weather.
- **Favourites** — saved in LocalStorage, shown as quick-access chips.
- **Share Weather** — native share sheet on phones, or a menu with WhatsApp,
  X/Twitter, Telegram and Email links plus Copy on desktop.
- **AI Assistant** — two engines:
  - *Local* (default): answers about rain, clothing, wind, humidity,
    temperature, warmest/coldest day and the week, from data already fetched.
    No key, no internet, never fails.
  - *Server*: forwards the question to the backend, which calls Gemini.
  - If the server call fails for any reason the local engine answers instead,
    so the assistant always replies. The badge shows which engine answered.



