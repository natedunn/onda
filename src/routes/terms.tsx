import { createFileRoute, Link } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/terms")({
	head: () => ({ meta: [{ title: "Terms · onda" }] }),
	component: Terms,
});

function Terms() {
	return (
		<LegalPage title="Terms">
			<p>
				By signing in to or using onda, you agree to these terms and to the{" "}
				<Link to="/privacy">privacy policy</Link>. If you don't agree, please don't use the site.
			</p>

			<h2>Your account</h2>
			<p>
				You sign in with GitHub, Google or Discord, and you're responsible for what happens on your
				account. You need to be at least 13 to use onda.
			</p>

			<h2>Your stuff</h2>
			<p>
				You own the lists, notes and profile details you add. By posting them, you give onda
				permission to store and display them as part of running the site, including showing public
				lists to anyone and generating preview images for sharing. You can delete or private them
				whenever you like.
			</p>

			<h2>Be decent</h2>
			<p>Don't use onda to:</p>
			<ul>
				<li>post anything illegal, hateful, harassing or sexually explicit;</li>
				<li>impersonate someone or post other people's private information;</li>
				<li>spam, scrape, or try to break, overload or get around limits on the site.</li>
			</ul>
			<p>We may remove content or close accounts that break these rules.</p>

			<h2>Movies, books and the rest</h2>
			<p>
				Item details come from TMDB, Open Library, MusicBrainz and IGDB. onda isn't affiliated
				with or endorsed by any of them. Cover art and posters belong to their respective owners
				and are shown for reference.
			</p>

			<h2>No guarantees</h2>
			<p>
				onda is provided as is. We try to keep it running and your data safe, but can't promise it
				will always be available or error-free. To the extent the law allows, we're not liable for
				any loss that comes from using it. The site may change, or shut down, over time; if it
				does, we'll give notice so you can save your lists.
			</p>

			<h2>Changes</h2>
			<p>
				These terms may be updated. When they are, the date at the top changes, and using onda
				after that means you accept the new version.
			</p>

			<h2>Contact</h2>
			<p>
				Questions? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
			</p>
		</LegalPage>
	);
}
