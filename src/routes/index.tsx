import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ListRows } from "@/components/list-rows";
import { NewListButton } from "@/components/new-list-button";

export const Route = createFileRoute("/")({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.lists.recent, {}));
	},
	component: Home,
});

// Each word keeps its own color, picked to read on paper and in dark mode.
const WORDS = [
	{ word: "movies", color: "#e0532f" },
	{ word: "books", color: "#2e9e6e" },
	{ word: "albums", color: "#8b5cf6" },
	{ word: "shows", color: "#3b82f6" },
	{ word: "games", color: "#e64980" },
	{ word: "favorites", color: "#d4930b" },
];

function RotatingWord() {
	const [i, setI] = useState(0);
	useEffect(() => {
		const id = setInterval(() => setI((n) => (n + 1) % WORDS.length), 2200);
		return () => clearInterval(id);
	}, []);
	const { word, color } = WORDS[i];
	return (
		<span key={i} className="relative inline-block" style={{ "--word-color": color } as React.CSSProperties}>
			<span aria-hidden className="halftone-glow" />
			<em className="inline-block animate-[rise_.5s_ease-out] whitespace-nowrap text-(--word-color)">{word}.</em>
		</span>
	);
}

function Home() {
	const { data: viewer } = useSuspenseQuery(convexQuery(api.users.viewer, {}));
	const { data: recent } = useSuspenseQuery(convexQuery(api.lists.recent, {}));

	return (
		<div>
			<section className="pb-14">
				<h1 className="font-serif text-[clamp(3rem,9vw,5.5rem)] leading-[0.92] tracking-tight">
					Lists for your
					<br />
					<RotatingWord />
				</h1>
				<p className="mt-5 max-w-[30rem] text-[14px]">
					A small, quiet place to keep lists of the things you love. Rank them, theme them,
					share them, or keep them to yourself.
				</p>
				<p className="mt-6">
					{viewer ? (
						<NewListButton className="btn btn-primary">Make a list →</NewListButton>
					) : (
						<Link to="/sign-in" className="btn btn-primary">
							Start a list →
						</Link>
					)}
				</p>
			</section>

			<section>
				<h2 className="label mb-2">Fresh lists</h2>
				<ListRows lists={recent} empty="Nobody's made a public list yet. Be the first." />
			</section>
		</div>
	);
}
