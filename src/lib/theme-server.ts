import { cookies } from "next/headers";
import {
  DEFAULT_COLOR_THEME,
  normalizeColorTheme,
  THEME_COOKIE,
  type ColorTheme,
} from "@/lib/theme";

export async function getThemeFromCookie(): Promise<ColorTheme> {
  const cookieStore = await cookies();
  return normalizeColorTheme(cookieStore.get(THEME_COOKIE)?.value);
}

export async function setThemeCookie(theme: ColorTheme) {
  const cookieStore = await cookies();
  cookieStore.set(THEME_COOKIE, theme, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}

export async function syncThemeCookie(theme: ColorTheme) {
  const cookieStore = await cookies();
  const current = cookieStore.get(THEME_COOKIE)?.value;
  if (normalizeColorTheme(current) === theme) return;
  await setThemeCookie(theme);
}

export { DEFAULT_COLOR_THEME };
