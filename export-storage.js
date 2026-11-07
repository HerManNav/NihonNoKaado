(() => {
  const native = window.Capacitor?.Plugins?.DictionaryExport;
  // Forget folder handles saved by the earlier directory-selection feature.
  try { window.indexedDB?.deleteDatabase("japanese-cards-settings"); } catch { }

  function destination() {
    return native ? "Downloads folder (internal storage / Download)"
      : "Your browser’s default download location. Check your browser’s download settings for the exact folder.";
  }

  async function save(filename, contents) {
    if (native) return native.save({ filename, contents });
    const url = URL.createObjectURL(new Blob([contents], { type: "application/json;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { downloaded: true };
  }

  window.JapaneseCardsExport = { destination, save, isNative: Boolean(native) };
})();
