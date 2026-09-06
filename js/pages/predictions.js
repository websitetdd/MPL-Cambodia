/* ==========================================================================
 * pages/predictions.js — match picks, Top 6, champion, stats, history,
 * export/import
 * ========================================================================== */

const PagePredictions = (() => {
  let record = null;

  /* ------------------------------ Gate ------------------------------- */

  function renderGate() {
    const user = Auth.current();
    $("#predLoginGate").classList.toggle("hidden", !!user);
    $("#predContent").classList.toggle("hidden", !user);
    if (user) {
      renderAll();
    }
  }

  function renderAll() {
    record = Store.predictionsFor(Auth.current()) || { matches: {}, top6: null, champion: null };
    renderMatchPredictions();
    renderSeason();
    renderChampion();
    renderStats();
    renderHistory();
  }

  /* ------------------------- Match predictions ------------------------ */

  function predictableMatches() {
    return Store.matches().filter((m) => m.status !== "finished" && m.status !== "pending");
  }

  /** Correct-score options follow the series length (Bo3 / Bo5 / Bo7) */
  function scoreOptions(m) {
    const bo = (m && m.bo) || 3;
    if (bo === 7) return ["4-0", "4-1", "4-2", "4-3", "3-4", "2-4", "1-4", "0-4"];
    if (bo === 5) return ["3-0", "3-1", "3-2", "2-3", "1-3", "0-3"];
    return ["2-0", "2-1", "1-2", "0-2"];
  }

  function renderMatchPredictions() {
    const grid = $("#predMatchGrid");
    const empty = $("#predMatchEmpty");
    const filter = $("#predWeekFilter");

    const ms = predictableMatches().sort((a, b) => new Date(a.date) - new Date(b.date));

    // Week filter options
    const weeks = [];
    ms.forEach((m) => {
      const label = m.weekLabel || "Week " + m.week;
      if (!weeks.some((w) => w.label === label)) weeks.push({ label });
    });
    const prev = filter.value;
    filter.innerHTML = '<option value="all">All weeks</option>' + weeks.map((w) => `<option value="${esc(w.label)}">${esc(w.label)}</option>`).join("");
    if (weeks.some((w) => w.label === prev)) filter.value = prev;
    else filter.value = "all";

    const visible = filter.value === "all" ? ms : ms.filter((m) => (m.weekLabel || "Week " + m.week) === filter.value);
    grid.innerHTML = visible.map(matchCardHTML).join("");
    empty.classList.toggle("hidden", visible.length > 0);
  }

  /** Match predictions lock 5 minutes before kickoff */
  function matchLocked(m) {
    if (!m || !m.date) return false;
    return Date.now() >= new Date(m.date).getTime() - 5 * 60 * 1000;
  }

  function matchCardHTML(m) {
    const a = Store.teamById(m.teamA);
    const b = Store.teamById(m.teamB);
    const saved = record.matches[m.id] || null;
    const week = m.weekLabel || "Week " + m.week;
    const locked = matchLocked(m);
    const dis = locked ? " disabled" : "";
    const pill = (t, val) =>
      `<label class="radio-pill">` +
      `<input type="radio" name="pw-${m.id}" value="${esc(val)}"${saved && saved.winner === val ? " checked" : ""}${dis}>` +
      `<span class="pill">${UI.teamImg(t, 26).outerHTML}<span>${esc(t ? t.name : "?")}</span></span></label>`;

    return (
      `<article class="match-card${locked ? " is-locked" : ""}" data-id="${esc(m.id)}" data-component="match-card">` +
      `<div class="mc-top">` +
      `<span class="badge badge-violet">${esc(week)}</span>` +
      `<span class="badge badge-gold">BO${m.bo || 3}</span>` +
      (locked ? '<span class="badge badge-loss">Closed</span>' : "") +
      `</div>` +
      `<div class="mc-teams">` +
      `<div class="team-block">${UI.teamImg(a, 44).outerHTML}<div class="t-name">${esc(a ? a.name : "?")}</div></div>` +
      `<div class="vs">VS</div>` +
      `<div class="team-block">${UI.teamImg(b, 44).outerHTML}<div class="t-name">${esc(b ? b.name : "?")}</div></div>` +
      `</div>` +
      `<div class="mc-meta"><span>${formatDate(m.date)}</span><span class="sep">·</span><span>${formatTime(m.date)}</span></div>` +
      `<div class="field"><label>Winner</label><div class="radio-pills">${pill(a, m.teamA)}${pill(b, m.teamB)}</div></div>` +
      `<div class="field"><label>Correct score</label>` +
      `<select class="select" data-score="${esc(m.id)}"${dis}>` +
      `<option value="">${locked ? "Closed — predictions locked" : "Choose score…"}</option>` +
      scoreOptions(m).map((s) => `<option value="${s}"${saved && saved.score === s ? " selected" : ""}>${s}</option>`).join("") +
      `</select></div>` +
      `<div class="flex-between">` +
      `<button class="btn btn-gold btn-sm" data-save="${esc(m.id)}"${dis}>${locked ? "Closed" : "Save prediction"}</button>` +
      `<span class="badge" data-status="${esc(m.id)}">${saved ? "Saved" : locked ? "Locked" : "Not picked"}</span>` +
      `</div>` +
      `</article>`
    );
  }

  function wirePredictionEvents() {
    const grid = $("#predMatchGrid");
    if (!grid) return;

    // Auto-save on any change (radio / score)
    grid.addEventListener("change", (e) => {
      const id = e.target.dataset.score || (e.target.name && e.target.name.startsWith("pw-") ? e.target.name.slice(3) : null);
      if (!id) return;
      const match = Store.matchById(id);
      if (!match) return;
      const winner = (grid.querySelector(`input[name="pw-${id}"]:checked`) || {}).value || null;
      const score = (grid.querySelector(`[data-score="${id}"]`) || {}).value || "";
      if (!winner) return;
      record.matches[id] = { winner, score: score || null, savedAt: new Date().toISOString() };
      Store.savePredictionsFor(Auth.current(), record);
      updateSaveStatus(id, true);
    });

    // Explicit save button
    grid.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-save]");
      if (!btn) return;
      const id = btn.dataset.save;
      const match = Store.matchById(id);
      if (!match) return;
      const winner = (grid.querySelector(`input[name="pw-${id}"]:checked`) || {}).value || null;
      const score = (grid.querySelector(`[data-score="${id}"]`) || {}).value || "";
      if (!winner) {
        UI.toast("Pick a winner before saving.", "error");
        return;
      }
      record.matches[id] = { winner, score: score || null, savedAt: new Date().toISOString() };
      Store.savePredictionsFor(Auth.current(), record);
      updateSaveStatus(id, true);
      UI.toast("Prediction saved — win +100, exact score +200.", "success");
    });
  }

  function updateSaveStatus(id, autosaved) {
    const chip = $(`[data-status="${id}"]`);
    if (chip) chip.textContent = autosaved ? "Auto-saved" : "Saved";
  }

  /* --------------------------- Top 6 season --------------------------- */

  function renderSeason() {
    const listEl = $("#top6List");
    const saveBtn = $("#saveTop6Btn");

    const picks = record.top6 && record.top6.length ? record.top6 : [];
    const picked = new Set(picks);
    const open = top6Open();

    // Lock the whole section once Week 1 has ended
    const wrapCard = listEl.closest(".card");
    if (wrapCard) {
      let lockBadge = wrapCard.querySelector(".t6-lock");
      if (open) {
        if (lockBadge) lockBadge.remove();
        wrapCard.classList.remove("is-locked");
      } else {
        if (!lockBadge) {
          lockBadge = el("span", { class: "badge badge-loss t6-lock", text: "Closed — Week 1 ended" });
          wrapCard.querySelector("h3")?.append(" ", lockBadge);
        }
        wrapCard.classList.add("is-locked");
      }
    }

    // Top 6 slots (always rebuild)
    listEl.innerHTML = "";
    for (let i = 0; i < 6; i++) {
      const teamId = picks[i] || null;
      const t = teamId ? Store.teamById(teamId) : null;
      const item = el("li", { class: "dd-item", draggable: "true", "data-idx": i });
      item.innerHTML =
        `<span class="dd-rank">${i + 1}</span>` +
        (t ? UI.teamImg(t, 26).outerHTML : '<span class="avatar" style="width:26px;height:26px;font-size:.6rem;">?</span>') +
        `<span class="dd-name">${t ? esc(t.name) : "Empty slot"}</span>` +
        (t
          ? `<button class="dd-handle" data-rm="${i}" title="Remove" aria-label="Remove ${esc(t.name)}">✕</button>` +
            `<button class="dd-handle" data-up="${i}" title="Move up" aria-label="Move up">↑</button>` +
            `<button class="dd-handle" data-dn="${i}" title="Move down" aria-label="Move down">↓</button>`
          : "");
      listEl.append(item);
    }

    // Pool (teams not picked) — build once, refresh contents
    let poolWrap = $("#poolWrap");
    if (!poolWrap) {
      poolWrap = el("div", { id: "poolWrap", class: "mt-16" });
      poolWrap.innerHTML = `<div class="muted mb-8" style="font-size:.8rem;">Available teams (tap to add)</div>`;
      const pl = el("div", { id: "poolList", class: "dd-list" });
      poolWrap.append(pl);
      listEl.parentElement.insertBefore(poolWrap, saveBtn);
    }
    const pl = $("#poolList");
    pl.innerHTML = "";
    Store.teams()
      .filter((t) => !picked.has(t.id))
      .forEach((t) => {
        const item = el("li", { class: "dd-item", draggable: "true", "data-add": t.id });
        item.innerHTML = `${UI.teamImg(t, 26).outerHTML}<span class="dd-name">${esc(t.name)}</span><span class="dd-handle">+</span>`;
        pl.append(item);
      });
  }

  function currentTop6() {
    return Array.from($$("#top6List .dd-item")).map((item) => {
      const t = Store.teams().find((x) => x.name === item.querySelector(".dd-name").textContent);
      return t ? t.id : null;
    }).filter(Boolean);
  }

  /** Top 6 closes once Week 1 is fully played */
  function top6Open() {
    const w1 = Store.matches().filter((m) => m.week === 1);
    if (!w1.length) return true;
    return !w1.every((m) => m.status === "finished" && m.result);
  }

  /** Wire Top-6 interactions once (delegation survives re-renders) */
  function wireSeasonEvents() {
    const listEl = $("#top6List");
    // Listen on the whole card so pool clicks ([data-add]) work too — the
    // pool is a sibling of #top6List, not a child of it.
    const seasonCard = listEl.closest(".card") || document;

    seasonCard.addEventListener("click", (e) => {
      if (!top6Open()) {
        UI.toast("Top 6 predictions closed after Week 1.", "info");
        return;
      }
      const rm = e.target.closest("[data-rm]");
      const up = e.target.closest("[data-up]");
      const dn = e.target.closest("[data-dn]");
      const add = e.target.closest("[data-add]");
      const list = currentTop6();
      if (add) {
        const id = add.dataset.add;
        if (list.length < 6) {
          record.top6 = [...list, id];
          persistTop6();
        } else UI.toast("Top 6 is full — remove a team first.", "info");
      } else if (rm) {
        record.top6 = list.filter((_, i) => i !== Number(rm.dataset.rm));
        persistTop6();
      } else if (up) {
        const i = Number(up.dataset.up);
        if (i > 0) {
          const arr = [...list];
          [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]];
          record.top6 = arr;
          persistTop6();
        }
      } else if (dn) {
        const i = Number(dn.dataset.dn);
        if (i < list.length - 1) {
          const arr = [...list];
          [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]];
          record.top6 = arr;
          persistTop6();
        }
      }
    });

    $("#saveTop6Btn").addEventListener("click", () => {
      if (!top6Open()) {
        UI.toast("Top 6 predictions closed after Week 1.", "info");
        return;
      }
      record.top6 = currentTop6();
      persistTop6();
      UI.toast("Top 6 prediction saved.", "success");
    });

    // Drag & drop: reorder inside the slots AND drop pool teams into slots
    let dragIdx = null;    // slot index currently being dragged
    let poolDragId = null; // team id being dragged in from the pool

    const poolList = $("#poolList");
    if (poolList) {
      poolList.addEventListener("dragstart", (e) => {
        const item = e.target.closest("[data-add]");
        if (!item) return;
        poolDragId = item.dataset.add;
        item.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
        try { e.dataTransfer.setData("text/plain", poolDragId); } catch (err) { /* IE-safe */ }
      });
      poolList.addEventListener("dragend", (e) => {
        const item = e.target.closest("[data-add]");
        if (item) item.classList.remove("dragging");
        poolDragId = null;
      });
    }

    listEl.addEventListener("dragstart", (e) => {
      const item = e.target.closest(".dd-item");
      if (!item) return;
      dragIdx = Number(item.dataset.idx);
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    listEl.addEventListener("dragend", (e) => {
      const item = e.target.closest(".dd-item");
      if (item) item.classList.remove("dragging");
      dragIdx = null;
    });

    listEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      if (poolDragId) {
        // Dropping a pool team — highlight the hovered slot
        $$(".dd-item", listEl).forEach((li) => li.classList.remove("droptarget"));
        const over = e.target.closest(".dd-item");
        if (over) over.classList.add("droptarget");
        return;
      }
      const over = e.target.closest(".dd-item");
      if (over && dragIdx !== null) {
        const overIdx = Number(over.dataset.idx);
        if (overIdx !== dragIdx) {
          const list = currentTop6();
          const [moved] = list.splice(dragIdx, 1);
          list.splice(overIdx, 0, moved);
          record.top6 = list;
          dragIdx = overIdx;
          Store.savePredictionsFor(Auth.current(), record);
          renderSeason();
        }
      }
    });

    listEl.addEventListener("drop", (e) => {
      e.preventDefault();
      $$(".dd-item", listEl).forEach((li) => li.classList.remove("droptarget"));
      if (poolDragId) {
        const list = currentTop6();
        if (list.length >= 6) {
          UI.toast("Top 6 is full — remove a team first.", "info");
          poolDragId = null;
          return;
        }
        const over = e.target.closest(".dd-item");
        const overIdx = over ? Math.min(Number(over.dataset.idx), list.length) : list.length;
        list.splice(overIdx, 0, poolDragId);
        record.top6 = list;
        poolDragId = null;
        Store.savePredictionsFor(Auth.current(), record);
        renderSeason();
        UI.toast("Team added to your Top 6 — hit Save Top 6 when done.", "success");
      }
    });
  }

  function persistTop6() {
    Store.savePredictionsFor(Auth.current(), record);
    renderSeason();
  }

  /* ----------------------------- Champion ----------------------------- */

  /** Champion pick closes once the regular season (all weeks) is over */
  function champOpen() {
    return !Scoring.seasonDone();
  }

  function renderChampion() {
    const sel = $("#champSelect");
    const ts = Store.teams();
    const prev = record.champion;
    const open = champOpen();
    sel.innerHTML = '<option value="">Select a team…</option>' + ts.map((t) => `<option value="${t.id}"${prev === t.id ? " selected" : ""}>${esc(t.name)}</option>`).join("");
    sel.disabled = !open;
    const chip = $("#champStatus");
    if (prev) {
      const t = Store.teamById(prev);
      chip.textContent = "Pick: " + (t ? t.name : "");
      chip.classList.remove("hidden");
    } else chip.classList.add("hidden");

    const saveBtn = $("#saveChampBtn");
    saveBtn.disabled = !open;
    saveBtn.textContent = open ? "Save champion" : "Closed";
    saveBtn.onclick = () => {
      if (!open) {
        UI.toast("Champion pick closed after the regular season.", "info");
        return;
      }
      const val = sel.value;
      if (!val) {
        UI.toast("Choose a champion first.", "error");
        return;
      }
      record.champion = val;
      Store.savePredictionsFor(Auth.current(), record);
      renderChampion();
      UI.toast("Champion pick saved — +500 if correct.", "success");
    };
    // Lock notice on the champion card
    const card = saveBtn.closest(".card");
    if (card) {
      let lockBadge = card.querySelector(".champ-lock");
      if (open) {
        if (lockBadge) lockBadge.remove();
        card.classList.remove("is-locked");
      } else {
        if (!lockBadge) {
          lockBadge = el("span", { class: "badge badge-loss champ-lock", text: "Closed — regular season over" });
          card.querySelector("h3")?.append(" ", lockBadge);
        }
        card.classList.add("is-locked");
      }
    }
  }

  /* ------------------------------ Stats ------------------------------- */

  function renderStats() {
    const s = Scoring.userStats(record);
    const mvp = Scoring.mvpPick(record);

    $("#statsGrid").innerHTML =
      statCard("Total points", s.total, "gold") +
      statCard("Predictions finished", s.finished, "") +
      statCard("Correct picks", s.correct, "win") +
      statCard("Accuracy", s.accuracy === null ? "—" : s.accuracy + "%", "") +
      statCard("Top 6 points", s.top6Points, "") +
      statCard("Champion points", s.champPoints, "");

    // Accuracy donut
    const pct = s.accuracy === null ? 0 : s.accuracy;
    $("#accDonut").innerHTML =
      `<div class="donut-wrap">${donutSvg(pct)}<div class="donut-center"><span class="dv">${pct}%</span><span class="dl">accuracy</span></div></div>`;
    $("#accNote").textContent = mvp
      ? `MVP pick: ${esc(Store.teamById(mvp.teamId)?.name || "")} (${mvp.count} correct)`
      : s.finished === 0 ? "Predict finished matches to unlock the chart" : "No correct winner yet";

    // Weekly bars
    const weekly = Scoring.weeklyPoints(record);
    const labels = Object.keys(weekly);
    const max = Math.max(1, ...Object.values(weekly));
    const bars = $("#weeklyBars");
    if (!labels.length) {
      bars.innerHTML = '<div class="empty"><div class="e-icon">📊</div><div>No points yet this season</div></div>';
    } else {
      bars.innerHTML =
        `<div class="mb-16">` +
        labels.map((l) =>
          `<div class="bar-row"><span class="br-label">${esc(l)}</span>` +
          `<div class="br-track"><div class="br-fill" style="width:${Math.round((weekly[l] / max) * 100)}%"></div></div>` +
          `<span class="br-val">+${weekly[l]}</span></div>`
        ).join("") +
        `</div>`;
    }

    // Leaderboard
    const rows = Scoring.leaderboard();
    const me = Auth.current();
    $("#leaderboard").innerHTML = rows.length
      ? rows.slice(0, 10).map((r) =>
          `<div class="leader-row"${r.username === me ? ' style="border-color:rgba(245,179,1,.55);"' : ""}>` +
          `<span class="lr-rank">${r.rank}</span>` +
          `<span class="avatar" style="width:30px;height:30px;font-size:.62rem;">${esc(initials(r.username))}</span>` +
          `<span class="lr-name">${esc(r.username)}${r.username === me ? ' <span class="gold" style="font-size:.7rem;">(you)</span>' : ""}</span>` +
          `<span class="lr-acc">${r.finished ? r.accuracy + "%" : "—"}</span>` +
          `<span class="lr-pts">${r.points} pts</span>` +
          `</div>`
        ).join("")
      : '<div class="empty">No predictors yet — be the first!</div>';
  }

  function statCard(label, value, tone) {
    return `<div class="stat-card"><div class="sc-value ${tone}">${esc(String(value))}</div><div class="sc-label">${esc(label)}</div></div>`;
  }

  /* ------------------------------ History ----------------------------- */

  function renderHistory() {
    const wrap = $("#historyTable");
    const ms = Store.allMatches();
    const s = Scoring.userStats(record);

    let rowsHtml = "";
    // Season + champion rows
    if (record.top6 && record.top6.length) {
      const t6 = s.top6Score;
      rowsHtml +=
        `<tr><td><b>Season — Top 6</b></td>` +
        `<td>${record.top6.map((id) => esc(Store.teamById(id)?.shortName || Store.teamById(id)?.tag || "?")).join(", ")}</td>` +
        `<td>—</td><td>—</td>` +
        `<td class="num">${t6.status === "pending" ? "—" : "+" + t6.points}</td>` +
        `<td>${t6.status === "pending" ? '<span class="badge badge-muted">Pending</span>' : '<span class="badge badge-win">Scored</span>'}</td></tr>`;
    }
    if (record.champion) {
      const t = Store.teamById(record.champion);
      rowsHtml +=
        `<tr><td><b>Champion</b></td>` +
        `<td>${esc(t ? t.name : "?")}</td><td>—</td><td>${s.champStatus === "pending" ? "—" : esc(Store.teamById(Scoring.championOf())?.name || "?")}</td>` +
        `<td class="num">${s.champStatus === "pending" ? "—" : s.champPoints}</td>` +
        `<td>${s.champStatus === "pending" ? '<span class="badge badge-muted">Pending</span>' : s.champStatus === "correct" ? '<span class="badge badge-win">Correct</span>' : '<span class="badge badge-loss">Wrong</span>'}</td></tr>`;
    }

    // Match rows (sorted: pending first, then by date)
    const entries = Object.entries(record.matches || {})
      .map(([id, pred]) => ({ id, pred, match: ms.find((m) => m.id === id) }))
      .filter((x) => x.match)
      .sort((a, b) => {
        if (a.match.status === "finished" && b.match.status !== "finished") return 1;
        if (a.match.status !== "finished" && b.match.status === "finished") return -1;
        return new Date(b.match.date) - new Date(a.match.date);
      });

    const body = entries.map(({ pred, match }) => {
      const score = Scoring.scoreMatch(pred, match);
      const a = Store.teamById(match.teamA);
      const b = Store.teamById(match.teamB);
      const statusChip =
        score.status === "pending"
          ? '<span class="badge badge-muted">Pending</span>'
          : score.status === "correct"
          ? '<span class="badge badge-win">Correct</span>'
          : '<span class="badge badge-loss">Wrong</span>';
      return (
        `<tr>` +
        `<td><b>${esc(a ? a.name : "?")}</b> vs <b>${esc(b ? b.name : "?")}</b><div class="muted" style="font-size:.72rem;">${esc(match.weekLabel || "")}</div></td>` +
        `<td>${esc(Store.teamById(pred.winner)?.shortName || Store.teamById(pred.winner)?.tag || "?")}</td>` +
        `<td>${pred.score || "—"}</td>` +
        `<td class="num">${match.status === "finished" ? UI.scoreText(match) : "—"}</td>` +
        `<td class="num">${score.status === "pending" ? "—" : "+" + score.points}</td>` +
        `<td>${statusChip}</td>` +
        `</tr>`
      );
    }).join("");

    wrap.innerHTML =
      `<table class="data-table">` +
      `<thead><tr><th>Match</th><th>Your pick</th><th>Score</th><th>Result</th><th class="num">Points earned</th><th>Status</th></tr></thead>` +
      `<tbody>${rowsHtml}${body}</tbody></table>`;
  }

  /* ------------------------- Export / import -------------------------- */

  function wireImportExport() {
    $("#exportBtn").addEventListener("click", () => {
      const payload = {
        app: "mpl-cambodia-predictions",
        username: Auth.current(),
        exportedAt: new Date().toISOString(),
        predictions: record,
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `mpl-predictions-${Auth.current()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      UI.toast("Predictions exported.", "success");
    });

    $("#importBtn").addEventListener("click", () => $("#importFile").click());
    $("#importFile").addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          const preds = data.predictions || data;
          if (!preds || typeof preds !== "object") throw new Error("bad format");
          const merged = { ...record };
          if (preds.matches && typeof preds.matches === "object") {
            merged.matches = { ...(merged.matches || {}), ...preds.matches };
          }
          if (Array.isArray(preds.top6)) merged.top6 = preds.top6;
          if (preds.champion) merged.champion = preds.champion;
          record = merged;
          Store.savePredictionsFor(Auth.current(), record);
          renderAll();
          UI.toast("Predictions imported and merged.", "success");
        } catch (err) {
          UI.toast("Import failed — invalid JSON file.", "error");
        }
        e.target.value = "";
      };
      reader.readAsText(file);
    });
  }

  /* ------------------------------- Boot ------------------------------- */

  function init() {
    renderGate();
    wirePredictionEvents();
    wireSeasonEvents();
    wireImportExport();
    $("#predWeekFilter").addEventListener("change", renderMatchPredictions);
    $("#predLoginBtn").addEventListener("click", () => UI.openAuth());
    window.addEventListener("auth:change", renderGate);
  }

  return { init, renderGate };
})();
