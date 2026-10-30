import { api } from "@convex/_generated/api";
import { useNavigate } from "@tanstack/react-router";
import { useMutation } from "convex/react";
import { type ReactNode, useState } from "react";
import { errorMessage } from "@/lib/utils";

export function NewListButton({ className, children }: { className?: string; children: ReactNode }) {
	const create = useMutation(api.lists.create);
	const navigate = useNavigate();
	const [pending, setPending] = useState(false);
	return (
		<button
			type="button"
			className={className}
			disabled={pending}
			onClick={async () => {
				setPending(true);
				try {
					const params = await create();
					await navigate({ to: "/@{$username}/l/$slug/settings", params, search: { new: true } });
				} catch (error) {
					alert(errorMessage(error));
				} finally {
					setPending(false);
				}
			}}
		>
			{pending ? "creating…" : children}
		</button>
	);
}
