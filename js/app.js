/*
 * Controller: connects the form, the data layer, the map, the share menu
 * and the AI assistant.
 * All handlers are attached with addEventListener - no inline onclick anywhere.
 */
const App = {
  elements: {},
  lastResult: null,
  lastForecast: [],

  /* Cache the elements once and wire up the events. */
  start() {
    const byId = id => document.getElementById(id);
    App.elements = {
      form: byId("searchForm"),
      input: byId("locationInput"),
      spinner: byId("spinner"),
      errorBox: byId("errorBox"),
      weatherCard: byId("weatherCard"),
      icon: byId("weatherIcon"),
      placeName: byId("placeName"),
      temperature: byId("temperature"),
      description: byId("description"),
      details: byId("weatherDetails"),
      shareButton: byId("shareButton"),
      shareMenu: byId("shareMenu"),
      shareTargets: byId("shareTargets"),
      sharePreview: byId("sharePreview"),
      copyButton: byId("copyButton"),
      closeShareButton: byId("closeShareButton"),
      favouriteButton: byId("favouriteButton"),
      favouritesList: byId("favouritesList"),
      forecastSection: byId("forecastSection"),
      forecastList: byId("forecastList"),
      chatCard: byId("chatCard"),
      chatLog: byId("chatLog"),
      chatForm: byId("chatForm"),
      chatInput: byId("chatInput"),
      chatSend: byId("chatSend"),
      chatEngine: byId("chatEngine"),
      chatSuggestions: byId("chatSuggestions")
    };

    MapView.init();
    App.renderFavourites();

    // Ask the backend whether an AI key is configured there.
    Chat.probe();

    App.elements.form.addEventListener("submit", App.onSubmit);
    App.elements.shareButton.addEventListener("click", App.onShare);
    App.elements.copyButton.addEventListener("click", App.onCopy);
    App.elements.closeShareButton.addEventListener("click", App.closeShareMenu);
    App.elements.favouriteButton.addEventListener("click", App.onFavourite);
    App.elements.chatForm.addEventListener("submit", App.onAsk);
  },

  /* Form submit: stop the page reload, then run everything asynchronously. */
  async onSubmit(event) {
    event.preventDefault();
    await App.search(App.elements.input.value.trim());
  },

  /* The main workflow: geocode -> weather -> map -> forecast -> assistant. */
  async search(place) {
    if (!place) {
      App.showError("Please type a location name first.");
      return;
    }

    App.showSpinner(true);
    App.hideError();
    App.closeShareMenu();

    try {
      const location = await Api.geocode(place);
      const weather = await Api.currentWeather(location.lat, location.lon);

      App.lastResult = { location, weather };
      App.lastForecast = [];
      App.renderWeather(location, weather);
      MapView.showWeather(location, weather);

      // The forecast is a bonus: a failure here must not break the main result.
      try {
        App.lastForecast = await Api.forecast(location.lat, location.lon);
        App.renderForecast(App.lastForecast);
      } catch (forecastError) {
        App.elements.forecastSection.classList.add("hidden");
      }

      App.startChat();
    } catch (error) {
      App.elements.weatherCard.classList.add("hidden");
      App.elements.forecastSection.classList.add("hidden");
      App.elements.chatCard.classList.add("hidden");
      App.showError(error.message);
    } finally {
      App.showSpinner(false);
    }
  },

  /* ---- Rendering ---- */

  renderWeather(location, weather) {
    const e = App.elements;
    e.icon.textContent = weather.icon;
    e.placeName.textContent = location.name;
    e.temperature.textContent = `${weather.temperature}°C`;
    e.description.textContent = weather.description;

    e.details.innerHTML = "";
    [["Feels like", `${weather.feelsLike}°C`],
     ["Humidity", `${weather.humidity}%`],
     ["Wind", `${weather.wind} km/h`]].forEach(([label, value]) => {
      const item = document.createElement("li");
      item.textContent = `${label}: ${value}`;
      e.details.appendChild(item);
    });

    e.favouriteButton.textContent = Favourites.has(location.name)
      ? "Remove from Favourites" : "Add to Favourites";
    e.weatherCard.classList.remove("hidden");
  },

  renderForecast(days) {
    const list = App.elements.forecastList;
    list.innerHTML = "";

    days.forEach(day => {
      const box = document.createElement("div");
      box.className = "forecast-day";

      const name = document.createElement("div");
      name.className = "day";
      name.textContent = new Date(day.date).toLocaleDateString("en-GB", { weekday: "short" });

      const icon = document.createElement("div");
      icon.className = "icon";
      icon.textContent = day.icon;

      const temp = document.createElement("div");
      temp.className = "temp";
      temp.textContent = `${day.max}° / ${day.min}°`;

      box.append(name, icon, temp);
      list.appendChild(box);
    });

    App.elements.forecastSection.classList.remove("hidden");
  },

  renderFavourites() {
    const list = App.elements.favouritesList;
    list.innerHTML = "";

    Favourites.all().forEach(city => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "favourite-chip";
      chip.textContent = city;
      chip.addEventListener("click", () => {
        App.elements.input.value = city;
        App.search(city);
      });
      list.appendChild(chip);
    });
  },

  /* ---- AI assistant ---- */

  /* Open the assistant for the city that was just loaded. */
  startChat() {
    const e = App.elements;
    e.chatLog.innerHTML = "";
    e.chatEngine.textContent = Chat.isAiEnabled() ? "AI mode" : "offline mode";

    App.addMessage("bot",
      `Hi! Ask me anything about the weather in ${App.lastResult.location.name}.`);

    e.chatSuggestions.innerHTML = "";
    Chat.suggestions.forEach(question => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chat-chip";
      chip.textContent = question;
      chip.addEventListener("click", () => App.sendQuestion(question));
      e.chatSuggestions.appendChild(chip);
    });

    e.chatCard.classList.remove("hidden");
  },

  /* Form submit: never reload the page. */
  async onAsk(event) {
    event.preventDefault();
    const question = App.elements.chatInput.value.trim();
    App.elements.chatInput.value = "";
    await App.sendQuestion(question);
  },

  /* Send one question and show the answer. */
  async sendQuestion(question) {
    if (!question || !App.lastResult) return;

    App.addMessage("user", question);
    const thinking = App.addMessage("bot", "Thinking...");
    App.elements.chatSend.disabled = true;

    const facts = Chat.facts(App.lastResult.location,
                             App.lastResult.weather,
                             App.lastForecast);
    const answer = await Chat.ask(question, facts);

    thinking.textContent = answer.text;
    App.elements.chatEngine.textContent =
      answer.engine === "ai" ? "AI mode"
      : answer.engine === "local-fallback" ? "offline mode (AI unavailable)"
      : "offline mode";

    App.elements.chatSend.disabled = false;
    App.elements.chatLog.scrollTop = App.elements.chatLog.scrollHeight;
  },

  /* Add one bubble to the conversation and return it. */
  addMessage(who, text) {
    const bubble = document.createElement("div");
    bubble.className = "chat-msg chat-" + who;
    bubble.textContent = text;
    App.elements.chatLog.appendChild(bubble);
    App.elements.chatLog.scrollTop = App.elements.chatLog.scrollHeight;
    return bubble;
  },

  /* ---- Share ---- */

  /*
   * On a phone the native share sheet opens directly (WhatsApp, Twitter, ...).
   * On a desktop browser there is no share sheet, so the app opens its own
   * menu with the same destinations plus a Copy button.
   */
  async onShare() {
    if (!App.lastResult) return;

    const message = Share.buildMessage(App.lastResult.location, App.lastResult.weather);

    if (Share.isNativeAvailable()) {
      const shared = await Share.shareNative(message);
      if (shared) return;         // the user picked an app - nothing else to do
    }
    App.openShareMenu(message);
  },

  /* Build and show the fallback share menu. */
  openShareMenu(message) {
    const e = App.elements;
    e.sharePreview.textContent = message;

    e.shareTargets.innerHTML = "";
    Share.targets(message).forEach(target => {
      const link = document.createElement("a");
      link.className = "share-target";
      link.href = target.url;
      link.target = "_blank";
      link.rel = "noopener";
      link.innerHTML = `<span class="share-icon">${target.icon}</span>${target.name}`;
      e.shareTargets.appendChild(link);
    });

    e.shareMenu.classList.remove("hidden");
  },

  closeShareMenu() {
    App.elements.shareMenu.classList.add("hidden");
  },

  /* Copy the message to the clipboard and confirm it on the button. */
  async onCopy() {
    if (!App.lastResult) return;

    const message = Share.buildMessage(App.lastResult.location, App.lastResult.weather);
    const copied = await Share.copy(message);

    App.elements.copyButton.textContent = copied ? "Copied!" : "Press Ctrl+C to copy";
    setTimeout(() => { App.elements.copyButton.textContent = "Copy message"; }, 2000);
  },

  /* ---- Favourites ---- */

  onFavourite() {
    if (!App.lastResult) return;

    const city = App.lastResult.location.name;
    if (Favourites.has(city)) {
      Favourites.remove(city);
      App.elements.favouriteButton.textContent = "Add to Favourites";
    } else {
      Favourites.add(city);
      App.elements.favouriteButton.textContent = "Remove from Favourites";
    }
    App.renderFavourites();
  },

  /* ---- Small UI helpers ---- */

  showSpinner(visible) {
    App.elements.spinner.classList.toggle("hidden", !visible);
    App.elements.form.querySelector("button").disabled = visible;
  },

  showError(message) {
    App.elements.errorBox.textContent = message;
    App.elements.errorBox.classList.remove("hidden");
  },

  hideError() {
    App.elements.errorBox.classList.add("hidden");
  }
};

document.addEventListener("DOMContentLoaded", App.start);
