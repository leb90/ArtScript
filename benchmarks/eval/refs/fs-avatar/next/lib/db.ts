type Photo = { type: string; data: Buffer; version: number };
const store = globalThis as unknown as { photo?: Photo | null };

export const getPhoto = () => store.photo ?? null;
export const setPhoto = (type: string, data: Buffer) => { store.photo = { type, data, version: (store.photo?.version ?? 0) + 1 }; };
