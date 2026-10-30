import { createIsomorphicFn } from "@tanstack/react-start";

/** "system" follows the device; "light" and "dark" pin it. Kept in a cookie so SSR renders the right one. */
export type Theme = "system" | "light" | "dark";

const COOKIE = "theme";

function parse(value: string | undefined): Theme {
	return value === "light" || value === "dark" ? value : "system";
}

export const readTheme = createIsomorphicFn()
	.server(async () => {
		const { getCookie } = await import("@tanstack/react-start/server");
		return parse(getCookie(COOKIE));
	})
	.client(async () => parse(document.cookie.match(/(?:^|; )theme=([^;]*)/)?.[1]));

/** Applies the theme now and remembers it on this device. The root reads the cookie on its next load. */
export function saveTheme(theme: Theme) {
	document.cookie =
		theme === "system"
			? `${COOKIE}=; path=/; max-age=0`
			: `${COOKIE}=${theme}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
	if (theme === "system") delete document.documentElement.dataset.theme;
	else document.documentElement.dataset.theme = theme;
}

/** A few of each palette's colors, for places CSS variables can't reach (theme-color, the settings
    previews, which have to show both palettes at once). Keep in step with app.css. */
export const PALETTE = {
	light: { paper: "#fbfaf6", ink: "#151513", rule: "#dcd8ce" },
	dark: { paper: "#121211", ink: "#ecebe5", rule: "#2e2d2a" },
};
