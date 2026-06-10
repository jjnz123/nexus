export const COLOR_THEMES = ["dark", "light"] as const;

export type ColorTheme = (typeof COLOR_THEMES)[number];

export const THEME_COOKIE = "nexus-theme";

export const DEFAULT_COLOR_THEME: ColorTheme = "dark";

export function normalizeColorTheme(value: string | null | undefined): ColorTheme {
  return value === "light" ? "light" : "dark";
}

export function applyColorTheme(theme: ColorTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove("dark", "light");
  document.documentElement.classList.add(theme);
}
