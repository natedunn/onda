import { createFileRoute, Link } from "@tanstack/react-router";
import { CONTACT_EMAIL, LegalPage } from "@/components/legal-page";

export const Route = createFileRoute("/privacy")({
	head: () => ({ meta: [{ title: "Privacy · onda" }] }),
	component: Privacy,
});

function Privacy() {
	return (
		<LegalPage title="Privacy">
			<p>
				onda is a small site for making lists of movies, shows, books, albums and games. This page
				covers what it collects and what happens to it. Short version: only what's needed to run
				your account, nothing is sold, and there are no ads or trackers.
			</p>

			<h2>What we collect</h2>
			<ul>
				<li>
					<strong>From your sign-in provider</strong> (GitHub, Google or Discord): your name,
					email address, profile picture and username. Your name and picture start out as your
					public profile, and your username comes from your provider username or, for Google, the
					part of your email before the @. You can change your username and name in settings.
					Otherwise, your email is only used to recognize you when you sign in and to link
					accounts that share it, and the full address is never shown publicly.
				</li>
				<li>
					<strong>What you add</strong>: your username, display name, bio, lists and the items in
					them.
				</li>
				<li>
					<strong>Basic technical data</strong> like IP addresses and request logs, kept by our
					hosting providers for security and to keep the site running.
				</li>
			</ul>

			<h2>What's public</h2>
			<p>
				Your profile and public lists can be seen by anyone, including search engines. Unlisted
				lists are visible to anyone with the link. Private lists are only visible to you. Making
				your profile private hides your profile page and keeps your lists out of public listings,
				but any public or unlisted list you share still shows your username, name and picture.
			</p>

			<h2>Cookies</h2>
			<p>
				onda only uses cookies to keep you signed in. There are no analytics or advertising
				cookies.
			</p>

			<h2>Who else is involved</h2>
			<p>We don't sell or share your data. A few services handle it to make onda work:</p>
			<ul>
				<li>
					<a href="https://www.cloudflare.com">Cloudflare</a> hosts the site, and{" "}
					<a href="https://www.convex.dev">Convex</a> stores the database.
				</li>
				<li>GitHub, Google and Discord handle sign-in when you choose them.</li>
				<li>
					Searches and item details come from TMDB, Open Library, MusicBrainz and IGDB. Lookups are
					made from our servers, but cover art may load directly from their image hosts.
				</li>
			</ul>

			<h2>Your choices</h2>
			<p>
				You can edit your profile and delete your lists at any time. To delete your account and
				everything in it, or to get a copy of your data, email{" "}
				<a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from the address you signed in with
				and it'll be taken care of. You can also revoke onda's access from your GitHub, Google or
				Discord settings.
			</p>

			<h2>Kids</h2>
			<p>onda isn't meant for anyone under 13, and we don't knowingly collect their data.</p>

			<h2>Changes</h2>
			<p>
				If this policy changes, the date at the top will change with it. Big changes will be
				announced on the site. See also the <Link to="/terms">terms</Link>.
			</p>

			<h2>Contact</h2>
			<p>
				Questions? <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
			</p>
		</LegalPage>
	);
}
