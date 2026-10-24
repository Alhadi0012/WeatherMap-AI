/* Favourite cities, stored in the browser with LocalStorage. */
const Favourites = {
  KEY: "weathermap.favourites",

  all() {
    try {
      return JSON.parse(localStorage.getItem(Favourites.KEY)) || [];
    } catch (error) {
      return [];          // corrupted storage should never break the app
    }
  },

  add(city) {
    const list = Favourites.all();
    if (!list.includes(city)) {
      list.push(city);
      localStorage.setItem(Favourites.KEY, JSON.stringify(list));
    }
    return list;
  },

  remove(city) {
    const list = Favourites.all().filter(item => item !== city);
    localStorage.setItem(Favourites.KEY, JSON.stringify(list));
    return list;
  },

  has(city) {
    return Favourites.all().includes(city);
  }
};
