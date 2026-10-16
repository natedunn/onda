import { api } from "@convex/_generated/api";
import { createFileRoute } from "@tanstack/react-router";
import { ConvexHttpClient } from "convex/browser";

// Rendering happens in a Convex Node action (Workers' CPU budget is too small
// for satori + resvg) and is cached in Convex storage per list version. This
// route proxies the PNG so the image lives on our domain, and keeps a copy in
// the Workers cache. List pages append ?v=<updatedAt>, so edits bust it.
export const Route = createFileRoute("/og/l/{$slug}.png")({
	server: {
		handlers: {
			GET: async ({ request, params }) => {
				const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
				const hit = await cache?.match(request);
				if (hit) return hit;

				const convex = new ConvexHttpClient(import.meta.env.VITE_CONVEX_URL as string);
				const url = await convex.action(api.ogRender.listImageUrl, { slug: params.slug });
				if (!url) return new Response("Not found", { status: 404 });

				const image = await fetch(url);
				if (!image.ok) return new Response("Image unavailable", { status: 502 });
				const response = new Response(image.body, {
					headers: {
						"content-type": "image/png",
						"cache-control": "public, max-age=3600, s-maxage=86400",
					},
				});
				await cache?.put(request, response.clone());
				return response;
			},
		},
	},
});
