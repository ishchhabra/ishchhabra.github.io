/**
 * Theme-aware color palettes for article SVG diagrams.
 *
 * Design principles:
 * - Dark mode: borders are neutral (barely visible). Color meaning comes from text only.
 * - Light mode: borders carry soft accent tints for visual grouping. Text is saturated.
 * - Status boxes (success/warning) use tinted backgrounds in both modes.
 */
export const diagramPalette = {
  dark: {
    // Canvas & surfaces
    canvas: "#0d1117",
    card: "#1a1a2e",
    cardAlt: "#0f172a",

    // Borders — neutral slate so they hint at structure without adding color weight
    border: "#1e293b",

    // Text hierarchy
    heading: "#e2e8f0",
    body: "#94a3b8",
    caption: "#64748b",

    // Accent text — bright enough to read on dark canvas
    blue: "#93c5fd",
    purple: "#c4b5fd",
    green: "#4ade80",
    orange: "#fbbf24",
    red: "#f87171",

    // Status boxes
    successBg: "#052e16",
    successBorder: "#22c55e",
    successText: "#4ade80",
    warnBg: "#451a03",
    warnBorder: "#f59e0b",
    warnText: "#fbbf24",

    // Arrows & connector lines
    arrow: "#475569",
  },
  light: {
    canvas: "#f1f5f9",
    card: "#ffffff",
    cardAlt: "#f8fafc",
    border: "#cbd5e1",

    heading: "#0f172a",
    body: "#475569",
    caption: "#64748b",

    blue: "#2563eb",
    purple: "#7c3aed",
    green: "#16a34a",
    orange: "#d97706",
    red: "#dc2626",

    successBg: "#dcfce7",
    successBorder: "#16a34a",
    successText: "#15803d",
    warnBg: "#fffbeb",
    warnBorder: "#d97706",
    warnText: "#b45309",

    arrow: "#64748b",
  },
} as const;
