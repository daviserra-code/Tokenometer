import type { Config } from "tailwindcss";

// Tokens come from the Stitch design system:
// stitch_tokenradar_ui_design/tokenradar_ai_finops_design_system/DESIGN.md
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0F172A",
        "on-background": "#dde4e5",

        surface: "#1E293B",
        "surface-dim": "#0e1416",
        "surface-bright": "#343a3c",
        "surface-elevated": "#334155",
        "surface-variant": "#2f3638",
        "surface-container-lowest": "#090f11",
        "surface-container-low": "#161d1e",
        "surface-container": "#1a2122",
        "surface-container-high": "#242b2d",
        "surface-container-highest": "#2f3638",

        "on-surface": "#dde4e5",
        "on-surface-variant": "#bbc9cd",
        "inverse-surface": "#dde4e5",
        "inverse-on-surface": "#2b3233",

        outline: "#859397",
        "outline-variant": "#3c494c",
        "border-subtle": "#1E293B",
        "text-muted": "#94A3B8",

        // Brand: cyan
        primary: "#8aebff",
        "primary-container": "#22d3ee",
        "on-primary": "#00363e",
        "on-primary-container": "#005763",
        "inverse-primary": "#006877",
        "primary-fixed": "#a2eeff",
        "primary-fixed-dim": "#2fd9f4",
        "on-primary-fixed": "#001f25",
        "on-primary-fixed-variant": "#004e5a",
        "surface-tint": "#2fd9f4",

        secondary: "#bdc2ff",
        "on-secondary": "#131e8c",
        "secondary-container": "#2f3aa3",
        "on-secondary-container": "#a8afff",

        tertiary: "#ffd6a3",
        "on-tertiary": "#462b00",
        "tertiary-container": "#ffb13b",
        "on-tertiary-container": "#6e4600",

        error: "#ffb4ab",
        "on-error": "#690005",
        "error-container": "#93000a",
        "on-error-container": "#ffdad6",

        // Status & token-type accents
        "status-normal": "#10B981",
        "status-warning": "#F59E0B",
        "status-exceeded": "#EF4444",
        "input-token": "#38BDF8",
        "output-token": "#818CF8",
      },
      fontFamily: {
        display: ["var(--font-space-grotesk)", "Space Grotesk", "system-ui", "sans-serif"],
        sans: ["var(--font-manrope)", "Manrope", "system-ui", "sans-serif"],
        mono: ["var(--font-inter)", "Inter", "ui-monospace", "monospace"],
      },
      fontSize: {
        display: ["48px", { lineHeight: "1.1", letterSpacing: "-0.02em", fontWeight: "700" }],
        h1: ["32px", { lineHeight: "1.2", fontWeight: "600" }],
        h2: ["24px", { lineHeight: "1.3", fontWeight: "600" }],
        kpi: ["28px", { lineHeight: "1", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "1.6", fontWeight: "400" }],
        "body-md": ["14px", { lineHeight: "1.5", fontWeight: "400" }],
        data: ["13px", { lineHeight: "1.4", letterSpacing: "0.02em", fontWeight: "500" }],
        caps: ["11px", { lineHeight: "1", letterSpacing: "0.05em", fontWeight: "700" }],
      },
      spacing: {
        "container-margin": "24px",
        gutter: "16px",
        "card-padding": "20px",
        "section-gap": "32px",
      },
      borderRadius: {
        DEFAULT: "0.25rem",
        sm: "0.125rem",
        md: "0.375rem",
        lg: "0.5rem",
        xl: "0.75rem",
        "2xl": "1rem",
        full: "9999px",
      },
      boxShadow: {
        card: "0 1px 0 0 rgba(255,255,255,0.02), 0 1px 2px 0 rgba(0,0,0,0.4)",
        glow: "0 0 24px rgba(34,211,238,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
