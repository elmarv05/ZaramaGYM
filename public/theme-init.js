(function () {
  try {
    var stored = localStorage.getItem('zaramagym-theme');
    var prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var isDark = stored === 'dark' || (!stored && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
    if (stored === 'light' || stored === 'dark') {
      var meta = document.querySelector('meta[name="color-scheme"]');
      if (meta) meta.setAttribute('content', stored);
    }
  } catch (e) {}
})();
