export function formatDateTime( ms: number | null | undefined ): string | null {
	return ms === null || ms === undefined
		? null
		: new Date( ms ).toLocaleString();
}
