import { DEFAULT_RELEASE_SORT, RELEASE_SORTS, type ReleaseSort } from "@convex/shared/releases";
import { createIsomorphicFn } from "@tanstack/react-start";

const COOKIE = "release-sort";

function parse(value: string | undefined): ReleaseSort {
	return RELEASE_SORTS.includes(value as ReleaseSort) ? (value as ReleaseSort) : DEFAULT_RELEASE_SORT;
}

/** The sort this device last picked. A cookie, so the server can send the right page first. */
export const readReleaseSort = createIsomorphicFn()
	.server(async () => {
		const { getCookie } = await import("@tanstack/react-start/server");
		return parse(getCookie(COOKIE));
	})
	.client(async () => parse(document.cookie.match(/(?:^|; )release-sort=([^;]*)/)?.[1]));

export function saveReleaseSort(sort: ReleaseSort) {
	document.cookie = `${COOKIE}=${sort}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
}
