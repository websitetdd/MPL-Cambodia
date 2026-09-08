/* ==========================================================================
 * store.js — data layer
 *
 * JSON files (data/*.json) act as the read-only seed. Every change made by
 * the admin panel is persisted as a LocalStorage override under the same
 * collection key. Readers merge: LocalStorage first, seed as fallback.
 *
 * GitHub Pages note: LocalStorage is per-browser. To share data across all
 * users, a real backend (Firebase / Supabase / PocketBase) is required —
 * see README.md.
 * ========================================================================== */

const Store = (() => {
  const PREFIX = "mpl_";
  const writeHooks = [];
  let pulling = false;
  const KEYS = {
    teams: "teams",
    matches: "matches",       // regular season matches
    playoff: "playoff",       // playoff bracket matches
    news: "news",
    config: "config",
    users: "users",
    session: "session",
    admin: "admin",
    adminSession: "adminSession",
    predictions: "predictions",
  };

  /** Load a JSON seed file (throws if offline/file://) */
  async function loadJson(file) {
    const res = await fetch(`data/${file}`);
    if (!res.ok) throw new Error(`Failed to load ${file} (${res.status})`);
    return res.json();
  }

  /** Seed collections populated at boot */
  let seed = null;

  /** Fetch all seed files once */
  async function init() {
    const [teams, matches, playoff, news, config] = await Promise.all([
      loadJson("teams.json"),
      loadJson("matches.json"),
      loadJson("playoff.json"),
      loadJson("news.json"),
      loadJson("config.json"),
    ]);
    seed = { teams, matches, playoff, news, config };
    // Seed the default admin account on first run
    ensureAdminSeed(config);
    return seed;
  }

  function lsGet(key) {
    try {
      const raw = localStorage.getItem(PREFIX + key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  }

  function lsSet(key, value) {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  }

  function lsRemove(key) {
    localStorage.removeItem(PREFIX + key);
  }

  /** Get a collection: override if present, else seed */
  function get(key) {
    const override = lsGet(key);
    if (override !== null) return override;
    return seed && seed[key] ? seed[key] : null;
  }

  /** Persist a full collection override (also notifies cloud sync hooks) */
  function save(key, value) {
    lsSet(key, value);
    if (!pulling) writeHooks.forEach((fn) => fn(key, value));
  }

  /** Register a hook called after every save() (used by Cloud) */
  function onWrite(fn) {
    writeHooks.push(fn);
  }

  /** Remove the local override (back to seed) */
  function reset(key) {
    lsRemove(key);
  }

  /* ------------------------------------------------------------------
   * Convenience accessors
   * ------------------------------------------------------------------ */

  function teams() {
    const t = get("teams");
    return (t && t.teams) || [];
  }

  function teamById(id) {
    return teams().find((t) => t.id === id) || null;
  }

  function matches() {
    const m = get("matches");
    return (m && m.matches) || [];
  }

  function playoffMatches() {
    const p = get("playoff");
    return (p && p.matches) || [];
  }

  /** True when a match belongs to the playoffs, wherever it is stored:
   *  - bracket fixtures (their ids live in the playoff store),
   *  - matches explicitly stamped stage:"playoffs",
   *  - matches created under the config's "Playoffs" week (week/weekLabel).
   *  Playoff results must never feed the regular-season standings. */
  function isPlayoffMatch(m) {
    if (!m) return false;
    if (m.stage === "playoffs" || m.type === "playoffs") return true;
    if (playoffMatches().some((p) => p.id === m.id)) return true;
    const weeks = (config().tournament && config().tournament.weeks) || [];
    const pw = weeks.find((w) => /playoff/i.test(w.label || ""));
    if (pw) {
      if (m.week !== undefined && Number(m.week) === Number(pw.num)) return true;
      if (m.weekLabel && String(m.weekLabel).toLowerCase() === String(pw.label).toLowerCase()) return true;
    }
    return false;
  }

  /** Regular-season matches only (playoff-classified matches excluded).
   *  Source of truth for standings and season-end gating. */
  function regularMatches() {
    return matches().filter((m) => !isPlayoffMatch(m));
  }

  /** All matches (regular + playoff), used by predictions/history */
  function allMatches() {
    return [...matches(), ...playoffMatches()];
  }

  function matchById(id) {
    return allMatches().find((m) => m.id === id) || null;
  }

  function news() {
    const n = get("news");
    return (n && n.news) || [];
  }

  function config() {
    const c = get("config");
    return c || {};
  }

  function saveConfig(c) {
    save("config", c);
  }

  function saveMatches(list) {
    save("matches", { matches: list });
  }

  function savePlayoff(list) {
    save("playoff", { ...get("playoff"), matches: list });
  }

  function saveTeams(list) {
    save("teams", { teams: list });
  }

  function saveNews(list) {
    save("news", { news: list });
  }

  /* ------------------------------------------------------------------
   * Admin account
   * ------------------------------------------------------------------ */

  function ensureAdminSeed(configSeed) {
    if (!lsGet("admin")) {
      const cfg = configSeed || seed.config || {};
      const a = (cfg.admin && cfg.admin.username) || "admin";
      const p = (cfg.admin && cfg.admin.password) || "admin123";
      lsSet("admin", { username: a, passwordHash: hash(p) });
    }
  }

  function getAdmin() {
    ensureAdminSeed();
    return lsGet("admin") || { username: "admin", passwordHash: hash("admin123") };
  }

  function setAdmin(username, password) {
    lsSet("admin", { username, passwordHash: hash(password) });
  }

  /* ------------------------------------------------------------------
   * User accounts + session
   * ------------------------------------------------------------------ */

  function users() {
    return lsGet("users") || {};
  }

  function saveUsers(u) {
    lsSet("users", u);
  }

  function getUser(name) {
    return users()[name] || null;
  }

  function currentUser() {
    return lsGet("session");
  }

  function setSession(name) {
    if (name) lsSet("session", name);
    else lsRemove("session");
  }

  /* ------------------------------------------------------------------
   * Predictions (per user)
   * ------------------------------------------------------------------ */

  function allPredictions() {
    return lsGet("predictions") || {};
  }

  function predictionsFor(username) {
    return allPredictions()[username] || null;
  }

  function savePredictionsFor(username, data) {
    const all = allPredictions();
    all[username] = data;
    lsSet("predictions", all);
    // Cloud mode: push to Supabase so the data follows the user across devices
    if (typeof Cloud !== "undefined" && Cloud.enabled()) Cloud.pushPredictions(username, data);
  }

  /* ------------------------------------------------------------------
   * Standings engine
   * Points per win are admin-configurable per score line
   * (config.standingsPoints, e.g. { "2-0": 3, "2-1": 2 }); default 1.
   * Ranking: 1) total points  2) head-to-head  3) game difference.
   * ------------------------------------------------------------------ */

  function standingsPointsFor(scoreStr, isWin) {
    const cfg = config() || {};
    const sp = cfg.standingsPoints || { "2-0": 1, "2-1": 1, "1-2": 0, "0-2": 0 };
    const v = Number(sp[scoreStr]);
    if (Number.isFinite(v) && v >= 0) return v;
    return isWin ? 1 : 0; // default: win = 1, loss = 0
  }

  function computeStandings() {
    const ts = teams();
    // Playoffs never count here — only regular-season finished matches
    const ms = regularMatches().filter((m) => m.status === "finished" && m.result);

    const rows = ts.map((t) => {
      const row = {
        team: t.id,
        matches: 0,
        wins: 0,
        losses: 0,
        gamesFor: 0,
        gamesAgainst: 0,
        points: 0,
        gameDiff: 0,
      };
      ms.forEach((m) => {
        const isA = m.teamA === t.id;
        const isB = m.teamB === t.id;
        if (!isA && !isB) return;
        row.matches += 1;
        const myScore = isA ? m.result.scoreA : m.result.scoreB;
        const oppScore = isA ? m.result.scoreB : m.result.scoreA;
        row.gamesFor += myScore;
        row.gamesAgainst += oppScore;
        if (m.result.winner === t.id) {
          row.wins += 1;
          // Winner's score line decides the points (2-0 may differ from 2-1)
          row.points += standingsPointsFor(`${myScore}-${oppScore}`, true);
        } else {
          row.losses += 1;
          // Losers can also earn points from their score line (e.g. 1-2)
          row.points += standingsPointsFor(`${myScore}-${oppScore}`, false);
        }
      });
      row.gameDiff = row.gamesFor - row.gamesAgainst;
      return row;
    });

    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      // Head-to-head: only decisive when the two teams have played and one leads
      const h2h = h2hWinner(a.team, b.team, ms);
      if (h2h) return h2h === a.team ? -1 : 1;
      if (b.gameDiff !== a.gameDiff) return b.gameDiff - a.gameDiff;
      return (teamsById(a.team).name || "").localeCompare(teamsById(b.team).name || "");
    });

    // Attach rank numbers
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  function teamsById(id) {
    return teamById(id) || { name: id };
  }

  /** Returns the team that wins the head-to-head between a & b, or null */
  function h2hWinner(aId, bId, finishedMatches) {
    let aWins = 0;
    let bWins = 0;
    finishedMatches.forEach((m) => {
      const isA = m.teamA === aId && m.teamB === bId;
      const isB = m.teamA === bId && m.teamB === aId;
      if (!isA && !isB) return;
      if (m.result.winner === aId) aWins += 1;
      else if (m.result.winner === bId) bWins += 1;
    });
    if (aWins === bWins) return null; // not played or split — not decisive
    return aWins > bWins ? aId : bId;
  }

  /* ------------------------------------------------------------------
   * Playoff bracket helpers
   * Participants: "seed:N" or "W-<id>" / "L-<id>" references
   * ------------------------------------------------------------------ */

  /** Resolve a bracket participant to a team id, given the playoff matches */
  function resolveParticipant(participant, playoffMs, standingsRows) {
    if (!participant) return null;
    if (participant.type === "seed") {
      const row = standingsRows.find((r) => r.rank === participant.value);
      return row ? row.team : null;
    }
    if (participant.type === "ref") {
      const ref = participant.value; // e.g. "W-ub1"
      const [winLoss, matchId] = ref.split("-");
      const m = playoffMs.find((x) => x.id === matchId);
      if (m && m.status === "finished" && m.result) {
        return winLoss === "W" ? m.result.winner : (m.result.winner === m.teamA ? m.teamB : m.teamA);
      }
      return null;
    }
    return null;
  }

  return {
    init, get, save, reset, lsGet, lsSet, lsRemove, onWrite,
    get pulling() { return pulling; },
    set pulling(v) { pulling = v; },
    teams, teamById, matches, regularMatches, playoffMatches, allMatches, matchById,
    isPlayoffMatch,
    news, config, saveConfig, saveMatches, savePlayoff, saveTeams, saveNews,
    getAdmin, setAdmin,
    users, saveUsers, getUser, currentUser, setSession,
    allPredictions, predictionsFor, savePredictionsFor,
    computeStandings, resolveParticipant,
  };
})();
