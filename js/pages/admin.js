/* ==========================================================================
 * pages/admin.js — admin gate, tabs, teams / matches / live / news / weeks
 * ========================================================================== */

const PageAdmin = (() => {
  const SCORE_OPTS = ["2-0", "2-1", "1-2", "0-2"];                // Best of 3
  const BO5_OPTS = ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"];    // Best of 5
  const BO7_OPTS = ["4-0", "4-1", "4-2", "4-3", "3-4", "2-4", "1-4", "0-4"]; // Best of 7

  /** Score options follow the series length set on the match */
  function scoreOptionsFor(m) {
    if (m && m.bo === 7) return BO7_OPTS;
    if (m && m.bo === 5) return BO5_OPTS;
    return SCORE_OPTS;
  }

  /* ------------------------------- Gate ------------------------------- */

  function renderGate() {
    const authed = Auth.isAdmin();
    $("#adminLoginGate").classList.toggle("hidden", authed);
    $("#adminDash").classList.toggle("hidden", !authed);
    if (authed) renderDash();
  }

  function renderDash() {
    renderTeamsList();
    renderMatchFormSelects();
    renderMatchLists();
    renderLiveForm();
    renderNewsList();
    renderWeeksForm();
    renderPointsForm();
    renderStandingsForm();
    renderSettings();
  }

  /* ------------------------------- Tabs ------------------------------- */

  function wireTabs() {
    $$(".tab-btn").forEach((btn) =>
      btn.addEventListener("click", () => {
        $$(".tab-btn").forEach((b) => b.classList.remove("active"));
        $$(".tab-pane").forEach((p) => p.classList.add("hidden"));
        btn.classList.add("active");
        $(`.tab-pane[data-pane="${btn.dataset.tab}"]`).classList.remove("hidden");
      })
    );
  }

  /* ------------------------------- Teams ------------------------------ */

  function renderTeamsList() {
    const box = $("#teamList");
    const ts = Store.teams();
    box.innerHTML = ts.length
      ? ts.map((t) =>
          `<div class="leader-row">` +
          `${UI.teamImg(t, 30).outerHTML}` +
          `<span class="lr-name">${esc(t.name)} <span class="muted" style="font-size:.78rem;">(${esc(t.shortName)})</span></span>` +
          `<button class="btn btn-ghost btn-sm" data-teamedit="${esc(t.id)}">Edit</button>` +
          `<button class="btn btn-danger btn-sm" data-teamdel="${esc(t.id)}">Delete</button>` +
          `</div>`
        ).join("")
      : '<div class="empty">No teams yet — add your first one.</div>';

    // Delegated actions
    box.onclick = (e) => {
      const edit = e.target.closest("[data-teamedit]");
      const del = e.target.closest("[data-teamdel]");
      if (edit) startTeamEdit(edit.dataset.teamedit);
      if (del) deleteTeam(del.dataset.teamdel);
    };
  }

  function startTeamEdit(id) {
    const t = Store.teamById(id);
    if (!t) return;
    $("#tfId").value = t.id;
    $("#tfName").value = t.name;
    $("#tfShort").value = t.shortName || "";
    $("#tfTag").value = t.tag || "";
    $("#tfColor").value = t.color || "#F5B301";
    $("#teamFormTitle").textContent = "Edit team — " + t.name;
    $("#teamSubmit").textContent = "Save changes";
    $("#teamCancel").classList.remove("hidden");
    $("#teamFormCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetTeamForm() {
    $("#teamForm").reset();
    $("#tfId").value = "";
    $("#teamFormTitle").textContent = "Add team";
    $("#teamSubmit").textContent = "Add team";
    $("#teamCancel").classList.add("hidden");
  }

  async function deleteTeam(id) {
    const t = Store.teamById(id);
    if (!t) return;
    const used = Store.matches().some((m) => m.teamA === id || m.teamB === id);
    if (used) {
      UI.toast("Cannot delete — team is used in scheduled matches. Delete those first.", "error");
      return;
    }
    if (!confirm(`Delete ${t.name}? This cannot be undone.`)) return;
    Store.saveTeams(Store.teams().filter((x) => x.id !== id));
    renderTeamsList();
    renderMatchFormSelects();
    UI.toast("Team deleted.", "success");
  }

  function wireTeamForm() {
    $("#teamForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#tfId").value;
      const name = $("#tfName").value.trim();
      const short = $("#tfShort").value.trim();
      const tag = ($("#tfTag").value.trim() || name.slice(0, 3)).toUpperCase();
      const color = $("#tfColor").value;
      let logo = null;
      const fileInput = $("#tfLogo");
      if (fileInput.files && fileInput.files[0]) {
        logo = await fileToDataUrl(fileInput.files[0]);
      }

      const ts = Store.teams();
      if (id) {
        const i = ts.findIndex((t) => t.id === id);
        if (i > -1) {
          ts[i] = { ...ts[i], name, shortName: short, tag, color, ...(logo ? { logo } : {}) };
        }
      } else {
        const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || uid("team");
        ts.push({ id: slug, name, shortName: short, tag, color, logo: logo || null });
      }
      Store.saveTeams(ts);
      resetTeamForm();
      renderTeamsList();
      renderMatchFormSelects();
      UI.toast(id ? "Team updated." : "Team added.", "success");
    });

    $("#teamCancel").addEventListener("click", resetTeamForm);
  }

  /* ------------------------------ Matches ----------------------------- */

  function weekOptions() {
    const cfg = Store.config();
    const weeks = (cfg.tournament && cfg.tournament.weeks) || [];
    return weeks.map((w) => ({ num: w.num, label: w.label || "Week " + w.num, dates: w.dates || "" }));
  }

  function renderMatchFormSelects() {
    const ts = Store.teams();
    const teamOpts = ts.map((t) => `<option value="${t.id}">${esc(t.name)}</option>`).join("");
    $("#mfTeamA").innerHTML = '<option value="">Team A…</option>' + teamOpts;
    $("#mfTeamB").innerHTML = '<option value="">Team B…</option>' + teamOpts;
    const weeks = weekOptions();
    $("#mfWeek").innerHTML = weeks.map((w) => `<option value="${w.num}">${esc(w.label)}${w.dates ? " — " + esc(w.dates) : ""}</option>`).join("");
  }

  function matchTeamName(id) {
    const t = Store.teamById(id);
    return t ? t.name : "?";
  }

  /** Winner + score controls used by both scheduled and finished rows.
   *  Includes a "Bo" dropdown so the series length can be changed on the fly
   *  (regular and playoff matches alike). Team ids are passed explicitly so
   *  bracket fixtures (whose stored participants are seed/ref objects) can be
   *  rendered against their resolved teams. */
  function resultControls(m, applyLabel, aId, bId) {
    const ta = aId || m.teamA;
    const tb = bId || m.teamB;
    return (
      `<select class="select" data-mbo="${esc(m.id)}" style="max-width:88px;" aria-label="Best of">` +
      [3, 5, 7].map((b) => `<option value="${b}"${(m.bo || 3) === b ? " selected" : ""}>Bo${b}</option>`).join("") +
      `</select>` +
      `<select class="select" data-rwinner="${esc(m.id)}" style="max-width:180px;" aria-label="Winner">` +
      `<option value="${esc(ta)}">${esc(matchTeamName(ta))}</option>` +
      `<option value="${esc(tb)}">${esc(matchTeamName(tb))}</option>` +
      `</select>` +
      `<select class="select" data-rscore="${esc(m.id)}" style="max-width:120px;" aria-label="Score">` +
      scoreOptionsFor(m).map((s) => `<option value="${s}">${s}</option>`).join("") +
      `</select>` +
      `<button class="btn btn-gold btn-sm" data-rapply="${esc(m.id)}">${applyLabel}</button>`
    );
  }

  function renderMatchLists() {
    // Scheduled / live — includes inline result controls so a match that has
    // already ended can be closed out directly from this list.
    const sched = $("#scheduledList");
    const open = Store.allMatches().filter((m) => m.status === "scheduled" || m.status === "live");
    sched.innerHTML = open.length
      ? open.map((m) => {
          const slots = resolveMatchTeams(m);
          const bracket = isBracketFixture(m);
          const stageLabel = m.weekLabel || (Store.isPlayoffMatch(m) ? m.label || "Playoff" : "");
          return (
            `<div class="leader-row" style="flex-wrap:wrap;">` +
            `<span class="lr-name" style="flex-basis:100%;"><b>${esc(slots.aName)}</b> vs <b>${esc(slots.bName)}</b>` +
            `<span class="muted" style="font-size:.75rem;"> · ${esc(stageLabel)} · ${formatDate(m.date)} ${formatTime(m.date)}</span></span>` +
            (m.status === "live" ? '<span class="badge badge-live">Live</span>' : "") +
            (slots.ready
              ? resultControls(m, "Set result", slots.aId, slots.bId)
              : '<span class="muted" style="font-size:.78rem;">Awaiting earlier results…</span>') +
            (!bracket ? `<button class="btn btn-ghost btn-sm" data-medit="${esc(m.id)}">Edit</button>` : "") +
            (!bracket ? `<button class="btn btn-danger btn-sm" data-mdel="${esc(m.id)}">Delete</button>` : "") +
            `</div>`
          );
        }).join("")
      : '<div class="empty">No scheduled matches.</div>';

    // Finished — unified result updater (regular + playoff)
    const fin = $("#finishedList");
    const done = Store.allMatches().filter((m) => m.status === "finished" && m.result);
    fin.innerHTML = done.length
      ? done.map((m) => {
          const slots = resolveMatchTeams(m);
          const isP = Store.isPlayoffMatch(m);
          const stageLabel = m.weekLabel || (isP ? m.label || "Playoff" : "");
          return (
            `<div class="leader-row" style="flex-wrap:wrap;">` +
            `<span class="lr-name" style="flex-basis:100%;"><b>${esc(slots.aName)}</b> ${m.result.scoreA} - ${m.result.scoreB} <b>${esc(slots.bName)}</b>` +
            `<span class="muted" style="font-size:.75rem;"> · ${esc(stageLabel)}${isP && !m.weekLabel ? " · Playoff" : ""}</span></span>` +
            (slots.ready ? resultControls(m, "Apply result", slots.aId, slots.bId) : "") +
            `<button class="btn btn-ghost btn-sm" data-rreset="${esc(m.id)}">Reopen</button>` +
            `</div>`
          );
        }).join("")
      : '<div class="empty">No finished matches yet.</div>';

    // Pre-fill current results in the selects
    done.forEach((m) => {
      const ws = $(`[data-rwinner="${m.id}"]`);
      const ss = $(`[data-rscore="${m.id}"]`);
      if (ws) ws.value = m.result.winner;
      if (ss) ss.value = `${m.result.scoreA}-${m.result.scoreB}`;
    });

    // Delegated actions
    sched.onclick = (e) => {
      const edit = e.target.closest("[data-medit]");
      const del = e.target.closest("[data-mdel]");
      const apply = e.target.closest("[data-rapply]");
      if (apply) applyResult(apply.dataset.rapply);
      if (edit) startMatchEdit(edit.dataset.medit);
      if (del) deleteMatch(del.dataset.mdel);
    };
    fin.onclick = (e) => {
      const apply = e.target.closest("[data-rapply]");
      const reset = e.target.closest("[data-rreset]");
      if (apply) applyResult(apply.dataset.rapply);
      if (reset) reopenMatch(reset.dataset.rreset);
    };
    // Changing the Bo dropdown updates the series length for any match
    [sched, fin].forEach((list) =>
      list.addEventListener("change", (e) => {
        const sel = e.target.closest("[data-mbo]");
        if (!sel) return;
        const m = Store.matchById(sel.dataset.mbo);
        if (!m) return;
        const updated = { ...m, bo: Number(sel.value) };
        persistMatch(updated);
        renderMatchLists();
        UI.toast(`Series length updated to Bo${sel.value}.`, "success");
      })
    );
  }

  /** True for pre-built bracket fixtures (auto-managed — stored in the playoff store) */
  function isBracketFixture(m) {
    return Store.playoffMatches().some((p) => p.id === m.id);
  }

  /** True for any playoff match: bracket fixtures OR matches created under
   *  the "Playoffs" week (stamped stage:"playoffs"). Classification lives in
   *  one place — Store.isPlayoffMatch. */
  function isPlayoffMatch(m) {
    return Store.isPlayoffMatch(m);
  }

  /** Resolve the two teams of a match for display / result entry. Bracket
   *  fixtures reference seeds and earlier results, so they are resolved
   *  against the current standings + playoff results. */
  function resolveMatchTeams(m) {
    if (!isBracketFixture(m)) {
      return { aId: m.teamA, bId: m.teamB, aName: matchTeamName(m.teamA), bName: matchTeamName(m.teamB), ready: true };
    }
    const pMs = Store.playoffMatches();
    const rows = Store.computeStandings();
    const aId = Store.resolveParticipant(m.teamA, pMs, rows);
    const bId = Store.resolveParticipant(m.teamB, pMs, rows);
    return {
      aId,
      bId,
      aName: aId ? matchTeamName(aId) : "TBD",
      bName: bId ? matchTeamName(bId) : "TBD",
      ready: !!(aId && bId),
    };
  }

  function startMatchEdit(id) {
    const m = Store.matchById(id);
    if (!m) return;
    $("#mfId").value = m.id;
    $("#mfTeamA").value = m.teamA;
    $("#mfTeamB").value = m.teamB;
    $("#mfWeek").value = String(m.week || 1);
    $("#mfBo").value = String(m.bo || 3);
    const d = new Date(m.date);
    $("#mfDate").value = d.toISOString().slice(0, 16); // local time
    $("#matchFormTitle").textContent = "Edit match";
    $("#matchSubmit").textContent = "Save changes";
    $("#matchCancel").classList.remove("hidden");
    $("#matchFormCard").scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function resetMatchForm() {
    $("#matchForm").reset();
    $("#mfId").value = "";
    $("#matchFormTitle").textContent = "Create match";
    $("#matchSubmit").textContent = "Create match";
    $("#matchCancel").classList.add("hidden");
  }

  function deleteMatch(id) {
    const m = Store.matchById(id);
    if (!m) return;
    if (!confirm(`Delete ${matchTeamName(m.teamA)} vs ${matchTeamName(m.teamB)}?`)) return;
    if (isBracketFixture(m)) {
      UI.toast("Playoff fixtures are managed automatically — reset results instead.", "error");
      return;
    }
    Store.saveMatches(Store.matches().filter((x) => x.id !== id));
    // Also prune every user's prediction for the deleted match
    const all = Store.allPredictions();
    let pruned = false;
    Object.keys(all).forEach((u) => {
      if (all[u].matches && all[u].matches[id]) {
        delete all[u].matches[id];
        pruned = true;
      }
    });
    if (pruned) Store.lsSet("predictions", all);
    renderMatchLists();
    UI.toast("Match deleted — its predictions were removed.", "success");
  }

  function applyResult(id) {
    const m = Store.matchById(id);
    if (!m) return;
    const winner = $(`[data-rwinner="${id}"]`).value;
    const score = $(`[data-rscore="${id}"]`).value;
    if (!winner || !score) return;
    const [a, b] = score.split("-").map(Number);
    const updated = {
      ...m,
      status: "finished",
      result: { winner, scoreA: a, scoreB: b },
    };
    persistMatch(updated);
    renderMatchLists();
    UI.toast("Result saved — standings and prediction scores updated.", "success");
  }

  function reopenMatch(id) {
    const m = Store.matchById(id);
    if (!m) return;
    const updated = { ...m, status: "scheduled", result: null };
    persistMatch(updated);
    renderMatchLists();
    UI.toast("Match reopened for prediction.", "info");
  }

  function persistMatch(updated) {
    // Route by where the match actually lives: pre-built bracket fixtures go
    // to the playoff store; everything else (incl. "Playoffs"-week matches
    // created from this form, which carry stage:"playoffs") stays in matches.
    if (isBracketFixture(updated)) {
      const list = Store.playoffMatches().map((p) => (p.id === updated.id ? updated : p));
      Store.savePlayoff(list);
    } else {
      const list = Store.matches().map((m) => (m.id === updated.id ? updated : m));
      Store.saveMatches(list);
    }
  }

  function wireMatchForm() {
    $("#matchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const id = $("#mfId").value;
      const teamA = $("#mfTeamA").value;
      const teamB = $("#mfTeamB").value;
      const weekNum = Number($("#mfWeek").value);
      const dateVal = $("#mfDate").value;
      if (!teamA || !teamB || !dateVal) {
        UI.toast("Fill team A, team B and the date.", "error");
        return;
      }
      if (teamA === teamB) {
        UI.toast("Team A and Team B must be different.", "error");
        return;
      }
      const weeks = weekOptions();
      const wk = weeks.find((w) => w.num === weekNum);
      const weekLabel = wk ? wk.label : "Week " + weekNum;
      const bo = Number($("#mfBo").value) || 3;
      const dateIso = dateVal.replace("T", "T") + ":00+07:00";

      // Matches scheduled in the "Playoffs" week are playoff fixtures: they
      // stay editable here but are excluded from the regular-season standings.
      const pw = weeks.find((w) => /playoff/i.test(w.label || ""));
      const isPlayoffsWeek = !!(pw && Number(pw.num) === weekNum);
      const stage = isPlayoffsWeek ? "playoffs" : undefined;

      const list = Store.matches();
      if (id) {
        const i = list.findIndex((m) => m.id === id);
        if (i > -1) {
          const updated = { ...list[i], teamA, teamB, week: weekNum, weekLabel, date: dateIso, bo };
          if (stage) updated.stage = stage;
          else delete updated.stage;
          list[i] = updated;
        }
        Store.saveMatches(list);
      } else {
        const slug = uid("m");
        const created = { id: slug, week: weekNum, weekLabel, teamA, teamB, date: dateIso, bo, status: "scheduled" };
        if (stage) created.stage = stage;
        list.push(created);
        Store.saveMatches(list);
      }
      resetMatchForm();
      renderMatchLists();
      UI.toast(id ? "Match updated." : "Match created.", "success");
    });

    $("#matchCancel").addEventListener("click", resetMatchForm);
  }

  /* ---------------------------- Live stream --------------------------- */

  function renderLiveForm() {
    const cfg = Store.config();
    const live = cfg.live || {};
    $("#liveUrl").value = live.url || "";
    $("#liveIsLive").checked = !!live.isLive;
    $("#liveTitle").value = live.title || "MPL Cambodia Official Stream";
  }

  function wireLiveForm() {
    $("#saveLiveBtn").addEventListener("click", () => {
      const cfg = Store.config();
      const url = $("#liveUrl").value.trim();
      if (url && !youtubeEmbedUrl(url)) {
        UI.toast("That doesn't look like a valid YouTube URL.", "error");
        return;
      }
      cfg.live = {
        url,
        isLive: $("#liveIsLive").checked,
        title: $("#liveTitle").value.trim() || "MPL Cambodia Official Stream",
      };
      Store.saveConfig(cfg);
      UI.toast("Live settings saved.", "success");
    });
  }

  /* ------------------------------- News ------------------------------- */

  function renderNewsList() {
    const box = $("#newsList");
    const items = Store.news();
    box.innerHTML = items.length
      ? items.map((n) =>
          `<div class="leader-row">` +
          `<span class="lr-name">${esc(n.title)}<span class="muted" style="font-size:.75rem;"> · ${esc(n.tag || "")} · ${esc(n.date)}</span></span>` +
          `<button class="btn btn-ghost btn-sm" data-nedit="${esc(n.id)}">Edit</button>` +
          `<button class="btn btn-danger btn-sm" data-ndel="${esc(n.id)}">Delete</button>` +
          `</div>`
        ).join("")
      : '<div class="empty">No news items.</div>';

    box.onclick = (e) => {
      const edit = e.target.closest("[data-nedit]");
      const del = e.target.closest("[data-ndel]");
      if (edit) startNewsEdit(edit.dataset.nedit);
      if (del) {
        if (!confirm("Delete this news item?")) return;
        Store.saveNews(Store.news().filter((x) => x.id !== del.dataset.ndel));
        renderNewsList();
        UI.toast("News deleted.", "success");
      }
    };
  }

  function startNewsEdit(id) {
    const n = Store.news().find((x) => x.id === id);
    if (!n) return;
    $("#nfId").value = n.id;
    $("#nfTitle").value = n.title;
    $("#nfTag").value = n.tag || "";
    $("#nfExcerpt").value = n.excerpt || "";
    $("#nfBody").value = n.body || "";
    $("#newsFormTitle").textContent = "Edit news";
    $("#newsSubmit").textContent = "Save changes";
    $("#newsCancel").classList.remove("hidden");
  }

  function resetNewsForm() {
    $("#newsForm").reset();
    $("#nfId").value = "";
    $("#newsFormTitle").textContent = "Add news";
    $("#newsSubmit").textContent = "Add news";
    $("#newsCancel").classList.add("hidden");
  }

  function wireNewsForm() {
    $("#newsForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const id = $("#nfId").value;
      const title = $("#nfTitle").value.trim();
      const tag = $("#nfTag").value.trim() || "News";
      const excerpt = $("#nfExcerpt").value.trim();
      const body = $("#nfBody").value.trim();
      if (!title || !excerpt || !body) {
        UI.toast("Title, excerpt and body are required.", "error");
        return;
      }
      let image = null;
      const fileInput = $("#nfImage");
      if (fileInput.files && fileInput.files[0]) image = await fileToDataUrl(fileInput.files[0]);

      const items = Store.news();
      if (id) {
        const i = items.findIndex((x) => x.id === id);
        if (i > -1) items[i] = { ...items[i], title, tag, excerpt, body, ...(image ? { image } : {}) };
      } else {
        items.unshift({ id: uid("n"), title, tag, excerpt, body, date: new Date().toISOString().slice(0, 10), image: image || null });
      }
      Store.saveNews(items);
      resetNewsForm();
      renderNewsList();
      UI.toast(id ? "News updated." : "News added.", "success");
    });

    $("#newsCancel").addEventListener("click", resetNewsForm);
  }

  /* ------------------------------ Weeks ------------------------------- */

  function renderWeeksForm() {
    const cfg = Store.config();
    const weeks = (cfg.tournament && cfg.tournament.weeks) || [];
    const cur = (cfg.tournament && cfg.tournament.currentWeek) || (weeks[0] ? weeks[0].num : 1);
    const box = $("#weeksList");
    box.innerHTML = weeks
      .map(
        (w, i) =>
          `<div class="leader-row" style="flex-wrap:wrap;">` +
          `<span class="lr-name" style="flex-basis:100%;"><b>${esc(w.label)}</b> <span class="muted">· ${esc(w.dates || "")}</span></span>` +
          `<input class="input" data-wlabel="${i}" value="${esc(w.label)}" style="max-width:130px;" aria-label="Week label">` +
          `<input class="input" data-wdates="${i}" value="${esc(w.dates || "")}" style="max-width:170px;" aria-label="Week dates">` +
          (weeks.length > 1
            ? `<button class="btn btn-danger btn-sm" data-wdel="${i}" title="Remove week" aria-label="Remove ${esc(w.label)}">✕</button>`
            : "") +
          `</div>`
      )
      .join("");
    $("#curWeek").innerHTML = weeks.map((w) => `<option value="${w.num}">${esc(w.label)}</option>`).join("");
    $("#curWeek").value = String(cur);
  }

  function renderPointsForm() {
    const cfg = Store.config();
    const r = cfg.predictionRules || {};
    const def = typeof Scoring !== "undefined" ? Scoring.DEFAULT_RULES : {};
    $("#ptWinner").value = r.correctWinner ?? def.correctWinner ?? 100;
    $("#ptScore").value = r.correctScore ?? def.correctScore ?? 200;
    $("#ptTopExact").value = r.seasonExact ?? def.seasonExact ?? 100;
    $("#ptTopIn").value = r.seasonInTop6 ?? def.seasonInTop6 ?? 50;
    $("#ptChamp").value = r.champion ?? def.champion ?? 500;
  }

  /** Read the week rows back into config (keeps unsaved edits before add/del) */
  function collectWeeks() {
    const cfg = Store.config();
    const weeks = (cfg.tournament && cfg.tournament.weeks) || [];
    weeks.forEach((w, i) => {
      const label = $(`[data-wlabel="${i}"]`)?.value.trim();
      if (label) w.label = label;
      const dates = $(`[data-wdates="${i}"]`)?.value.trim();
      if (dates) w.dates = dates;
    });
    return weeks;
  }

  function wireWeeksForm() {
    $("#saveWeeksBtn").addEventListener("click", () => {
      const cfg = Store.config();
      collectWeeks();
      cfg.tournament.currentWeek = Number($("#curWeek").value);
      Store.saveConfig(cfg);
      UI.toast("Weeks saved.", "success");
    });

    $("#addWeekBtn").addEventListener("click", () => {
      const cfg = Store.config();
      const weeks = collectWeeks();
      const next = weeks.length ? Math.max(...weeks.map((w) => w.num)) + 1 : 1;
      weeks.push({ num: next, label: "Week " + next, dates: "" });
      cfg.tournament.weeks = weeks;
      renderWeeksForm();
    });

    $("#weeksList").addEventListener("click", (e) => {
      const del = e.target.closest("[data-wdel]");
      if (!del) return;
      const cfg = Store.config();
      const weeks = collectWeeks();
      const i = Number(del.dataset.wdel);
      if (weeks.length <= 1) {
        UI.toast("Keep at least one week.", "error");
        return;
      }
      weeks.splice(i, 1);
      cfg.tournament.weeks = weeks;
      if (cfg.tournament.currentWeek === weeks[i]?.num) {
        cfg.tournament.currentWeek = weeks[0] ? weeks[0].num : 1;
      }
      renderWeeksForm();
      UI.toast("Week removed (click Save weeks to keep it).", "info");
    });
  }

  function wirePointsForm() {
    $("#savePointsBtn").addEventListener("click", () => {
      const cfg = Store.config();
      const num = (v, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
      };
      cfg.predictionRules = {
        correctWinner: num($("#ptWinner").value, 100),
        correctScore: num($("#ptScore").value, 200),
        seasonExact: num($("#ptTopExact").value, 100),
        seasonInTop6: num($("#ptTopIn").value, 50),
        champion: num($("#ptChamp").value, 500),
      };
      Store.saveConfig(cfg);
      UI.toast("Prediction points saved — scores update immediately.", "success");
    });
  }

  function renderStandingsForm() {
    const cfg = Store.config();
    const sp = cfg.standingsPoints || { "2-0": 1, "2-1": 1, "1-2": 0, "0-2": 0 };
    $("#spWin20").value = sp["2-0"] ?? 1;
    $("#spWin21").value = sp["2-1"] ?? 1;
    $("#spLoss12").value = sp["1-2"] ?? 0;
    $("#spLoss02").value = sp["0-2"] ?? 0;
  }

  function wireStandingsForm() {
    $("#saveStandingsBtn").addEventListener("click", () => {
      const cfg = Store.config();
      const num = (v, fallback) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? n : fallback;
      };
      cfg.standingsPoints = {
        "2-0": num($("#spWin20").value, 1),
        "2-1": num($("#spWin21").value, 1),
        "1-2": num($("#spLoss12").value, 0),
        "0-2": num($("#spLoss02").value, 0),
      };
      Store.saveConfig(cfg);
      UI.toast("Standings points saved — the table recalculates everywhere.", "success");
    });
  }

  /* ----------------------------- Settings ----------------------------- */

  function renderSettings() {
    const admin = Store.getAdmin();
    $("#newAdminUser").value = admin.username || "admin";
  }

  function wireSettings() {
    $("#adminSettingsForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const user = $("#newAdminUser").value.trim();
      const pass = $("#newAdminPass").value;
      if (!user || pass.length < 6) {
        UI.toast("Username required and password must be at least 6 characters.", "error");
        return;
      }
      Store.setAdmin(user, pass);
      Auth.adminLogout();
      renderGate();
      UI.toast("Credentials updated — please log in again.", "success");
    });

    $("#resetDataBtn").addEventListener("click", () => {
      if (!confirm("Reset teams, matches, playoff, news and config to seed data? User accounts and predictions are kept.")) return;
      ["teams", "matches", "playoff", "news", "config"].forEach((k) => Store.reset(k));
      renderDash();
      UI.toast("Data reset to seed.", "success");
    });

    $("#adminLogoutBtn").addEventListener("click", () => {
      Auth.adminLogout();
      UI.renderNavUser();
      renderGate();
      UI.toast("Admin logged out.", "info");
    });
  }

  /* ------------------------------- Boot ------------------------------- */

  function init() {
    renderGate();
    // In cloud mode the admin hint changes (email login, no admin123)
    const note = $("#adminNote");
    if (note && typeof Cloud !== "undefined" && Cloud.enabled()) {
      note.innerHTML = "Cloud mode: log in with your account <strong>email + password</strong>. Only accounts marked admin in the SQL setup get access.";
    }
    wireTabs();
    wireTeamForm();
    wireMatchForm();
    wireLiveForm();
    wireNewsForm();
    wireWeeksForm();
    wirePointsForm();
    wireStandingsForm();
    wireSettings();

    $("#adminLoginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const res = await Auth.adminLogin($("#adminUser").value.trim(), $("#adminPass").value);
      const err = $("#adminLoginError");
      if (!res.ok) {
        err.textContent = res.error;
        err.classList.remove("hidden");
        return;
      }
      err.classList.add("hidden");
      $("#adminLoginForm").reset();
      UI.renderNavUser();
      renderGate();
      UI.toast("Welcome back, admin.", "success");
    });
  }

  return { init, renderGate };
})();
