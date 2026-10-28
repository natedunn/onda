import type { ReactNode } from "react";

export const LEGAL_UPDATED = "October 27, 2026";
export const CONTACT_EMAIL = "hello@onda.club";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
	return (
		<article className="legal max-w-[36rem]">
			<h1 className="font-serif text-5xl">{title}</h1>
			<p className="mt-2 text-muted">Last updated {LEGAL_UPDATED}</p>
			{children}
		</article>
	);
}
