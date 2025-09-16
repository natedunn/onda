import { convexQuery } from '@convex-dev/react-query';
import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { api } from 'convex/_generated/api';

export const Route = createFileRoute('/_blank/auth-check')({
	loader: async ({ context }) => {
		await context.queryClient.ensureQueryData(convexQuery(api.auth.getCurrentUser, {}));
	},
	component: RouteComponent,
});

function RouteComponent() {
	const { data: user } = useSuspenseQuery(convexQuery(api.auth.getCurrentUser, {}));

	return <div>{user ? <div>USER_ID: {user.email}</div> : <div>No user authenticated</div>}</div>;
}
