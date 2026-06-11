/* global React */
const { useState, useEffect, useRef } = React;
// Suppress a known dev-only false-positive React key warning emitted by framer-motion's
// internal child rendering (only when it originates from framer-motion — all real key
// warnings still surface).
(() => {
  const orig = console.error;
  console.error = function (...args) {
    const joined = args.map(a => (typeof a === "string" ? a : "")).join(" ");
    if (joined.includes('unique "key" prop') && joined.includes("framer-motion")) return;
    orig.apply(console, args);
  };
})();
const _SM = window.Motion || {};
const sMotion = _SM.motion || { div: "div" };
const SAnimatePresence = _SM.AnimatePresence || (({ children }) => <>{children}</>);

/* ============================ ICONS ============================ */
const ICONS = {
  dashboard: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  grid: "M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z",
  qrcode: "M4 4h6v6H4z M14 4h6v6h-6z M4 14h6v6H4z M14 14h2v2h-2z M18 14h2v2h-2z M14 18h2v2h-2z M18 18h2v2h-2z",
  compass: "M12 22a10 10 0 100-20 10 10 0 000 20zM16.2 7.8l-2.9 6.4-6.4 2.9 2.9-6.4z",
  user: "M20 21a8 8 0 10-16 0 M12 11a4 4 0 100-8 4 4 0 000 8",
  users: "M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2 M9 11a4 4 0 100-8 4 4 0 000 8 M23 21v-2a4 4 0 00-3-3.87 M16 3.13a4 4 0 010 7.75",
  building: "M3 21h18 M5 21V5a2 2 0 012-2h10a2 2 0 012 2v16 M9 7h2 M13 7h2 M9 11h2 M13 11h2 M9 15h2 M13 15h2",
  check: "M20 6L9 17l-5-5",
  checkCircle: "M22 11.08V12a10 10 0 11-5.93-9.14 M22 4L12 14.01l-3-3",
  x: "M18 6L6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
  arrowRight: "M5 12h14M12 5l7 7-7 7",
  arrowLeft: "M19 12H5M12 19l-7-7 7-7",
  chevronRight: "M9 18l6-6-6-6",
  chevronDown: "M6 9l6 6 6-6",
  search: "M21 21l-4.35-4.35 M11 19a8 8 0 100-16 8 8 0 000 16z",
  settings: "M12 15a3 3 0 100-6 3 3 0 000 6z M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z",
  logout: "M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4 M16 17l5-5-5-5 M21 12H9",
  creditcard: "M1 4h22v16H1z M1 10h22",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  shieldCheck: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z M9 12l2 2 4-4",
  idcard: "M3 5h18v14H3z M7 10a2 2 0 104 0 2 2 0 00-4 0 M6 16c.5-1.5 2-2 3-2s2.5.5 3 2 M14 9h4 M14 13h4",
  lock: "M5 11h14v10H5z M8 11V7a4 4 0 018 0v4",
  mail: "M2 5h20v14H2z M2 6l10 7 10-7",
  phone: "M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0122 16.92z",
  calendar: "M3 5h18v16H3z M3 9h18 M8 3v4 M16 3v4",
  checklist: "M9 6h11 M9 12h11 M9 18h11 M4 6l1 1 2-2 M4 12l1 1 2-2 M4 18l1 1 2-2",
  invoice: "M5 3h11l3 3v15H5z M9 8h6 M9 12h6 M9 16h4",
  chart: "M3 3v18h18 M7 14l3-3 3 3 5-6",
  chartbar: "M3 3v18h18 M8 17V9 M13 17V5 M18 17v-6",
  database: "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3z M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5 M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  box: "M21 8l-9-5-9 5 9 5 9-5z M3 8v8l9 5 9-5V8 M12 13v8",
  ticket: "M3 8a2 2 0 012-2h14a2 2 0 012 2v2a2 2 0 000 4v2a2 2 0 01-2 2H5a2 2 0 01-2-2v-2a2 2 0 000-4z M12 6v12",
  sparkles: "M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8z",
  euro: "M18 7a6 6 0 00-9.6 3 M18 17a6 6 0 01-9.6-3 M4 10h8 M4 14h7",
  sun: "M12 17a5 5 0 100-10 5 5 0 000 10z M12 1v2 M12 21v2 M4.2 4.2l1.4 1.4 M18.4 18.4l1.4 1.4 M1 12h2 M21 12h2 M4.2 19.8l1.4-1.4 M18.4 5.6l1.4-1.4",
  moon: "M21 12.8A9 9 0 1111.2 3 7 7 0 0021 12.8z",
  trash: "M3 6h18 M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2 M19 6l-1 14H6L5 6 M10 11v6 M14 11v6",
  edit: "M11 4H4v16h16v-7 M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4z",
  copy: "M9 9h11v11H9z M5 15H4V4h11v1",
  external: "M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6 M15 3h6v6 M10 14L21 3",
  eid: "M3 5h18v14H3z M7 9h4v6H7z M14 9h4 M14 12h4 M14 15h3",
  itsme: "M12 2a10 10 0 100 20 10 10 0 000-20z M12 7v5l3 3",
  alert: "M12 9v4 M12 17h.01 M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z",
  info: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 16v-4 M12 8h.01",
  pause: "M6 4h4v16H6z M14 4h4v16h-4z",
  play: "M5 3l14 9-14 9z",
  loader: "M12 2v4 M12 18v4 M4.9 4.9l2.8 2.8 M16.3 16.3l2.8 2.8 M2 12h4 M18 12h4 M4.9 19.1l2.8-2.8 M16.3 7.7l2.8-2.8",
  filter: "M22 3H2l8 9.5V19l4 2v-8.5z",
  key: "M21 2l-2 2 M15 7a4 4 0 11-5.66 5.66L3 19l2 2 1-1 1 1 1-1 1 1 2-2-1-1 4.34-4.34A4 4 0 0115 7z",
  bell: "M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9 M13.7 21a2 2 0 01-3.4 0",
  globe: "M12 22a10 10 0 100-20 10 10 0 000 20z M2 12h20 M12 2a15 15 0 010 20 15 15 0 010-20z",
  refresh: "M23 4v6h-6 M1 20v-6h6 M3.5 9a9 9 0 0114.85-3.36L23 10 M1 14l4.65 4.36A9 9 0 0020.5 15",
  more: "M12 13a1 1 0 100-2 1 1 0 000 2z M19 13a1 1 0 100-2 1 1 0 000 2z M5 13a1 1 0 100-2 1 1 0 000 2z",
  menu: "M3 12h18 M3 6h18 M3 18h18",
  layers: "M12 2l9 5-9 5-9-5 9-5z M3 12l9 5 9-5 M3 17l9 5 9-5",
  clock: "M12 22a10 10 0 100-20 10 10 0 000 20z M12 6v6l4 2",
  pencil: "M12 20h9 M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z",
  message: "M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z",
  atSign: "M16 12a4 4 0 10-8 0 4 4 0 008 0z M16 8v5a3 3 0 006 0v-1a10 10 0 10-3.92 7.94",
};
function Icon({ name, size = 18, style, className, strokeWidth = 2 }) {
  const d = ICONS[name] || ICONS.box;
  const fillIcons = ["play"];
  const isFill = fillIcons.includes(name);
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24"
      fill={isFill ? "currentColor" : "none"} stroke={isFill ? "none" : "currentColor"}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      {d.split(" M").map((seg, i) => <path key={i} d={(i === 0 ? seg : "M" + seg)} />)}
    </svg>
  );
}

