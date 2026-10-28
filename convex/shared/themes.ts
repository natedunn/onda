// Palettes carried over from RAD. `ink` is the text color that reads on top.
export const THEMES = [
	{ id: "deep-space", name: "Deep space", ink: "#fff", colors: ["#000000", "#3d3d3d", "#454545", "#6d6d6d"] },
	{ id: "blood-orange", name: "Blood orange", ink: "#fff", colors: ["#d26f3d", "#e08a52", "#a3452b", "#391711"] },
	{ id: "after-hours", name: "After hours", ink: "#fff", colors: ["#ff6363", "#7000ff", "#151515", "#202123"] },
	{ id: "solar", name: "Solar", ink: "#fff", colors: ["#ff2828", "#ff4409", "#fda829", "#ffe2b8"] },
	{ id: "pop", name: "Pop", ink: "#fff", colors: ["#6903f9", "#7917ff", "#ebe5ff", "#d9ceff"] },
	{ id: "fair", name: "Fair", ink: "#0b2a30", colors: ["#4ca1af", "#7fbcc6", "#c4e0e5", "#e3f1f3"] },
	{ id: "verano", name: "Verano", ink: "#fff", colors: ["#22c1c3", "#15888c", "#fdbb2d", "#fecd4b"] },
	{ id: "mint", name: "Mint", ink: "#0d3b2a", colors: ["#d7fbe8", "#9df3c4", "#62d2a2", "#1fab89"] },
	{ id: "cake", name: "Cake", ink: "#3a2020", colors: ["#d57e7e", "#c6d57e", "#a2cdcd", "#ffe1af"] },
	{ id: "punk", name: "Punk", ink: "#fff", colors: ["#00ff9f", "#00b8ff", "#d600ff", "#bd00ff"] },
	{ id: "artisan", name: "Artisan", ink: "#fff", colors: ["#f9322c", "#c42620", "#232323", "#ffffff"] },
	{ id: "dusk", name: "Dusk", ink: "#fff", colors: ["#de492a", "#34285a", "#ee992e", "#0b0b0a"] },
	{ id: "forest", name: "Forest", ink: "#fff", colors: ["#606c38", "#283618", "#bc6c25", "#ffdcb5"] },
	{ id: "paper", name: "Paper", ink: "#111", colors: ["#ffffff", "#f4f2f2", "#ebe8e8", "#b5b5b5"] },
	{ id: "sand", name: "Sand", ink: "#3b2f27", colors: ["#edede9", "#d6d3c1", "#f5ebe0", "#d5bdaf"] },
	{ id: "web", name: "Web", ink: "#fff", colors: ["#396afc", "#2948ff", "#1f3bd1", "#2f4f9f"] },
] as const;

export type Theme = (typeof THEMES)[number];
export type ThemeId = Theme["id"];

export const DEFAULT_THEME: ThemeId = "blood-orange";

export function getTheme(id: string | undefined): Theme {
	return THEMES.find((t) => t.id === id) ?? THEMES[1];
}

export function isThemeId(id: string): id is ThemeId {
	return THEMES.some((t) => t.id === id);
}

// mulberry32: tiny deterministic PRNG so a seed always draws the same mesh.
function rng(seed: number) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export function randomSeed() {
	return Math.floor(Math.random() * 2 ** 31);
}

export const MESH_BLOBS = 6;

/**
 * The shape of a mesh: a base color and blobs, as indexes into a theme's colors.
 * Every theme has four colors, so one seed lays out the same mesh in any theme.
 */
export function meshLayout(seed: number) {
	const rand = rng(seed);
	const pick = () => Math.floor(rand() * 4);
	const base = pick();
	const blobs = Array.from({ length: MESH_BLOBS }, () => {
		const x = Math.round(rand() * 100);
		const y = Math.round(rand() * 100);
		const size = 45 + Math.round(rand() * 35);
		return { x, y, size, color: pick() };
	});
	return { base, blobs };
}

/**
 * A mesh-ish gradient built from stacked radial gradients. Plain CSS so the
 * same output works in the browser and in the OG image renderer.
 */
export function meshGradient(themeId: string, seed: number) {
	const { colors } = getTheme(themeId);
	const { base, blobs } = meshLayout(seed);
	return {
		backgroundColor: colors[base],
		backgroundImage: blobs
			.map((b) => `radial-gradient(circle at ${b.x}% ${b.y}%, ${colors[b.color]} 0%, transparent ${b.size}%)`)
			.join(", "),
	};
}
