import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

type User = { id: string; email: string; salt: string; hash: string };
type Note = { id: string; owner: string; text: string };
type Db = { users: User[]; notes: Note[]; sessions: Map<string, string> };

const g = globalThis as unknown as { db?: Db };
export const db: Db = (g.db ??= { users: [], notes: [], sessions: new Map() });

const hashOf = (password: string, salt: string) => scryptSync(password, salt, 32).toString("hex");

export function createUser(email: string, password: string): User {
  const salt = randomBytes(16).toString("hex");
  const user = { id: randomUUID(), email, salt, hash: hashOf(password, salt) };
  db.users.push(user);
  return user;
}

export function checkPassword(user: User, password: string) {
  return timingSafeEqual(Buffer.from(hashOf(password, user.salt)), Buffer.from(user.hash));
}

export async function startSession(user: User) {
  const token = randomBytes(24).toString("hex");
  db.sessions.set(token, user.id);
  (await cookies()).set("session", token, { httpOnly: true, path: "/", sameSite: "lax" });
}

export async function currentUser() {
  const token = (await cookies()).get("session")?.value ?? "";
  return db.users.find((u) => u.id === db.sessions.get(token)) ?? null;
}
