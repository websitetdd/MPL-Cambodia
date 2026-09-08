/* ==========================================================================
 * scoring.js — prediction scoring engine
 *
 * Rules:
 *   Match   — correct winner +100, correct exact score +200 (both = 300)
 *   Top 6   — exact position +100, in top 6 (wrong spot) +50
 *   Champion — correct tournament champion +500
 * ========================================================================== */

const Scoring = (() => {
  const DEFAULT_RULES = {
    correctWinner: 100,
    correctScore: 200,
    seasonExact: 100,
    seasonInTop6: 50,
    champion: 500,
  };

  /** Active point values — merged from admin-editable config (data/config.json
   *  → predictionRules), falling back to the defaults above. */
  function rules() {
    const cfg = Store.config() || {};
    const r = cfg.predictionRules || {};
    return { ...DEFAULT_RULES, ...r };
  }

  /** Score one match prediction against its result */
  function scoreMatch(pred, match) {
    const R = rules();
    if (!match || !pred) return { status: "pending", points: 0, winnerCorrect: false, scoreCorrect: false };
    if (match.status !== "finished" || !match.result) {
      return { status: "pending", points: 0, winnerCorrect: false, scoreCorrect: false };
    }
    const winnerCorrect = pred.winner === match.result.winner;
    const actualScore = `${match.result.scoreA}-${match.result.scoreB}`;
    const scoreCorrect = pred.score === actualScore;
    const points = (winnerCorrect ? R.correctWinner : 0) + (scoreCorrect ? R.correctScore : 0);
    return {
      status: winnerCorrect ? "correct" : "wrong",
      points,
      winnerCorrect,
      scoreCorrect,
      actualScore,
    };
  }

  /** True when every regular-season match is finished (playoffs excluded —
   *  they must not delay Top-6 / champion picks or season scoring) */
  function seasonDone() {
    const reg = Store.regularMatches();
    return reg.length > 0 && reg.every((m) => m.status === "finished" && m.result);
  }

  /** Tournament champion = Grand Final winner, or null.
   *  If the bracket-reset grand final (gf2) was played, its winner is the
   *  champion (it only exists when the upper-bracket winner lost gf). */
  function championOf() {
    const pMs = Store.playoffMatches();
    const gf2 = pMs.find((m) => m.id === "gf2");
    if (gf2 && gf2.status === "finished" && gf2.result) return gf2.result.winner;
    const gf = pMs.find((m) => m.id === "gf");
    if (gf && gf.status === "finished" && gf.result) return gf.result.winner;
    return null;
  }

  /** Score a Top-6 prediction list against final standings */
  function scoreTop6(list) {
    if (!Array.isArray(list) || list.length === 0) return { points: 0, status: "pending", exact: 0, inTop6: 0 };
    if (!seasonDone()) return { points: 0, status: "pending", exact: 0, inTop6: 0 };
    const top6 = Store.computeStandings().slice(0, 6).map((r) => r.team);
    let exact = 0;
    let inTop6 = 0;
    list.slice(0, 6).forEach((teamId, i) => {
      if (teamId === top6[i]) exact += 1;
      else if (top6.includes(teamId)) inTop6 += 1;
    });
    const R = rules();
    const points = exact * R.seasonExact + inTop6 * R.seasonInTop6;
    return { points, status: "scored", exact, inTop6 };
  }

  /** Full stats for one user's prediction record */
  function userStats(record) {
    const empty = {
      matchPoints: 0, top6Points: 0, champPoints: 0, total: 0,
      predicted: 0, finished: 0, correct: 0, wrong: 0, pending: 0,
      accuracy: null,
      top6Score: { points: 0, status: "pending", exact: 0, inTop6: 0 },
      champStatus: "pending",
      champion: null,
    };
    if (!record) return empty;
    const stats = { ...empty };

    // Match predictions
    const ms = Store.allMatches();
    Object.entries(record.matches || {}).forEach(([matchId, pred]) => {
      const match = ms.find((m) => m.id === matchId);
      if (!match) return;
      stats.predicted += 1;
      const s = scoreMatch(pred, match);
      if (s.status === "pending") stats.pending += 1;
      else {
        stats.finished += 1;
        stats.matchPoints += s.points;
        if (s.status === "correct") stats.correct += 1;
        else stats.wrong += 1;
      }
    });

    // Top 6
    const t6 = scoreTop6(record.top6);
    stats.top6Score = t6;
    stats.top6Points = t6.points;

    // Champion
    const champ = championOf();
    if (record.champion) {
      stats.champion = record.champion;
      if (champ) {
        stats.champStatus = record.champion === champ ? "correct" : "wrong";
        if (stats.champStatus === "correct") stats.champPoints = rules().champion;
      }
    }

    stats.total = stats.matchPoints + stats.top6Points + stats.champPoints;
    stats.accuracy = stats.finished > 0 ? Math.round((stats.correct / stats.finished) * 100) : null;
    return stats;
  }

  /** Leaderboard across all local accounts */
  function leaderboard() {
    const preds = Store.allPredictions();
    const rows = Object.keys(preds).map((username) => {
      const s = userStats(preds[username]);
      return { username, points: s.total, correct: s.correct, finished: s.finished, accuracy: s.accuracy };
    });
    rows.sort((a, b) => b.points - a.points || (b.accuracy || 0) - (a.accuracy || 0));
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  }

  /** MVP pick: the team with the most correct winner predictions */
  function mvpPick(record) {
    if (!record || !record.matches) return null;
    const tally = {};
    const ms = Store.allMatches();
    Object.entries(record.matches).forEach(([matchId, pred]) => {
      const match = ms.find((m) => m.id === matchId);
      const s = scoreMatch(pred, match);
      if (s.winnerCorrect) tally[pred.winner] = (tally[pred.winner] || 0) + 1;
    });
    const best = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    return best ? { teamId: best[0], count: best[1] } : null;
  }

  /** Points earned per week (regular + playoff), for the weekly chart */
  function weeklyPoints(record) {
    const map = {};
    if (!record || !record.matches) return map;
    const ms = Store.allMatches();
    Object.entries(record.matches).forEach(([matchId, pred]) => {
      const match = ms.find((m) => m.id === matchId);
      if (!match) return;
      const s = scoreMatch(pred, match);
      if (s.points > 0) {
        // Playoff fixtures carry no weekLabel — group them under "Playoffs"
        const label = match.weekLabel || (Store.isPlayoffMatch(match) ? "Playoffs" : "Week " + (match.week || ""));
        map[label] = (map[label] || 0) + s.points;
      }
    });
    return map;
  }

  return {
    rules, DEFAULT_RULES, scoreMatch, seasonDone, championOf, scoreTop6, userStats,
    leaderboard, mvpPick, weeklyPoints,
  };
})();
