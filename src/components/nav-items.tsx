export const NAV_ITEMS = [
  { href: "/", label: "Dashboard", icon: "dashboard" },
  { href: "/wallet", label: "Wallet", icon: "account_balance_wallet" },
  { href: "/gateway", label: "Gateway", icon: "api" },
  { href: "/ledger", label: "Token Ledger", icon: "receipt_long" },
  { href: "/projects", label: "Projects", icon: "account_tree" },
  { href: "/budgets", label: "Budgets", icon: "savings" },
  { href: "/models", label: "Models", icon: "memory" },
  { href: "/reports", label: "Usage Trends", icon: "query_stats" },
  { href: "/insights", label: "AI Insights", icon: "auto_awesome" },
  { href: "/assistant", label: "Copilot", icon: "smart_toy" },
] as const;

export const MOBILE_NAV_ITEMS = [
  { href: "/", label: "Home", icon: "home" },
  { href: "/reports", label: "Spend", icon: "query_stats" },
  { href: "/gateway", label: "Meter", icon: "api" },
  { href: "/wallet", label: "Wallet", icon: "account_balance_wallet" },
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;

export const SECONDARY_NAV = [
  { href: "/settings", label: "Settings", icon: "settings" },
] as const;
