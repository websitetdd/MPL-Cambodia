/* ==========================================================================
 * cloud.js — Supabase sync layer (global mode)
 *
 * When js/supabase-config.js contains real project keys, the site runs in
 * "cloud mode": tournament data, logins, predictions and admin writes are
 * stored in Supabase and shared across every device. The existing
 * LocalStorage code keeps working unchanged — cloud mode simply syncs it:
 *
 *   boot  → pull cloud data into LocalStorage overrides (renders as before)
 *   save  → push LocalStorage writes back to Supabase
 *
 * If the config is empty, Cloud.init() is a no-op and the site stays in
 * pure LocalStorage mode.
 * ========================================================================== */

const Cloud = (() => {
  let sb = null;
  let enabled = false;
  let currentUsername = null;

  // How long we wait for Supabase to answer before falling back to local mode.
  // A dead/paused/renamed project must never stall the site for visitors.
  const PROBE_TIMEOUT_MS = 6000;

  const COLLECTIONS = ["teams", "matches", "playoff_matches", "news"];

  function configured() {
    const c = window.SUPABASE_CONFIG || {};
    return !!(c.url && c.anonKey);
  }

  /** Resolve with the call result, or null after `ms` — never rejects. */
  function withTimeout(promise, ms) {
    return new Promise((resolve) => {
      const timer = setTimeout(() => resolve(null), ms);
      promise.then(
        (v) => { clearTimeout(timer); resolve(v); },
        () => { clearTimeout(timer); resolve(null); }
      );
    });
  }

  /** "john.doe@x.com" → "john_doe" (matches the app's username rules) */
  function usernameOf(email) {
    let u = String(email || "").split("@")[0].toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 20);
    while (u.length < 3) u += "_";
    return u;
  }

  async function init() {
    if (!configured()) return false;
    if (!window.supabase) {
      console.warn("supabase-js not loaded; cloud mode off");
      return false;
    }
    const c = window.SUPABASE_CONFIG;
    sb = window.supabase.createClient(c.url, c.anonKey);

    // Reachability probe (bounded): `settings` is readable by anon users per
    // the shipped RLS policies, so this fails fast on a dead project, a wrong
    // URL, or a missing schema — and the site falls back to local mode
    // instead of hanging or half-initialising cloud.
    const probe = await withTimeout(sb.from("settings").select("key").limit(1), PROBE_TIMEOUT_MS);
    if (!probe || probe.error) {
      console.warn(
        "Supabase unreachable or not set up — running in local mode:",
        probe && probe.error ? probe.error.message : "no response within " + PROBE_TIMEOUT_MS + "ms"
      );
      sb = null;
      return false;
    }
    enabled = true;

    try {
      Store.onWrite(pushCollectionWrite);

      // 1) Pull shared tournament data
      await pullAll();

      // 2) Restore the signed-in user (session survives refresh via supabase-js)
      const { data: { session } } = await sb.auth.getSession();
      if (session && session.user) {
        currentUsername = usernameOf(session.user.email);
        Store.setSession(currentUsername);
        await pullPredictions(currentUsername);
        await syncProfile(currentUsername, session.user.id);
        const prof = await getProfile(currentUsername);
        if (prof && prof.is_admin) Store.lsSet("adminSession", { at: Date.now() });
        else Store.lsRemove("adminSession");
      }
    } catch (err) {
      // e.g. tables dropped mid-session — fall back to local mode quietly
      console.warn("cloud init failed, running in local mode:", err.message);
      enabled = false;
      sb = null;
      return false;
    }
    return true;
  }

  /* --------------------------- Pull (cloud → local) -------------------- */

  async function pullAll() {
    Store.pulling = true;
    try {
      for (const table of COLLECTIONS) {
        const { data, error } = await sb.from(table).select("id, data");
        if (error) continue;
        const items = (data || []).map((r) => r.data).filter(Boolean);
        const key = table === "playoff_matches" ? "playoff" : table;
        // IMPORTANT: an EMPTY cloud table must not wipe the built-in seed
        // data. A fresh Supabase project has zero rows until the admin first
        // saves something — treating that as "delete everything" made the
        // playoff bracket (and teams/matches/news) disappear for everyone.
        // Cloud only becomes authoritative once it actually has rows.
        if (!items.length) continue;
        Store.save(key, { [key === "playoff" ? "matches" : key]: items });
      }
      const { data: cfgRows } = await sb.from("settings").select("key, value").eq("key", "config");
      // Same rule: no saved settings row yet → keep the seed config
      if (cfgRows && cfgRows.length) Store.save("config", cfgRows[0].value);
    } finally {
      Store.pulling = false;
    }
  }

  async function pullPredictions(username) {
    const { data } = await sb.from("predictions").select("username, data").eq("username", username);
    if (data && data.length) {
      const all = Store.allPredictions();
      all[username] = data[0].data;
      Store.lsSet("predictions", all);
    }
  }

  async function getProfile(username) {
    const { data } = await sb.from("profiles").select("*").eq("username", username);
    return data && data.length ? data[0] : null;
  }

  /** Upsert the public profile row (leaderboard + stats).
   *  NOTE: is_admin is intentionally NEVER written here — it is granted only
   *  via the SQL setup, so a normal login can never reset or self-grant it.
   *  On insert the DB default (false) applies; on conflict it stays untouched. */
  async function syncProfile(username, userId) {
    const stats = Scoring.userStats(Store.predictionsFor(username));
    const { error } = await sb.from("profiles").upsert(
      {
        username,
        user_id: userId,
        points_total: stats.total,
        correct: stats.correct,
        finished: stats.finished,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "username" }
    );
    if (error) console.warn("profile sync:", error.message);
  }

  /* --------------------------- Push (local → cloud) -------------------- */

  async function pushCollectionWrite(key, value) {
    if (!enabled || Store.pulling) return;
    try {
      if (key === "config") {
        await sb.from("settings").upsert({ key: "config", value });
        return;
      }
      const table = key === "playoff" ? "playoff_matches" : key;
      if (!COLLECTIONS.includes(table)) return;
      const items = (value && value[key === "playoff" ? "matches" : key]) || [];
      if (items.length) {
        await sb.from(table).upsert(items.map((i) => ({ id: i.id, data: i })));
        await sb.from(table).delete().not("id", "in", items.map((i) => i.id));
      } else {
        await sb.from(table).delete().neq("id", "");
      }
    } catch (err) {
      console.warn("cloud push failed:", err.message);
      // Surface the failure — otherwise a rejected write silently reverts on
      // the next page load and admin edits look like they "didn't save".
      if (typeof UI !== "undefined" && UI.toast) {
        UI.toast("Cloud save failed — log in with the admin account and try again.", "error");
      }
    }
  }

  /** Called by Store.savePredictionsFor after a user saves predictions */
  async function pushPredictions(username, data) {
    if (!enabled) return;
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return;
    await sb.from("predictions").upsert(
      {
        username,
        user_id: user.id,
        data,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "username" }
    );
    await syncProfile(username, user.id); // refresh leaderboard numbers
  }

  /* ------------------------------- Auth -------------------------------- */

  async function signUp(email, password) {
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) return { ok: false, error: error.message };
    // If email confirmation is disabled the session is active immediately;
    // otherwise try a direct sign-in so the user isn't blocked.
    if (!data.session) {
      const s = await sb.auth.signInWithPassword({ email, password });
      if (s.error) return { ok: false, error: "Check your inbox to confirm your email, then log in." };
    }
    return finalizeSignIn(email);
  }

  async function signIn(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) return { ok: false, error: "Invalid email or password." };
    return finalizeSignIn(email);
  }

  async function finalizeSignIn(email) {
    const username = usernameOf(email);
    currentUsername = username;
    Store.setSession(username);
    await pullPredictions(username);
    const { data: { user } } = await sb.auth.getUser();
    if (user) await syncProfile(username, user.id);
    const prof = await getProfile(username);
    if (prof && prof.is_admin) Store.lsSet("adminSession", { at: Date.now() });
    else Store.lsRemove("adminSession");
    return { ok: true };
  }

  async function signOut() {
    await sb.auth.signOut();
    currentUsername = null;
    Store.setSession(null);
    Store.lsRemove("adminSession");
  }

  /** Admin login: standard auth + require the admin flag */
  async function adminLogin(email, password) {
    const res = await signIn(email, password);
    if (!res.ok) return res;
    const prof = await getProfile(usernameOf(email));
    if (!prof || !prof.is_admin) {
      await sb.auth.signOut();
      Store.setSession(null);
      return { ok: false, error: "This account is not an admin. Mark it in the SQL setup (Step 2)." };
    }
    Store.lsSet("adminSession", { at: Date.now() });
    return { ok: true };
  }

  return {
    init, enabled: () => enabled, usernameOf,
    signUp, signIn, signOut, adminLogin,
    pushPredictions,
  };
})();
