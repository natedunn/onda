export const LIMITS = {
	listsPerUser: 50,
	itemsPerList: 100,
	listName: 100,
	listDescription: 1000,
	itemNote: 500,
	bio: 160,
} as const;

export const KINDS = ["movie", "show", "book", "album", "game"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABELS: Record<Kind, { one: string; many: string }> = {
	movie: { one: "movie", many: "movies" },
	show: { one: "show", many: "shows" },
	book: { one: "book", many: "books" },
	album: { one: "album", many: "albums" },
	game: { one: "game", many: "games" },
};

export const LAYOUTS = ["list", "compact", "grid"] as const;
export type Layout = (typeof LAYOUTS)[number];

export const VISIBILITIES = ["public", "unlisted", "private"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,28}[a-z0-9])?$/;

export const SOURCE_LABELS = {
	tmdb: "TMDB",
	openlibrary: "Open Library",
	musicbrainz: "MusicBrainz",
	igdb: "IGDB",
} as const;