/* ============================ PRIMITIVES ============================ */
function Btn({ variant = "primary", size, icon, iconRight, children, className = "", ...p }) {
  const cls = ["btn", `btn-${variant}`, size ? `btn-${size}` : "", !children ? "btn-icon" : "", className].join(" ");
  return (
    <button className={cls} {...p}>
      {icon && <Icon name={icon} size={size === "sm" ? 15 : 16} />}
      {children}
      {iconRight && <Icon name={iconRight} size={size === "sm" ? 15 : 16} />}
    </button>
  );
}

function Field({ label, hint, htmlFor, children, required, badge }) {
  return (
    <div className="field">
      {label && <label className="label" htmlFor={htmlFor}>{label}{required && <span style={{ color: "var(--red)" }}>*</span>}{badge}</label>}
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

function Input({ icon, ...p }) {
  if (icon) return <div className="input-icon-wrap"><Icon name={icon} /><input className="input" {...p} /></div>;
  return <input className="input" {...p} />;
}

function Toggle({ on, onClick }) {
  return <button className="toggle" data-on={!!on} onClick={onClick} role="switch" aria-checked={!!on} />;
}

function Badge({ tone = "neutral", dot, icon, children }) {
  return <span className={`badge badge-${tone}`}>{dot && <span className="dot" />}{icon && <Icon name={icon} size={12} />}{children}</span>;
}

function Avatar({ name = "", size = 36, square, color }) {
  const initials = name.split(" ").filter(Boolean).slice(0, 2).map(s => s[0]).join("").toUpperCase();
  return <span className={"avatar" + (square ? " avatar-sq" : "")} style={{ width: size, height: size, fontSize: size * 0.38, background: color }}>{initials}</span>;
}

const APP_COLORS = {
  todo: "#0d9488", agenda: "#2563eb", facturatie: "#7c3aed", crm: "#db2777",
  dossier: "#ea580c", boekhoud: "#0891b2", planning: "#4f46e5", signature: "#16a34a",
};
function AppIcon({ app, size = 48 }) {
  const color = app.color || APP_COLORS[app.key] || "var(--accent)";
  return <span className="appicon" style={{ width: size, height: size, background: color, borderRadius: size * 0.26 }}><Icon name={app.icon} size={size * 0.52} /></span>;
}

/* ============================ MODAL ============================ */
function Modal({ open, onClose, title, children, footer, width = 480 }) {
  useEffect(() => {
    if (!open) return;
    const h = (e) => e.key === "Escape" && onClose && onClose();
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <sMotion.div className="modal-overlay" onMouseDown={onClose}
      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}>
      <sMotion.div className="modal" style={{ width }} onMouseDown={e => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}>
        {title && <div className="modal-head" key="head"><h3 className="t-h2">{title}</h3><Btn variant="ghost" size="sm" icon="x" onClick={onClose} /></div>}
        <div className="modal-body" key="body">{children}</div>
        {footer && <div className="modal-foot" key="foot">{footer}</div>}
      </sMotion.div>
    </sMotion.div>
  );
}

/* ============================ CHARTS ============================ */
function Sparkline({ data, color = "var(--accent)", w = 120, h = 36, fill = true }) {
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - ((v - min) / rng) * (h - 4) - 2]);
  const line = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + " " + p[1].toFixed(1)).join(" ");
  const area = line + ` L${w} ${h} L0 ${h} Z`;
  const id = "sp" + Math.random().toString(36).slice(2, 7);
  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      {fill && <><defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.22" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill={`url(#${id})`} /></>}
      <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function BarChart({ data, color = "var(--accent)", h = 160, labels }) {
  const max = Math.max(...data) || 1;
  return (
    <div className="barchart" style={{ height: h }}>
      {data.map((v, i) => (
        <div className="barchart-col" key={i}>
          <div className="barchart-bar-wrap">
            <div className="barchart-bar" style={{ height: `${(v / max) * 100}%`, background: color, animationDelay: `${i * 50}ms` }} title={String(v)} />
          </div>
          {labels && <span className="barchart-lbl">{labels[i]}</span>}
        </div>
      ))}
    </div>
  );
}

function LineChart({ series, w = 560, h = 200, labels = [] }) {
  const all = series.flatMap(s => s.data);
  const max = Math.max(...all) * 1.1, min = 0;
  const rng = max - min || 1;
  const px = (i, n) => 36 + (i / (n - 1)) * (w - 48);
  const py = (v) => h - 28 - ((v - min) / rng) * (h - 48);
  const grid = [0, 0.25, 0.5, 0.75, 1];
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} style={{ display: "block" }}>
      {grid.map((g, i) => { const y = h - 28 - g * (h - 48); return <line key={i} x1="36" x2={w - 12} y1={y} y2={y} stroke="var(--border)" strokeWidth="1" />; })}
      {grid.map((g, i) => <text key={i} x="28" y={h - 28 - g * (h - 48) + 4} textAnchor="end" fontSize="10" fill="var(--text-3)">{Math.round(min + g * rng)}</text>)}
      {labels.map((l, i) => <text key={i} x={px(i, labels.length)} y={h - 8} textAnchor="middle" fontSize="10" fill="var(--text-3)">{l}</text>)}
      {series.map((s, si) => {
        const line = s.data.map((v, i) => (i ? "L" : "M") + px(i, s.data.length) + " " + py(v)).join(" ");
        return <g key={si}>
          <path d={line} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {s.data.map((v, i) => <circle key={i} cx={px(i, s.data.length)} cy={py(v)} r="3" fill="var(--surface)" stroke={s.color} strokeWidth="2" />)}
        </g>;
      })}
    </svg>
  );
}

