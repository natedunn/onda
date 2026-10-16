import { useAuthActions } from "@convex-dev/auth/react";
import { convexQuery } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import { useQuery } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { NewListButton } from "@/components/new-list-button";

export function SiteHeader() {
	const { data: viewer } = useQuery(convexQuery(api.users.viewer, {}));
	const { signOut } = useAuthActions();
	const router = useRouter();

	return (
		<header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-7 pb-10">
			<Link to="/" className="plain font-serif text-[2rem] leading-none italic">
				onda<span className="text-muted not-italic">∿</span>
			</Link>
			<nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px]">
				{viewer ? (
					<>
						<NewListButton className="linkish">new list</NewListButton>
						<Link to="/@{$username}" params={{ username: viewer.username }}>
							@{viewer.username}
						</Link>
						<Link to="/settings">settings</Link>
						<button
							type="button"
							className="linkish"
							onClick={async () => {
								await signOut();
								await router.invalidate();
								await router.navigate({ to: "/" });
							}}
						>
							sign out
						</button>
					</>
				) : (
					<Link to="/sign-in">sign in</Link>
				)}
			</nav>
		</header>
	);
}
