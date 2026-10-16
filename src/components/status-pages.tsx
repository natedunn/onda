import { type ErrorComponentProps, Link } from "@tanstack/react-router";

export function NotFoundPage() {
	return (
		<div className="py-16">
			<h1 className="font-serif text-5xl">Nothing here.</h1>
			<p className="mt-3 text-muted">
				This page doesn't exist, or it's private. <Link to="/">Go home</Link>.
			</p>
		</div>
	);
}

export function ErrorPage({ error, reset }: ErrorComponentProps) {
	return (
		<div className="py-16">
			<h1 className="font-serif text-5xl">That broke.</h1>
			<p className="mt-3 text-muted">{error instanceof Error ? error.message : String(error)}</p>
			<p className="mt-4">
				<button type="button" className="btn" onClick={reset}>
					Try again
				</button>
			</p>
		</div>
	);
}
