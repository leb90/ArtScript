export type User = { id: string; name: string; email: string };
const store = globalThis as unknown as { users?: User[] };

export const users = (store.users ??= []);
