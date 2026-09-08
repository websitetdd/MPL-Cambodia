/* ==========================================================================
 * utils.js — shared helpers (DOM, formatting, countdown, ids)
 * ========================================================================== */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Create an element quickly: el("div", {class:"x"}, "text") */
function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") node.className = v;
    else if (k === "text") node.textContent = v;
    else if (k === "html") node.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") node.addEventListener(k.slice(2), v);
    else node.setAttribute(k, v);
  }
  children.forEach((c) => {
    if (c == null) return;
    node.append(c.nodeType ? c : document.createTextNode(c));
  });
  return node;
}

/** Escape HTML to prevent injection from user content */
function esc(str) {
  return String(str ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[m]));
}

/** Tiny non-crypto hash for demo passwords (NOT secure — demo build only) */
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return "h" + (h >>> 0).toString(36);
}

/** Unique id */
function uid(prefix = "id") {
  return prefix + "-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 7);
}

/** Parse an ISO date string into a Date object (works with +07:00 offsets) */
function toDate(iso) {
  return new Date(iso);
}

/** Format a date for display: "Saturday, Aug 28" */
function formatDate(iso) {
  const d = toDate(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

/** Format a time for display: "7:00 PM" */
function formatTime(iso) {
  const d = toDate(iso);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/** Nice long date for news: "Aug 24, 2026" */
function formatLongDate(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Time left until an ISO date -> {days, hours, minutes, seconds, done} */
function timeLeft(iso) {
  const diff = toDate(iso).getTime() - Date.now();
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  const s = Math.floor(diff / 1000);
  return {
    days: Math.floor(s / 86400),
    hours: Math.floor((s % 86400) / 3600),
    minutes: Math.floor((s % 3600) / 60),
    seconds: s % 60,
    done: false,
  };
}

/** Pad a number to 2 digits */
const pad2 = (n) => String(n).padStart(2, "0");

/** Debounce a function */
function debounce(fn, ms = 300) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/** Initials from a name, max 3 chars */
function initials(name) {
  return String(name || "?")
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

/** SVG donut chart for accuracy — returns markup */
function donutSvg(pct, size = 150, stroke = 14) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const filled = Math.max(0, Math.min(100, pct)) / 100;
  const gap = 6; // small gap between arc ends
  const dash = c * filled;
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" role="img" aria-label="Accuracy ${Math.round(pct)} percent">` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--card-2)" stroke-width="${stroke}"/>` +
    `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="url(#donutGrad)" stroke-width="${stroke}" ` +
    `stroke-linecap="round" stroke-dasharray="${dash - gap} ${c}" />` +
    `<defs><linearGradient id="donutGrad" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#F5B301"/><stop offset="1" stop-color="#8E44D6"/></linearGradient></defs></svg>`
  );
}

/** Convert a YouTube watch/short URL into an embed URL, or null */
function youtubeEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url.trim());
    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      if (u.hostname === "youtu.be") return `https://www.youtube-nocookie.com/embed/${u.pathname.slice(1)}`;
      const v = u.searchParams.get("v");
      if (v) return `https://www.youtube-nocookie.com/embed/${v}`;
      if (u.pathname.startsWith("/embed/")) return `https://www.youtube-nocookie.com${u.pathname}`;
      if (u.pathname.startsWith("/live/")) return `https://www.youtube-nocookie.com/embed/${u.pathname.split("/")[2]}`;
    }
  } catch (e) { /* ignore */ }
  return null;
}

/** Read a file as data URL (for logo/news uploads) */
function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
