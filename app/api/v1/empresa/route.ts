import { NextRequest, NextResponse } from "next/server";
import { autenticarToken } from "@/lib/apiAuth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await autenticarToken(req);
  if ("error" in auth) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const { empresa } = auth;

  return NextResponse.json({
    rut: empresa.siiRut,
    nombre: empresa.nombre,
    activa: empresa.activa,
  });
}
