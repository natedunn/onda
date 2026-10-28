import { convexQuery, type ConvexQueryClient } from "@convex-dev/react-query";
import { api } from "@convex/_generated/api";
import type { QueryClient } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Outlet,
	Scripts,
	useRouter,
} from "@tanstack/react-router";
import { type ConvexReactClient, useConvexAuth } from "convex/react";
import { type ReactNode, useEffect, useRef } from "react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TopStrip } from "@/components/top-strip";
import { getAuthToken } from "@/lib/convex-auth-start/functions";
import { ConvexAuthStartProvider } from "@/lib/convex-auth-start/provider";
import { siteUrl } from "@/lib/utils";
import appCss from "@/styles/app.css?url";

export type RouterContext = {
	convex: ConvexReactClient;
	queryClient: QueryClient;
	convexQueryClient: ConvexQueryClient;
	token: string | null;
};

const DESCRIPTION = "Make lists of the movies, shows, books, albums and games you love.";

export const Route = createRootRouteWithContext<RouterContext>()({
	beforeLoad: async ({ context }) => {
		const token = await getAuthToken();
		// SSR queries run over HTTP; give them the request's identity.
		if (token) context.convexQueryClient.serverHttpClient?.setAuth(token);
		return { token };
	},
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.users.viewer, {}));
	},
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "onda" },
			{ name: "description", content: DESCRIPTION },
			{ property: "og:site_name", content: "onda" },
			{ name: "twitter:card", content: "summary_large_image" },
			{ name: "theme-color", content: "#fbfaf6" },
		],
		links: [
			{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
			{ rel: "preconnect", href: "https://fonts.googleapis.com" },
			{ rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
			{
				rel: "stylesheet",
				href: "https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap",
			},
			{ rel: "stylesheet", href: appCss },
		],
	}),
	shellComponent: RootDocument,
	component: RootComponent,
});

function RootDocument({ children }: { children: ReactNode }) {
	return (
		<html lang="en">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}

function RootComponent() {
	const { convex, token } = Route.useRouteContext();
	return (
		<ConvexAuthStartProvider client={convex} initialToken={token}>
			<AuthSync />
			<TopStrip />
			{/* One column, centered, ruled on both sides down the full height of the window. main grows so the footer sits at the bottom on short pages. */}
			<div className="mx-auto flex min-h-dvh w-full max-w-[80rem] flex-col border-rule px-5 sm:border-x sm:px-8">
				<SiteHeader />
				<main className="flex-1">
					<Outlet />
				</main>
				<SiteFooter />
			</div>
		</ConvexAuthStartProvider>
	);
}

/** Re-runs route guards/loaders when the browser signs in or out (e.g. after the OAuth redirect). */
function AuthSync() {
	const { isAuthenticated, isLoading } = useConvexAuth();
	const router = useRouter();
	const previous = useRef<boolean | null>(null);
	useEffect(() => {
		if (isLoading) return;
		if (previous.current !== null && previous.current !== isAuthenticated) {
			void router.invalidate();
		}
		previous.current = isAuthenticated;
	}, [isAuthenticated, isLoading, router]);
	return null;
}
