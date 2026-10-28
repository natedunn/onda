export const LIMITS = {
	listsPerUser: 50,
	itemsPerList: 100,
	listName: 100,
	listDescription: 1000,
	itemNote: 500,
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

// "grid" is the medium grid; it kept its name when the small and large ones arrived.
export const LAYOUTS = ["list", "compact", "grid-sm", "grid", "grid-lg"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const LAYOUT_LABELS: Record<Layout, string> = {
	list: "List",
	compact: "Compact",
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

