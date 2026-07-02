import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "pg";
import bcrypt from "bcryptjs";
import { createCipheriv, randomBytes } from "crypto";

const { Pool } = pkg;

function encrypt(plaintext) {
  const raw = process.env.ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw.padEnd(32, "0").slice(0, 32), "utf8");
  const iv = randomBytes(16);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("hex"), authTag.toString("hex"), encrypted.toString("hex")].join(":");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminHash = await bcrypt.hash("admin123", 12);
  await prisma.admin.upsert({
    where: { email: "admin@genapi.cl" },
    update: {},
    create: { email: "admin@genapi.cl", claveHash: adminHash },
  });

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
