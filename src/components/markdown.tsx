import { Fragment, type ReactNode } from "react";

// A deliberately tiny Markdown subset: **bold**, *italic*, ~~strike~~,
// [links](https://…), bare URLs, line breaks and paragraphs. Rendered as React
// nodes, so there's no HTML injection surface.
const INLINE =
	/(\*\*([^*]+)\*\*)|(\*([^*]+)\*|_([^_]+)_)|(~~([^~]+)~~)|(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\))|(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
	const out: ReactNode[] = [];
	let last = 0;
	let i = 0;
	for (const m of text.matchAll(INLINE)) {
		if (m.index > last) out.push(text.slice(last, m.index));
		const key = `${keyPrefix}-${i++}`;
		if (m[1]) out.push(<strong key={key}>{m[2]}</strong>);
		else if (m[3]) out.push(<em key={key}>{m[4] ?? m[5]}</em>);
		else if (m[6]) out.push(<del key={key}>{m[7]}</del>);
		else if (m[8])
			out.push(
				<a key={key} href={m[10]} rel="nofollow noopener noreferrer" target="_blank">
					{m[9]}
				</a>,
			);
		else if (m[11])
			out.push(
				<a key={key} href={m[11]} rel="nofollow noopener noreferrer" target="_blank">
					{m[11].replace(/^https?:\/\//, "")}
				</a>,
			);
		last = m.index + m[0].length;
	}
	if (last < text.length) out.push(text.slice(last));
	return out;
}

export function Markdown({ text, className }: { text: string; className?: string }) {
	const paragraphs = text.trim().split(/\n{2,}/);
	return (
		<div className={className}>
			{paragraphs.map((para, p) => (
				<p key={p}>
					{para.split("\n").map((line, l) => (
						<Fragment key={l}>
							{l > 0 && <br />}
							{inline(line, `${p}-${l}`)}
						</Fragment>
					))}
				</p>
			))}
		</div>
	);
}

export function stripMarkdown(text: string) {
	return text
		.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
		.replace(/(\*\*|~~|\*|_)/g, "")
		.replace(/\s+/g, " ")
		.trim();
}
