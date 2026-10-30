export const LIMITS = {
	listsPerUser: 50,
	itemsPerList: 100,
	listName: 100,
	listDescription: 1000,
	itemNote: 5000,
	bio: 160,
} as const;

/** How many of a list's first items list rows show as a peek at what's inside. */
export const PEEK = 6;

export const KINDS = ["movie", "show", "book", "album", "game"] as const;
export type Kind = (typeof KINDS)[number];

// `one`/`many` are for use mid-sentence; `title` is for standalone places like a select.
export const KIND_LABELS: Record<Kind, { one: string; many: string; title: string }> = {
	movie: { one: "movie", many: "movies", title: "Movie" },
	show: { one: "show", many: "shows", title: "Show" },
	book: { one: "book", many: "books", title: "Book" },
	album: { one: "album", many: "albums", title: "Album" },
	game: { one: "game", many: "games", title: "Game" },
};

// Languages the add dialog can search in (experimental, behind a setting). English is the
// default and the only language of the rest of the app.
export const LANGUAGES = ["en", "es"] as const;
export type Language = (typeof LANGUAGES)[number];

export const LANGUAGE_LABELS: Record<Language, string> = { en: "English", es: "Español" };

// Kinds whose sources answer in other languages; albums and games are the same in any.
export const LOCALIZED_KINDS: Kind[] = ["movie", "show", "book"];

// The medium size of each family goes by the bare name ("list", "grid").
export const LAYOUTS = ["minimal", "list", "list-lg", "grid-sm", "grid", "grid-lg"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const LAYOUT_LABELS: Record<Layout, string> = {
	minimal: "Minimal",
	list: "List — Medium",
	"list-lg": "List — Large",
	"grid-sm": "Grid — Small",
	grid: "Grid — Medium",
	"grid-lg": "Grid — Large",
};

export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$/;

export const SOURCE_LABELS = {
	tmdb: "TMDB",
	openlibrary: "Open Library",
	musicbrainz: "MusicBrainz",
	igdb: "IGDB",
} as const;

