/*
 * Share layer: builds the weather message and sends it out.
 *
 * Two paths are supported, exactly as the specification asks:
 *   1. Web Share API  - on phones and modern browsers, opens the real share
 *                       sheet so the user can pick WhatsApp, Twitter, etc.
 *   2. Fallback menu  - on desktop browsers that have no share sheet, the app
 *                       shows its own menu with direct links plus Copy.
 */
const Share = {

  /* Build the formatted message that gets shared or copied. */
  buildMessage(location, weather) {
    return `${weather.icon} Weather in ${location.name}: ` +
           `${weather.temperature}°C, ${weather.description}, ` +
           `feels like ${weather.feelsLike}°C, ` +
           `humidity ${weather.humidity}%, wind ${weather.wind} km/h. ` +
           `(shared from WeatherMap)`;
  },

  /* True when the browser can open a native share sheet. */
  isNativeAvailable() {
    return typeof navigator !== "undefined" && typeof navigator.share === "function";
  },

  /* Open the native share sheet. Returns true when the user shared. */
  async shareNative(message) {
    try {
      await navigator.share({ title: "WeatherMap", text: message });
      return true;
    } catch (error) {
      return false;        // the user simply closed the sheet - not an error
    }
  },

  /* Direct links used by the fallback menu. */
  targets(message) {
    const text = encodeURIComponent(message);
    return [
      { name: "WhatsApp", icon: "💬", url: `https://wa.me/?text=${text}` },
      { name: "X (Twitter)", icon: "🐦", url: `https://twitter.com/intent/tweet?text=${text}` },
      { name: "Telegram", icon: "✈️", url: `https://t.me/share/url?url=&text=${text}` },
      { name: "Email", icon: "✉️", url: `mailto:?subject=Weather%20update&body=${text}` }
    ];
  },

  /*
   * Copy to the clipboard.
   * The modern Clipboard API needs a secure context (https or localhost), so a
   * page opened straight from the file system falls back to the old method.
   */
  async copy(message) {
    try {
      if (navigator.clipboard && window.isSecureContext !== false) {
        await navigator.clipboard.writeText(message);
        return true;
      }
    } catch (error) {
      // fall through to the legacy method below
    }
    return Share.copyLegacy(message);
  },

  /* Old but widely supported copy method: a hidden textarea plus execCommand. */
  copyLegacy(message) {
    try {
      const field = document.createElement("textarea");
      field.value = message;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(field);
      return copied;
    } catch (error) {
      return false;
    }
  }
};
