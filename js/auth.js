/* ==========================================================================
 * auth.js — user accounts, sessions, admin auth (LocalStorage demo build)
 *
 * IMPORTANT: this is a front-end-only demo. Passwords are lightly hashed
 * (djb2) and everything lives in the user's browser. For real shared
 * accounts use a backend (Firebase / Supabase / PocketBase).
 * ========================================================================== */

const Auth = (() => {
  /** Validate a username: 3-20 chars, letters/numbers/underscore/hyphen */
  function validUsername(name) {
    return /^[A-Za-z0-9_-]{3,20}$/.test(name);
  }

  /** Cloud mode: username field carries an email address */
  function cloudActive() {
    return typeof Cloud !== "undefined" && Cloud.enabled();
  }

  async function register(username, password) {
    if (cloudActive()) {
      const name = String(username || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return { ok: false, error: "Enter a valid email address." };
      if (!password || password.length < 6) return { ok: false, error: "Password must be at least 6 characters." };
      return Cloud.signUp(name, password);
    }
    const name = String(username || "").trim();
    if (!validUsername(name)) return { ok: false, error: "Username must be 3-20 characters (letters, numbers, _ or -)." };
    if (!password || password.length < 4) return { ok: false, error: "Password must be at least 4 characters." };
    if (Store.getUser(name)) return { ok: false, error: "That username is already taken." };

    const users = Store.users();
    users[name] = {
      passwordHash: hash(password),
      createdAt: new Date().toISOString(),
    };
    Store.saveUsers(users);
    Store.setSession(name);
    return { ok: true };
  }

  async function login(username, password) {
    if (cloudActive()) {
      const name = String(username || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(name)) return { ok: false, error: "Enter the email address you signed up with." };
      return Cloud.signIn(name, password);
    }
    const name = String(username || "").trim();
    const user = Store.getUser(name);
    if (!user || user.passwordHash !== hash(password)) {
      return { ok: false, error: "Invalid username or password." };
    }
    Store.setSession(name);
    return { ok: true };
  }

  function logout() {
    if (cloudActive()) Cloud.signOut();
    Store.setSession(null);
    Store.lsRemove("adminSession");
  }

  function current() {
    return Store.currentUser();
  }

  /** Admin session management */
  async function adminLogin(username, password) {
    if (cloudActive()) {
      return Cloud.adminLogin(String(username || "").trim(), password);
    }
    const admin = Store.getAdmin();
    if (username === admin.username && hash(password) === admin.passwordHash) {
      Store.lsSet("adminSession", { at: Date.now() });
      return { ok: true };
    }
    return { ok: false, error: "Invalid admin credentials." };
  }

  function isAdmin() {
    return !!Store.lsGet("adminSession");
  }

  function adminLogout() {
    Store.lsRemove("adminSession");
  }

  return { register, login, logout, current, adminLogin, isAdmin, adminLogout, validUsername };
})();