function Donut({ segments, size = 150, thickness = 22 }) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <div style={{ position: "relative", width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={thickness} />
        {segments.map((s, i) => {
          const len = (s.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={s.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} strokeLinecap="butt" />;
          off += len; return el;
        })}
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", color: "var(--text)" }}>{total}</span>
        <span style={{ fontSize: 11, color: "var(--text-3)" }}>totaal</span>
      </div>
    </div>
  );
}

Object.assign(window, { Icon, ICONS, Btn, Field, Input, Toggle, Badge, Avatar, AppIcon, APP_COLORS, Modal, Sparkline, BarChart, LineChart, Donut, QrCode });

/* ============================ QR CODE ============================ */
function QrCode({ value = "", size = 104, n = 21 }) {
  // Deterministic pseudo-QR: finder patterns in 3 corners + hashed module grid.
  let seed = 0;
  for (let i = 0; i < value.length; i++) seed = (Math.imul(seed, 31) + value.charCodeAt(i)) >>> 0;
  const rng = (x, y) => {
    let h = (seed ^ Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h >>> 15) & 1) === 1;
  };
  const inFinder = (x, y) => {
    const corners = [[0, 0], [n - 7, 0], [0, n - 7]];
    return corners.some(([cx, cy]) => x >= cx && x < cx + 7 && y >= cy && y < cy + 7);
  };
  const cells = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    if (inFinder(x, y)) continue;
    if (rng(x, y)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" />);
  }
  const finder = (cx, cy) => (
    <g key={`f-${cx}-${cy}`}>
      <rect x={cx} y={cy} width="7" height="7" rx="1.4" fill="none" stroke="currentColor" strokeWidth="1" />
      <rect x={cx + 2} y={cy + 2} width="3" height="3" rx="0.6" />
    </g>
  );
  return (
    <div style={{ width: size, height: size, padding: 8, background: "#fff", borderRadius: "var(--r-sm)", border: "1px solid var(--border)", flexShrink: 0 }}>
      <svg viewBox={`-0.5 -0.5 ${n + 1} ${n + 1}`} width="100%" height="100%" style={{ display: "block", color: "#0b0f14", fill: "#0b0f14" }} shapeRendering="crispEdges">
        {cells}
        {finder(0, 0)}
        {finder(n - 7, 0)}
        {finder(0, n - 7)}
      </svg>
    </div>
  );
}
