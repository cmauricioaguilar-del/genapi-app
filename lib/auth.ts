import { cookies } from "next/headers";
import { prisma } from "./db";

export interface Session {
  id: string;
  email: string;
  nombre: string;
  role: "SUPERADMIN" | "CLIENTE";
}

export async function getSession(): Promise<Session | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get("genapi-session")?.value;
  if (!raw) return null;
  try {
    return JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as Session;
  } catch {
    return null;
  }
}

export function createSessionCookie(session: Session): string {
  return Buffer.from(JSON.stringify(session)).toString("base64");
}
