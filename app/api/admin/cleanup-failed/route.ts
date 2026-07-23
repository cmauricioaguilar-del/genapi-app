import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const now = new Date();
  const periodActual = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;

  const deleted = await prisma.extraccion.deleteMany({
    where: {
      estado: { in: ["FAILED", "RUNNING"] },
      period: { not: periodActual },
    },
  });

  return NextResponse.json({ ok: true, eliminadas: deleted.count, periodActual });
}
