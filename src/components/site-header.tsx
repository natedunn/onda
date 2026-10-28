import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { NewListButton } from "@/components/new-list-button";

export function SiteHeader() {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));

	return (
		<header className="-mx-5 mb-10 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-rule border-b px-5 py-7 sm:-mx-8 sm:px-8">
			<Link to="/" className="plain group font-serif text-[2rem] leading-none italic">
				<span className="shimmer">onda</span>
				<span className="shimmer not-italic [--shimmer-base:var(--muted)] [--shimmer-delay:0.3s]">∿</span>
			</Link>
			<nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] [&_a:visited]:text-(--link)">
				{viewer ? (
					<>
						<NewListButton className="linkish">new list</NewListButton>
						<Link to="/@{$username}" params={{ username: viewer.username }}>
							@{viewer.username}
						</Link>
						<Link to="/settings">settings</Link>
					</>
				) : (
					<Link to="/sign-in">sign in</Link>
				)}
			</nav>
		</header>
	);
}
