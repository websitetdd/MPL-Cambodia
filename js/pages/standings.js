/* ==========================================================================
 * pages/standings.js — full standings table + double-elimination bracket
 * ========================================================================== */

const PageStandings = (() => {

  function init() {
    renderTable();
    renderBracket();
  }

  /* --------------------------- Standings ---------------------------- */

  function renderTable() {
    const rows = Store.computeStandings();
    const wrap = $("#standingsTable");
    if (!wrap) return;

    const teamCell = (t) =>
      `<div class="team-cell">${UI.teamImg(t, 30).outerHTML}<span class="tc-name">${esc(t.name)}</span></div>`;

    wrap.innerHTML =
      `<table class="data-table">` +
      `<thead><tr>` +
      `<th>Rank</th><th>Team</th><th class="num">Matches</th><th class="num">Wins</th>` +
      `<th class="num">Losses</th><th class="num">Game diff</th><th class="num">Points</th><th>Qualification</th>` +
      `</tr></thead><tbody>` +
      rows
        .map((r) => {
          const tint = r.rank <= 2 ? " row-gold" : r.rank <= 6 ? " row-violet" : "";
          return (
            `<tr class="rank-${r.rank}${tint}">` +
            `<td class="rank-cell">${r.rank}</td>` +
            `<td>${teamCell(Store.teamById(r.team))}</td>` +
            `<td class="num">${r.matches}</td>` +
            `<td class="num win">${r.wins}</td>` +
            `<td class="num">${r.losses}</td>` +
            `<td class="num">${r.gameDiff > 0 ? "+" : ""}${r.gameDiff}</td>` +
            `<td class="num gold" style="font-weight:700;">${r.points}</td>` +
            `<td>${UI.qualBadge(r.rank)}</td>` +
            `</tr>`
          );
        })
        .join("") +
      `</tbody></table>`;
  }

  /* --------------------------- Bracket ------------------------------ */

  const COLUMNS = [
    { title: "Round 1", tone: "upper", matches: ["ub1", "ub2", "lb1"] },
    { title: "Semifinals", tone: "upper", matches: ["ub3", "ub4", "lb2"] },
    { title: "Finals", tone: "lower", matches: ["ub5", "lb3", "lb4"] },
    { title: "Grand final", tone: "final", matches: ["gf", "gf2"] },
  ];

  function renderBracket() {
    const root = $("#bracket");
    if (!root) return;
    const pMs = Store.playoffMatches();
    const standingsRows = Store.computeStandings();

    // Resolve team id for each match slot
    function teamFor(m, slot) {
      return Store.resolveParticipant(m[slot], pMs, standingsRows);
    }

    // Winner of a match, or null
    function winnerOf(id) {
      const m = pMs.find((x) => x.id === id);
      return m && m.status === "finished" && m.result ? m.result.winner : null;
    }

    function teamRow(m, slot) {
      const t = teamFor(m, slot);
      // Compare against the RESOLVED team id — stored participants of bracket
      // fixtures are seed/ref objects, never plain team ids
      const isWinner = m.status === "finished" && m.result && !!t && m.result.winner === t;
      if (t) {
        const team = Store.teamById(t);
        const score = m.status === "finished" && m.result ? (slot === "teamA" ? m.result.scoreA : m.result.scoreB) : null;
        return (
          `<div class="bm-team${isWinner ? " winner" : ""}">` +
          `${UI.teamImg(team, 20).outerHTML}` +
          `<span class="bm-name">${esc(team ? team.name : "?")}</span>` +
          (score !== null ? `<span class="bm-score">${score}</span>` : "") +
          `</div>`
        );
      }
      // TBD — show source
      const ref = m[slot] && m[slot].value;
      const srcLabel = ref ? ref.replace("-", " · ").toUpperCase() : "TBD";
      return `<div class="bm-team tbd">${esc(srcLabel)}</div>`;
    }

    const renderMatch = (m) => {
      if (!m) return "";
      const state = m.status === "finished" ? " done" : m.status === "pending" ? "" : "";
      return (
        `<div class="bracket-match${state}">` +
        teamRow(m, "teamA") +
        teamRow(m, "teamB") +
        `<div class="bm-label">${formatDate(m.date)}${m.bo ? " · Bo" + m.bo : ""}</div>` +
        (m.note ? `<div class="bm-label" style="color:var(--violet);">${esc(m.note)}</div>` : "") +
        `</div>`
      );
    };

    // Champion = Grand Final winner (or pending)
    const champId = winnerOf("gf") || winnerOf("gf2");

    root.innerHTML = COLUMNS.map(
      (col) =>
        `<div class="bracket-col ${col.tone}">` +
        `<div class="bcol-title">${col.title}</div>` +
        col.matches.map((id) => renderMatch(pMs.find((m) => m.id === id))).join("") +
        (col.tone === "final"
          ? `<div class="bracket-winner-box">Champion: ${champId ? esc(Store.teamById(champId)?.name || "?") : "TBD"}</div>`
          : "") +
        `</div>`
    ).join("");

    // Playoff date header
    const p = Store.get("playoff");
    if (p && p.dates) $("#playoffDates").textContent = p.dates;
  }

  return { init };
})();
