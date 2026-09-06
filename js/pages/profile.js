/* ==========================================================================
 * pages/profile.js — identity, stats, season picks, upcoming predictions,
 * recent history
 * ========================================================================== */

const PageProfile = (() => {

  function renderGate() {
    const user = Auth.current();
    $("#profileLoginGate").classList.toggle("hidden", !!user);
    $("#profileContent").classList.toggle("hidden", !user);
    if (user) renderAll(user);
  }

  function renderAll(user) {
    const record = Store.predictionsFor(user) || { matches: {}, top6: null, champion: null };
    const stats = Scoring.userStats(record);
    const lb = Scoring.leaderboard();
    const myRank = lb.find((r) => r.username === user)?.rank || "—";

    // Identity
    $("#pfAvatar").textContent = initials(user);
    $("#pfUsername").textContent = user;
    const u = Store.getUser(user);
    $("#pfJoined").textContent = u && u.createdAt ? "Joined " + formatLongDate(u.createdAt.slice(0, 10)) : "Joined —";
    $("#pfPoints").textContent = stats.total;
    $("#pfRank").textContent = lb.length ? "#" + myRank : "—";

    // Stats grid
    const upcomingPredicted = Object.keys(record.matches || {})
      .map((id) => Store.matchById(id))
      .filter((m) => m && m.status !== "finished").length;

    // Count only predictions whose match still exists (deleted matches are ignored)
    const validPredictions = Object.keys(record.matches || {})
      .map((id) => Store.matchById(id))
      .filter(Boolean).length;

    $("#pfStatsGrid").innerHTML =
      statCard("Predictions made", validPredictions) +
      statCard("Correct predictions", stats.correct, "win") +
      statCard("Accuracy", stats.accuracy === null ? "—" : stats.accuracy + "%") +
      statCard("Upcoming predicted", upcomingPredicted) +
      statCard("Top 6 points", stats.top6Points) +
      statCard("Champion points", stats.champPoints);

    // Champion pick
    const champBox = $("#pfChamp");
    if (record.champion) {
      const t = Store.teamById(record.champion);
      const champ = Scoring.championOf();
      const chip = champ
        ? stats.champStatus === "correct"
          ? '<span class="badge badge-win">Correct +500</span>'
          : '<span class="badge badge-loss">Wrong</span>'
        : '<span class="badge badge-muted">Pending</span>';
      champBox.innerHTML =
        `<div class="flex gap-12">${UI.teamImg(t, 40).outerHTML}` +
        `<div><b>${esc(t ? t.name : "?")}</b><div class="mt-8">${chip}</div></div></div>`;
    } else {
      champBox.innerHTML = '<div class="muted">No champion pick yet — make one on the Predictions page.</div>';
    }

    // Top 6 pick
    const top6Box = $("#pfTop6");
    if (record.top6 && record.top6.length) {
      top6Box.innerHTML = record.top6.slice(0, 6).map((id, i) => {
        const t = Store.teamById(id);
        return `<li class="badge badge-violet" style="font-size:.82rem;">${i + 1}. ${esc(t ? t.shortName || t.tag : "?")}</li>`;
      }).join("");
    } else {
      top6Box.innerHTML = '<li class="muted">No Top 6 pick yet.</li>';
    }

    // Upcoming predicted matches
    const upBox = $("#pfUpcoming");
    const ups = Object.keys(record.matches || {})
      .map((id) => ({ id, match: Store.matchById(id) }))
      .filter((x) => x.match && x.match.status !== "finished")
      .sort((a, b) => new Date(a.match.date) - new Date(b.match.date));
    upBox.innerHTML = ups.length
      ? ups.map(({ id, match }) => {
          const a = Store.teamById(match.teamA);
          const b = Store.teamById(match.teamB);
          const pred = record.matches[id];
          return (
            `<div class="match-card">` +
            `<div class="mc-top"><span class="badge badge-violet">${esc(match.weekLabel || "")}</span>` +
            `<span class="badge badge-gold">${formatDate(match.date)} · ${formatTime(match.date)}</span></div>` +
            `<div class="mc-teams">` +
            `<div class="team-block">${UI.teamImg(a, 40).outerHTML}<div class="t-name">${esc(a ? a.name : "?")}</div></div>` +
            `<div class="vs">VS</div>` +
            `<div class="team-block">${UI.teamImg(b, 40).outerHTML}<div class="t-name">${esc(b ? b.name : "?")}</div></div>` +
            `</div>` +
            `<div class="flex-center"><span class="badge badge-gold">Pick: ${esc(Store.teamById(pred.winner)?.shortName || "?")}${pred.score ? " (" + pred.score + ")" : ""}</span></div>` +
            `</div>`
          );
        }).join("")
      : '<div class="empty"><div class="e-icon">🎯</div><div>No upcoming matches predicted yet.</div></div>';

    // Recent history (last 8)
    const histBox = $("#pfHistory");
    const entries = Object.entries(record.matches || {})
      .map(([id, pred]) => ({ id, pred, match: Store.matchById(id) }))
      .filter((x) => x.match)
      .sort((a, b) => new Date(b.match.date) - new Date(a.match.date))
      .slice(0, 8);
    histBox.innerHTML =
      `<table class="data-table">` +
      `<thead><tr><th>Match</th><th>Your pick</th><th>Result</th><th class="num">Points</th><th>Status</th></tr></thead><tbody>` +
      entries.map(({ pred, match }) => {
        const s = Scoring.scoreMatch(pred, match);
        const a = Store.teamById(match.teamA);
        const b = Store.teamById(match.teamB);
        const chip = s.status === "pending"
          ? '<span class="badge badge-muted">Pending</span>'
          : s.status === "correct"
          ? '<span class="badge badge-win">Correct</span>'
          : '<span class="badge badge-loss">Wrong</span>';
        return (
          `<tr>` +
          `<td><b>${esc(a ? a.name : "?")}</b> vs <b>${esc(b ? b.name : "?")}</b></td>` +
          `<td>${esc(Store.teamById(pred.winner)?.shortName || "?")}${pred.score ? " (" + pred.score + ")" : ""}</td>` +
          `<td class="num">${match.status === "finished" ? UI.scoreText(match) : "—"}</td>` +
          `<td class="num">${s.status === "pending" ? "—" : "+" + s.points}</td>` +
          `<td>${chip}</td></tr>`
        );
      }).join("") +
      `</tbody></table>`;
    if (!entries.length) histBox.innerHTML = '<div class="empty">No predictions yet.</div>';
  }

  function statCard(label, value, tone = "") {
    return `<div class="stat-card"><div class="sc-value ${tone}">${esc(String(value))}</div><div class="sc-label">${esc(label)}</div></div>`;
  }

  function init() {
    renderGate();
    $("#profileLoginBtn").addEventListener("click", () => UI.openAuth());
    window.addEventListener("auth:change", renderGate);
  }

  return { init, renderGate };
})();
