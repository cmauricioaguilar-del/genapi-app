import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pkg from "pg";
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

const siiClaveEnc = encrypt(process.env.SII_CLAVE);

await prisma.empresa.update({
  where: { apiToken: "modopack-test-token-2026" },
  data: { siiClaveEnc },
});

console.log("✅ Clave SII actualizada y cifrada.");
await prisma.$disconnect();
