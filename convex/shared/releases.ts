// Release calendar dates, shared by the sync and the pages.
//
// A release date is a string as exact as its source knows: "2026-11-19", "2027-03",
// "2027-Q1" or "2027". They sort as strings: a month's vague entries come before
// its days ("2027-03" < "2027-03-01"), and a year's quarters after its days.

export const PRECISIONS = ["day", "month", "quarter", "year"] as const;
export type Precision = (typeof PRECISIONS)[number];

export function precisionOf(date: string): Precision {
	if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return "day";
	if (/^\d{4}-\d{2}$/.test(date)) return "month";
	if (/^\d{4}-Q[1-4]$/.test(date)) return "quarter";
	return "year";
}

/** A UTC day, "2026-11-03". */
export const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** "2026-11" plus `n` months. */
export function addMonths(month: string, n: number) {
	const [year, m] = month.split("-").map(Number);
	return new Date(Date.UTC(year, m - 1 + n, 1)).toISOString().slice(0, 7);
}

// How the overview picks: the next releases that clear a popularity floor, or the
// most anticipated of the next month.
export const RELEASE_SORTS = ["soonest", "popular"] as const;
export type ReleaseSort = (typeof RELEASE_SORTS)[number];
export const DEFAULT_RELEASE_SORT: ReleaseSort = "soonest";
export const RELEASE_SORT_LABELS: Record<ReleaseSort, string> = { soonest: "Soonest", popular: "Most anticipated" };

/** How many months the calendar pages step through, starting with this one. */
export const CALENDAR_MONTHS = 12;

/** Releases out this long ago still show, as "out now". */
export const RECENT_DAYS = 14;

const utc = (date: string) => new Date(`${date}T00:00:00Z`);

/** "November 2026". */
export const monthName = (month: string, style: "long" | "short" = "long") =>
	utc(`${month}-01`).toLocaleDateString("en-US", {
		month: style,
		year: style === "long" ? "numeric" : undefined,
		timeZone: "UTC",
	});

/** "Nov 19", "March", "Q1 2027", "2027"; `withYear` adds the year to days and months. */
export function releaseLabel(date: string, withYear = false) {
	switch (precisionOf(date)) {
		case "day":
			return utc(date).toLocaleDateString("en-US", {
				month: "short",
				day: "numeric",
				year: withYear ? "numeric" : undefined,
				timeZone: "UTC",
			});
		case "month":
			return withYear ? monthName(date) : monthName(date).split(" ")[0];
		case "quarter":
			return `${date.slice(5)} ${date.slice(0, 4)}`;
		default:
			return date;
	}
}

/** "Wednesday, Nov 19". */
export const dayHeading = (date: string) =>
	utc(date).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
