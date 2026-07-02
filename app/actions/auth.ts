"use server";
import { prisma } from "@/lib/db";
import { createSessionCookie } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";

export async function loginAction(email: string, clave: string) {
  const cliente = await prisma.cliente.findUnique({ where: { email } });
  if (!cliente || !cliente.activo) return { error: "Credenciales incorrectas." };

  const ok = await bcrypt.compare(clave, cliente.claveHash);
  if (!ok) return { error: "Credenciales incorrectas." };

  const session = { id: cliente.id, email: cliente.email, nombre: cliente.nombre, role: "CLIENTE" as const };
  const cookie = createSessionCookie(session);
  const jar = await cookies();
  jar.set("genapi-session", cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
  return { ok: true };
}

export async function registroAction(nombre: string, email: string, clave: string, plan: string) {
  const existe = await prisma.cliente.findUnique({ where: { email } });
  if (existe) return { error: "Ya existe una cuenta con ese email." };

  const claveHash = await bcrypt.hash(clave, 12);
  const cliente = await prisma.cliente.create({ data: { nombre, email, claveHash, plan } });

  const session = { id: cliente.id, email: cliente.email, nombre: cliente.nombre, role: "CLIENTE" as const };
  const cookie = createSessionCookie(session);
  const jar = await cookies();
  jar.set("genapi-session", cookie, { httpOnly: true, secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 8, path: "/" });
  return { ok: true };
}
