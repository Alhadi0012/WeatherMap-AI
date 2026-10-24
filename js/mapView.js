/*
 * Map layer: everything that touches Leaflet lives here.
 * The map is created once and then only re-centred - the page never redraws.
 */
const MapView = {
  map: null,
  marker: null,

  /* Create the map and the tile layer. */
  init() {
    MapView.map = L.map("map");
    MapView.map.setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);

    // CARTO basemap (built on OpenStreetMap data). It is used instead of the
    // raw OSM tile servers because those reject requests coming from a page
    // opened directly as a local file, which produces 403 "Access blocked" tiles.
        L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: "&copy; OpenStreetMap contributors",
      maxZoom: 19
    }).addTo(MapView.map);
  },

  /* Centre the map on the location and open the weather InfoWindow. */
  showWeather(location, weather) {
    MapView.map.setView([location.lat, location.lon], CONFIG.LOCATED_ZOOM);

    if (MapView.marker) MapView.map.removeLayer(MapView.marker);
    MapView.marker = L.marker([location.lat, location.lon]).addTo(MapView.map);

    MapView.marker.bindPopup(MapView.buildPopup(location, weather)).openPopup();
  },

  /* The HTML shown inside the map bubble. */
  buildPopup(location, weather) {
    return `
      <div class="popup-title">${weather.icon} ${location.name}</div>
      <div class="popup-temp">${weather.temperature}&deg;C</div>
      <div>${weather.description}</div>
      <div>Feels like ${weather.feelsLike}&deg;C</div>
      <div>Humidity ${weather.humidity}% &middot; Wind ${weather.wind} km/h</div>`;
  }
};
