export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/setup", label: "Setup", icon: "checklist" },
  { href: "/gateway", label: "Gateway", icon: "api" },
  { href: "/ledger", label: "Token Ledger", icon: "receipt_long" },
  { href: "/reports", label: "Usage Trends", icon: "query_stats" },
  { href: "/wallet", label: "Wallet", icon: "account_balance_wallet" },
  { href: "/projects", label: "Projects", icon: "account_tree" },
  { href: "/budgets", label: "Budgets", icon: "savings" },
  { href: "/models", label: "Models", icon: "memory" },
  { href: "/insights", label: "AI Insights", icon: "auto_awesome" },
  { href: "/assistant", label: "Copilot", icon: "smart_toy" },
] as const;

export const NAV_SECTIONS = [
  {
    label: "Operate",
    items: NAV_ITEMS.slice(0, 5),
  },
  {
    label: "Govern",
    items: NAV_ITEMS.slice(5, 9),
  },
  {
    label: "Explore",
    items: NAV_ITEMS.slice(9),
  },
] as const;

export const MOBILE_NAV_ITEMS = [
  { href: "/dashboard", label: "Home", icon: "home" },
  { href: "/setup", label: "Setup", icon: "checklist" },
  { href: "/gateway", label: "Meter", icon: "api" },
  { href: "/reports", label: "Spend", icon: "query_stats" },
  { href: "/wallet", label: "Wallet", icon: "account_balance_wallet" },
] as const;

export const SECONDARY_NAV = [
  { href: "/settings", label: "Admin settings", icon: "settings" },
  { href: "/settings/integrations", label: "Integrations", icon: "deployed_code" },
  { href: "/settings/security", label: "Security", icon: "shield_lock" },
  { href: "/settings/credentials", label: "Credentials", icon: "vpn_key" },
] as const;
