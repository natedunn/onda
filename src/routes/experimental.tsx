import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/experimental")({
	head: () => ({ meta: [{ title: "Experimental features · onda" }] }),
	component: Experimental,
});

// Book search is carried over word for word from RAD's /docs/experimental.
function Experimental() {
	return (
		<article className="legal">
			<h1 className="font-serif text-5xl">Experimental features</h1>

			<h2 id="language-selector">🌐 Language selector</h2>
			<p>
				Turn it on in <a href="/settings#experimental">settings</a> and the add dialog gets a language
				select. Pick Español and movies and shows come from The Movie Database with their Mexican Spanish
				titles and posters, and books come from Open Library's Spanish editions. Albums and games look the
				same in any language, so they don't get the select.
			</p>
			<p>
				Things keep the language they were added in, so everyone sees your list the way you made it. The
				rest of onda is still only in English.
			</p>

			<h2>📕 Book search</h2>
			<p>
				Book search is experimental for a few reasons. onda is using Open Library's generous, but also
				experimental search API which includes some inconsistencies and shortcomings. While there is an
				effort to improve things from the Open Library team and community, I am implementing my own
				methods to improve the overall experience.
			</p>
			<p>Here is a list of a few common issues &amp; their suggestions:</p>
			<ul>
				<li>
					<strong>Unable to find book from partial title:</strong> Please enter full titles. Additionally
					check <a href="https://openlibrary.org">Open Library</a> or use their{" "}
					<a href="https://openlibrary.org/search?mode=everything">search</a> directly to make sure title
					exists.
				</li>
				<li>
					<strong>Unable to search other data like authors or subject:</strong> Open Library search API
					doesn't consistently consider search terms outside of the title. I am working on a way to
					improve this, but for now I recommend checkout out OL's{" "}
					<a href="https://openlibrary.org/search/howto">Search Tips</a> on how to better refine your
					searches. All tips found there are applicable to onda's book search as well.
				</li>
				<li>
					<strong>General missing search items:</strong> Sometimes the item you are looking for just
					isn't in the Open Library database (please check recommendation above to make sure). I am going
					to add an option soon to manually add books, but for now, the only viable solution is the add
					the book to Open Library, directly.
				</li>
				<li>
					<strong>Search returns poor quality artwork, or none at all:</strong> I do my best to navigate
					the Open Library API to find the best quality artwork, but sometimes it's just not there. I do
					have some ideas for updating low quality, or missing artwork. Stay tuned for updates.
				</li>
			</ul>
		</article>
	);
}
