/* ==========================================================================
 * pages/home.js — Home: live stream, match cards + countdowns, mini standings
 * ========================================================================== */

const PageHome = (() => {
  let ticker = null;

  function init() {
    renderStream();
    renderWeekBadge();
    renderNextMatch();
    buildFilters();
    renderMatchGrid();
    renderMiniStandings();
    renderNews();
    startTicker();
  }

  /** Show the admin-set "current week" in the matches section header */
  function renderWeekBadge() {
    const el = $("#matchesWeekLabel");
    if (!el) return;
    const cfg = Store.config();
    const t = cfg.tournament || {};
    const wk = (t.weeks || []).find((w) => w.num === t.currentWeek);
    el.textContent = wk ? `${wk.label}${wk.dates ? " · " + wk.dates : ""}` : "Season 2026";
  }

  /* ----------------------------- Stream ----------------------------- */

  function renderStream() {
    const cfg = Store.config();
    const live = cfg.live || {};
    const panel = $("#streamPanel");
    const watchBtn = $("#watchBtn");
    const embed = youtubeEmbedUrl(live.url);

    if (embed) {
      panel.innerHTML = `<iframe src="${embed}" title="${esc(live.title || "MPL Cambodia stream")}" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe>`;
      watchBtn.href = live.url;
      watchBtn.classList.remove("hidden");
    } else {
      panel.innerHTML =
        '<div class="stream-offline">' +
        '<div class="so-icon">📺</div>' +
        '<div class="so-title">Stream offline</div>' +
        '<div class="so-sub">The official broadcast link appears here when the arena goes live. An admin can set the YouTube URL from the admin panel.</div>' +
        "</div>";
      watchBtn.classList.add("hidden");
    }

    $("#liveBadge").innerHTML = live.isLive
      ? '<span class="badge badge-live"><span class="dot"></span>LIVE</span>'
      : '<span class="badge badge-muted">Off air</span>';
    $("#streamTitle").textContent = live.title || "MPL Cambodia Official Stream";
    $("#streamSub").textContent = live.isLive
      ? "The arena is live — lock in your predictions before it ends."
      : "The official broadcast of the MPL Cambodia 2026 regular season.";
    $("#streamEyebrow").textContent = live.isLive ? "Live now" : "Official broadcast";
  }

  function renderNextMatch() {
    const box = $("#nextMatchMini");
    const m = upcoming()[0];
    if (!m) {
      box.innerHTML = '<div class="muted">No upcoming matches scheduled.</div>';
      return;
    }
    const a = Store.teamById(m.teamA);
    const b = Store.teamById(m.teamB);
    box.innerHTML =
      `<div class="flex-between gap-8">` +
      `<span class="badge badge-violet">${esc(m.weekLabel || "Week " + m.week)}</span>` +
      `<span class="muted" style="font-size:.8rem;">${formatDate(m.date)} · ${formatTime(m.date)}</span>` +
      `</div>` +
      `<div class="flex-center mt-8" style="justify-content:space-between;">` +
      `<span class="flex gap-8">${UI.teamImg(a, 30).outerHTML}<b>${esc(a ? a.name : "?")}</b></span>` +
      `<span class="vs">VS</span>` +
      `<span class="flex gap-8"><b>${esc(b ? b.name : "?")}</b>${UI.teamImg(b, 30).outerHTML}</span>` +
      `</div>` +
      `<div class="mc-countdown mt-8" data-cd="${m.date}"></div>`;
    if (ticker) tickMatchCountdowns();
  }

  /* --------------------------- Match grid --------------------------- */

  function buildFilters() {
    const weekSel = $("#weekFilter");
    const teamSel = $("#teamFilter");
    const ms = Store.matches(); // regular season only — playoffs live on the bracket

    // Week options (unique, in order)
    const weeks = [];
    ms.forEach((m) => {
      const label = m.weekLabel || "Week " + m.week;
      if (!weeks.find((w) => w.label === label)) weeks.push({ label, week: m.week });
    });
    weeks.sort((a, b) => (a.week === 999 ? 1 : a.week - b.week));
    weekSel.innerHTML = '<option value="all">All weeks</option>' + weeks.map((w) => `<option value="${esc(w.label)}">${esc(w.label)}</option>`).join("");

    // Team options (only teams with matches)
    const ids = new Set();
    ms.forEach((m) => { ids.add(m.teamA); ids.add(m.teamB); });
    teamSel.innerHTML = '<option value="all">All teams</option>' +
      [...ids].map((id) => `<option value="${id}">${esc(Store.teamById(id)?.name || id)}</option>`).join("");

    $("#matchSearch").addEventListener("input", debounce(renderMatchGrid, 200));
    weekSel.addEventListener("change", renderMatchGrid);
    teamSel.addEventListener("change", renderMatchGrid);
  }

  function filteredMatches() {
    const q = ($("#matchSearch")?.value || "").trim().toLowerCase();
    const week = $("#weekFilter")?.value || "all";
    const team = $("#teamFilter")?.value || "all";
    return Store.matches().filter((m) => {
      if (week !== "all" && (m.weekLabel || "Week " + m.week) !== week) return false;
      if (team !== "all" && m.teamA !== team && m.teamB !== team) return false;
      if (q) {
        const a = Store.teamById(m.teamA)?.name.toLowerCase() || "";
        const b = Store.teamById(m.teamB)?.name.toLowerCase() || "";
        if (!a.includes(q) && !b.includes(q)) return false;
      }
      return true;
    });
  }

  function upcoming() {
    return Store.matches()
      .filter((m) => matchStatus(m) !== "finished")
      .sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  /** 'live' | 'upcoming' | 'finished' */
  function matchStatus(m) {
    if (m.status === "finished" && m.result) return "finished";
    const t = Date.now();
    const start = new Date(m.date).getTime();
    if (t >= start && t < start + 3 * 3600 * 1000) return "live"; // auto-live within 3h window
    return "upcoming";
  }

  function matchCardHTML(m) {
    const a = Store.teamById(m.teamA);
    const b = Store.teamById(m.teamB);
    const status = matchStatus(m);
    const week = m.weekLabel || "Week " + m.week;

    const teamBlock = (t) =>
      `<div class="team-block">` +
      `${UI.teamImg(t, 52).outerHTML}` +
      `<div class="t-name">${esc(t ? t.name : "?")}</div>` +
      `<div class="t-tag">${esc(t ? t.shortName || t.tag : "")}</div>` +
      `</div>`;

    let center;
    if (status === "finished") {
      center =
        `<div class="mc-score">` +
        `<span>${m.result.scoreA}</span><span class="vs">-</span><span>${m.result.scoreB}</span>` +
        `</div>` +
        `<div class="flex-center mb-16"><span class="badge badge-win">Winner · ${esc(Store.teamById(m.result.winner)?.name || "?")}</span></div>`;
    } else if (status === "live") {
      center = `<div class="mc-countdown" data-cd="${m.date}" data-live="1"></div>`;
    } else {
      center = `<div class="mc-countdown" data-cd="${m.date}"></div>`;
    }

    const action =
      status === "finished"
        ? `<a class="btn btn-ghost btn-block" href="standings.html">View standings</a>`
        : `<a class="btn btn-gold btn-block" href="predictions.html">Predict</a>`;

    return (
      `<article class="match-card${status === "live" ? " live" : ""}" data-component="match-card">` +
      `<div class="mc-top">` +
      `<span class="badge badge-violet">${esc(week)}</span>` +
      (status === "live" ? '<span class="badge badge-live"><span class="dot"></span>LIVE</span>' : "") +
      `</div>` +
      `<div class="mc-teams">${teamBlock(a)}<div class="vs">VS</div>${teamBlock(b)}</div>` +
      `<div class="mc-meta"><span>${formatDate(m.date)}</span><span class="sep">·</span><span>${formatTime(m.date)}</span></div>` +
      center +
      action +
      `</article>`
    );
  }

  function renderMatchGrid() {
    const grid = $("#matchGrid");
    const empty = $("#matchEmpty");
    const list = filteredMatches().sort((a, b) => {
      const sa = matchStatus(a), sb = matchStatus(b);
      if (sa === "finished" && sb !== "finished") return 1;
      if (sa !== "finished" && sb === "finished") return -1;
      return new Date(a.date) - new Date(b.date);
    });
    grid.innerHTML = list.map(matchCardHTML).join("");
    empty.classList.toggle("hidden", list.length > 0);
    if (ticker) tickMatchCountdowns();
  }

  /* --------------------------- Countdown ---------------------------- */

  function startTicker() {
    if (ticker) clearInterval(ticker);
    ticker = setInterval(tickMatchCountdowns, 1000);
    tickMatchCountdowns();
  }

  function tickMatchCountdowns() {
    $$("[data-cd]").forEach((box) => {
      const t = timeLeft(box.dataset.cd);
      if (box.dataset.live) {
        box.innerHTML =
          `<span class="badge badge-live"><span class="dot"></span>Live now</span>` +
          `<div class="cd-finished">Vote before the series ends</div>`;
        return;
      }
      if (t.done) {
        box.innerHTML = `<div class="cd-finished">Match time!</div>`;
        return;
      }
      const cells = [
        [t.days, "Days"], [t.hours, "Hrs"], [t.minutes, "Min"], [t.seconds, "Sec"],
      ].map(([v, l]) => `<div class="cd-cell"><span class="num">${pad2(v)}</span><span class="lab">${l}</span></div>`).join("");
      box.innerHTML = cells;
    });
  }

  /* ------------------------- Mini standings ------------------------- */

  function renderMiniStandings() {
    const rows = Store.computeStandings().slice(0, 5);
    const wrap = $("#miniStandings");
    if (!rows.length) {
      wrap.innerHTML = "";
      return;
    }
    const teamCell = (t) =>
      `<div class="team-cell">${UI.teamImg(t, 30).outerHTML}<span class="tc-name">${esc(t.name)}</span></div>`;
    wrap.innerHTML =
      `<table class="data-table">` +
      `<thead><tr><th>Rank</th><th>Team</th><th class="num">Matches</th><th class="num">Wins</th><th class="num">Losses</th><th class="num">GD</th><th class="num">Points</th></tr></thead>` +
      `<tbody>` +
      rows
        .map(
          (r) =>
            `<tr class="rank-${r.rank}">` +
            `<td class="rank-cell">${r.rank}</td>` +
            `<td>${teamCell(Store.teamById(r.team))}</td>` +
            `<td class="num">${r.matches}</td>` +
            `<td class="num win">${r.wins}</td>` +
            `<td class="num">${r.losses}</td>` +
            `<td class="num">${r.gameDiff > 0 ? "+" : ""}${r.gameDiff}</td>` +
            `<td class="num gold" style="font-weight:700;">${r.points}</td>` +
            `</tr>`
        )
        .join("") +
      `</tbody></table>`;
  }

  /* ------------------------------ News ------------------------------ */

  function renderNews() {
    const grid = $("#newsGrid");
    const items = Store.news();
    grid.innerHTML = items
      .map(
        (n) =>
          `<article class="news-card">` +
          `<img src="${esc(n.image || "assets/img/news-1.jpg")}" alt="" loading="lazy">` +
          `<div class="nc-body">` +
          `<span class="badge badge-gold">${esc(n.tag || "News")}</span>` +
          `<h3 class="nc-title">${esc(n.title)}</h3>` +
          `<p class="nc-excerpt">${esc(n.excerpt)}</p>` +
          `<div class="nc-date"><span>${formatLongDate(n.date)}</span><span class="gold">MPL Cambodia</span></div>` +
          `</div></article>`
      )
      .join("");
  }

  return { init };
})();
