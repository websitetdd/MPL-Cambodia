/* ==========================================================================
 * app.js — application boot
 * Loads the seed data (data/*.json), then initialises the current page.
 *
 * NOTE: page modules are top-level `const` bindings (classic scripts), so
 * they are NOT on `window` — dispatch via typeof checks.
 * ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await Store.init();
  } catch (err) {
    console.error("Failed to load seed data:", err);
    // Seed JSON unreachable (e.g. opened directly from file://) — show a hint
    const main = $("#main");
    if (main) {
      main.innerHTML =
        `<section class="section"><div class="container">` +
        `<div class="card max-640">` +
        `<h2 class="section-title">Data could not be loaded</h2>` +
        `<p class="text-2 mt-8">The site reads its data from JSON files, which requires serving the folder over HTTP.</p>` +
        `<p class="text-2 mt-8">GitHub Pages serves it automatically. Locally, run a simple static server inside the project folder:</p>` +
        `<pre class="mt-16" style="background:var(--card-2);border:1px solid var(--border);border-radius:8px;padding:12px;font-size:.85rem;overflow-x:auto;">python3 -m http.server 8080</pre>` +
        `<p class="muted mt-8" style="font-size:.85rem;">Then open http://localhost:8080</p>` +
        `</div></div></section>`;
    }
    UI.boot();
    return;
  }

  // Cloud mode: sync shared data + restore session before rendering
  try {
    await Cloud.init();
  } catch (err) {
    console.warn("Cloud init skipped:", err.message);
  }

  UI.boot();

  const page = document.body.dataset.page;
  const inits = {
    home: () => typeof PageHome !== "undefined" && PageHome.init(),
    standings: () => typeof PageStandings !== "undefined" && PageStandings.init(),
    predictions: () => typeof PagePredictions !== "undefined" && PagePredictions.init(),
    profile: () => typeof PageProfile !== "undefined" && PageProfile.init(),
    admin: () => typeof PageAdmin !== "undefined" && PageAdmin.init(),
  };
  if (inits[page]) {
    try {
      inits[page]();
    } catch (err) {
      console.error("Page init error:", err);
      UI.toast("Something went wrong loading this page.", "error");
    }
  }
});
