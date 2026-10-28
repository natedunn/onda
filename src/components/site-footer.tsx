import { Link } from "@tanstack/react-router";

export function SiteFooter() {
	return (
		<footer className="mt-24 border-t border-rule pt-4 pb-10 text-[11px] text-muted">
			<p>
				<Link to="/" className="plain font-serif text-base italic">
					onda∿
				</Link>{" "}
				— lists of the things you love. Made by{" "}
				<a href="https://natedunn.net">Nate Dunn</a>. Data from{" "}
				<a href="https://www.themoviedb.org">TMDB</a>, <a href="https://openlibrary.org">Open Library</a>,{" "}
				<a href="https://musicbrainz.org">MusicBrainz</a> &amp; <a href="https://www.igdb.com">IGDB</a>.
			</p>
			<p className="mt-2">
				<Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy</Link>
			</p>
		</footer>
	);
}
