import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { encrypt } from "@/lib/encryption";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const empresa = await prisma.empresa.findFirst({
    where: { apiToken: "9edc2eaa-704d-4e19-ae8b-f7df34396fc2" },
  });

  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const updated = await prisma.empresa.update({
    where: { id: empresa.id },
    data: {
      siiRut: "78269533-9",
      siiClaveEnc: encrypt("Ludica25$"),
    },
  });

  return NextResponse.json({ ok: true, empresa: updated.nombre, rut: updated.rut, siiRut: updated.siiRut });
}
