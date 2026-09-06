/* ==========================================================================
 * ui.js — shared UI: loader, navbar, auth modal, toasts, render helpers
 * ========================================================================== */

const UI = (() => {
  const bootStart = Date.now();

  /* ----------------------------- Loader ----------------------------- */

  function hideLoader() {
    const loader = $("#loader");
    if (!loader) return;
    const elapsed = Date.now() - bootStart;
    const wait = Math.max(0, 500 - elapsed); // keep the boot animation readable
    setTimeout(() => loader.classList.add("hidden"), wait);
  }

  /* ----------------------------- Toasts ----------------------------- */

  const ICONS = { success: "✓", error: "✕", info: "ℹ" };

  function toast(message, type = "info", duration = 2600) {
    const stack = $("#toastStack");
    if (!stack) return;
    const node = el("div", { class: `toast ${type}`, role: "status" });
    node.append(el("span", { class: "t-icon", text: ICONS[type] || "ℹ" }));
    node.append(el("div", { text: message }));
    stack.append(node);
    setTimeout(() => {
      node.classList.add("out");
      setTimeout(() => node.remove(), 220);
    }, duration);
  }

  /* --------------------------- Nav & auth --------------------------- */

  function renderNavUser() {
    const area = $("#navUserArea");
    if (!area) return;
    const user = Auth.current();
    const adminLink = $(".admin-link");
    if (adminLink) adminLink.classList.toggle("hidden", !Auth.isAdmin());

    area.innerHTML = "";
    if (user) {
      const chip = el("div", { class: "nav-user" });
      chip.append(el("span", { class: "avatar", text: initials(user), title: user }));
      chip.append(el("span", { class: "nu-name", text: user }));
      const logoutBtn = el("button", { class: "btn btn-ghost btn-sm", text: "Logout" });
      logoutBtn.addEventListener("click", () => {
        Auth.logout();
        renderNavUser();
        toast("Logged out. See you soon!", "info");
        window.dispatchEvent(new CustomEvent("auth:change"));
        // Re-render the current page gate
        const page = document.body.dataset.page;
        if (page === "predictions" && typeof PagePredictions !== "undefined") PagePredictions.renderGate();
        if (page === "profile" && typeof PageProfile !== "undefined") PageProfile.renderGate();
        if (page === "admin" && typeof PageAdmin !== "undefined") PageAdmin.renderGate();
      });
      area.append(chip, logoutBtn);
    } else {
      const btn = el("button", { class: "btn btn-gold btn-sm", text: "Login / Sign up" });
      btn.addEventListener("click", () => openAuth());
      area.append(btn);
    }
  }

  function toggleBurger() {
    const burger = $("#burger");
    const links = $("#navLinks");
    if (!burger || !links) return;
    const open = links.classList.toggle("open");
    burger.classList.toggle("open", open);
    burger.setAttribute("aria-expanded", String(open));
  }

  function wireNav() {
    const burger = $("#burger");
    if (burger) burger.addEventListener("click", toggleBurger);
    // Close the mobile menu when a link is tapped
    $$("#navLinks a").forEach((a) => a.addEventListener("click", () => linksClose()));
    document.addEventListener("click", (e) => {
      if (!$("#navLinks")?.classList.contains("open")) return;
      if (!e.target.closest(".nav")) toggleBurger();
    });
  }

  function linksClose() {
    const links = $("#navLinks");
    const burger = $("#burger");
    if (links?.classList.contains("open")) {
      links.classList.remove("open");
      burger?.classList.remove("open");
      burger?.setAttribute("aria-expanded", "false");
    }
  }

  /* --------------------------- Auth modal --------------------------- */

  let authMode = "login"; // 'login' | 'register'

  function openAuth(tab = "login") {
    authMode = tab;
    const modal = $("#authModal");
    if (!modal) return;
    const title = $("#authTitle");
    const submit = $("#authSubmit");
    const error = $("#authError");
    if (title) title.textContent = tab === "login" ? "Login" : "Create account";
    if (submit) submit.textContent = tab === "login" ? "Login" : "Create account";
    if (error) error.classList.add("hidden");
    $$(".auth-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.atab === tab));
    modal.classList.add("open");
    modal.setAttribute("aria-hidden", "false");
    setTimeout(() => $("#authUser")?.focus(), 60);
  }

  function closeAuth() {
    const modal = $("#authModal");
    if (modal) {
      modal.classList.remove("open");
      modal.setAttribute("aria-hidden", "true");
    }
  }

  function wireAuthModal() {
    const modal = $("#authModal");
    if (!modal) return;

    $("#authClose")?.addEventListener("click", closeAuth);
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeAuth();
    });

    $$(".auth-tabs button").forEach((b) =>
      b.addEventListener("click", () => openAuth(b.dataset.atab))
    );

    const form = $("#authForm");
    form?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const user = $("#authUser").value;
      const pass = $("#authPass").value;
      const error = $("#authError");
      const result = authMode === "login" ? await Auth.login(user, pass) : await Auth.register(user, pass);
      if (!result.ok) {
        error.textContent = result.error;
        error.classList.remove("hidden");
        return;
      }
      error.classList.add("hidden");
      form.reset();
      closeAuth();
      renderNavUser();
      toast(authMode === "register" ? "Account created — welcome to the arena!" : `Welcome back, ${user}!`, "success");
      authMode = "login";
      window.dispatchEvent(new CustomEvent("auth:change"));
      // Re-render gates + page data
      const page = document.body.dataset.page;
      if (page === "predictions" && typeof PagePredictions !== "undefined") PagePredictions.renderGate();
      if (page === "profile" && typeof PageProfile !== "undefined") PageProfile.renderGate();
    });
  }

  /* ---------------------- Shared render helpers ---------------------- */

  /** Team avatar image element (falls back to initials chip) */
  function teamImg(team, size = 30) {
    if (team && team.logo) {
      return el("img", { src: team.logo, alt: `${team.name} logo`, style: `width:${size}px;height:${size}px;` });
    }
    return el("span", {
      class: "avatar",
      text: initials(team ? team.name : "?"),
      style: `width:${size}px;height:${size}px;font-size:${Math.max(10, size * 0.32)}px;`,
    });
  }

  /** Qualification badge for a standings rank */
  function qualBadge(rank) {
    if (rank <= 2) return '<span class="badge badge-gold">Upper semifinal</span>';
    if (rank <= 6) return '<span class="badge badge-violet">Playoffs</span>';
    return '<span class="badge badge-muted">Eliminated</span>';
  }

  /** Score string from a match result, e.g. "2 - 0" */
  function scoreText(m) {
    if (!m.result) return "";
    return `${m.result.scoreA} - ${m.result.scoreB}`;
  }

  /** Empty state block */
  function emptyState(icon, text) {
    return el("div", { class: "empty" }, el("div", { class: "e-icon", text: icon }), el("div", { text }));
  }

  /* ------------------------------ Boot ------------------------------ */

  /** In cloud mode the auth form asks for an email instead of a username */
  function applyCloudAuthLabels() {
    const cloud = typeof Cloud !== "undefined" && Cloud.enabled();
    const input = $("#authUser");
    const label = $(".modal .field label[for='authUser']");
    if (!input || !label) return;
    if (cloud) {
      label.textContent = "Email";
      input.placeholder = "you@example.com";
      input.autocomplete = "email";
      input.type = "email";
    } else {
      label.textContent = "Username";
      input.placeholder = "Your username";
      input.autocomplete = "username";
      input.type = "text";
    }
  }

  function boot() {
    wireNav();
    wireAuthModal();
    applyCloudAuthLabels();
    renderNavUser();
    hideLoader();
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        closeAuth();
        linksClose();
      }
    });
  }

  return { boot, toast, renderNavUser, openAuth, closeAuth, teamImg, qualBadge, scoreText, emptyState };
})();
