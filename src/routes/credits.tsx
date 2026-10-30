import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/credits")({
	head: () => ({ meta: [{ title: "Credits · onda" }] }),
	component: Credits,
});

function Credits() {
	return (
		<article className="legal">
			<h1 className="font-serif text-5xl">Credits</h1>
			<p>
				Everything on a list comes from these open databases. Cover art and posters belong to their
				respective owners and are shown for reference.
			</p>

			<h2>Movies and shows</h2>
			<a href="https://www.themoviedb.org" className="plain mt-3 inline-block">
				<img src="/tmdb.svg" alt="The Movie Database (TMDB)" className="h-4" />
			</a>
			<p>
				Movie and show details and posters come from{" "}
				<a href="https://www.themoviedb.org">The Movie Database (TMDB)</a>. This product uses the TMDB
				API but is not endorsed or certified by TMDB.
			</p>

			<h2>Books</h2>
			<p>
				Book details and covers come from <a href="https://openlibrary.org">Open Library</a>, a project
				of the Internet Archive.
			</p>

			<h2>Albums</h2>
			<p>
				Album details come from <a href="https://musicbrainz.org">MusicBrainz</a>, and covers from the{" "}
				<a href="https://coverartarchive.org">Cover Art Archive</a>.
			</p>

			<h2>Games</h2>
			<p>
				Game details and covers come from <a href="https://www.igdb.com">IGDB</a>.
			</p>
		</article>
	);
}
