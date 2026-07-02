import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import bcrypt from "bcryptjs";
import { encrypt } from "../lib/encryption";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter } as any);

async function main() {
  // Admin
  const adminHash = await bcrypt.hash("admin123", 12);
  await prisma.admin.upsert({
    where: { email: "admin@genapi.cl" },
    update: {},
    create: { email: "admin@genapi.cl", claveHash: adminHash },
  });

  // Cliente piloto: Mauricio / Nexxus
  const claveHash = await bcrypt.hash("genapi2026", 12);
  const cliente = await prisma.cliente.upsert({
    where: { email: "c.mauricio.aguilar@gmail.com" },
    update: {},
    create: {
      email: "c.mauricio.aguilar@gmail.com",
      nombre: "Mauricio Aguilar — Nexxus Consulting",
      claveHash,
      plan: "BUSINESS",
    },
  });

  // Empresa piloto: Modopack
  // IMPORTANTE: reemplaza SII_CLAVE_REAL con la clave SII real de Modopack
  const siiClaveEnc = encrypt(process.env.MODOPACK_SII_CLAVE ?? "clave-pendiente");
  const empresa = await prisma.empresa.upsert({
    where: { apiToken: "modopack-test-token-2026" },
    update: {},
    create: {
      nombre: "Aislantes Modopack Ltda.",
      rut: "76129731-7",
      siiRut: "76129731-7",
      siiClaveEnc,
      apiToken: "modopack-test-token-2026",
      clienteId: cliente.id,
    },
  });

  console.log("✅ Seed completado:");
  console.log(`   Admin:   admin@genapi.cl / admin123`);
  console.log(`   Cliente: c.mauricio.aguilar@gmail.com / genapi2026`);
  console.log(`   Empresa: ${empresa.nombre}`);
  console.log(`   Token:   ${empresa.apiToken}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
