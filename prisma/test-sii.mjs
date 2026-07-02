import puppeteer from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import { createDecipheriv } from "crypto";
import pkg from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

puppeteer.use(StealthPlugin());
const { Pool } = pkg;

function decrypt(stored) {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  const raw = process.env.ENCRYPTION_KEY ?? "";
  const key = Buffer.from(raw.padEnd(32, "0").slice(0, 32), "utf8");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const empresa = await prisma.empresa.findUnique({ where: { apiToken: "modopack-test-token-2026" } });
const clave = decrypt(empresa.siiClaveEnc);
const rutCompleto = empresa.siiRut.replace(/\./g, "").replace(/-/g, ""); // 761297317

console.log(`🔐 Login SII para ${empresa.nombre} (RUT: ${empresa.siiRut})`);

const browser = await puppeteer.launch({
  headless: false,
  executablePath: "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  args: ["--no-sandbox", "--disable-setuid-sandbox", "--lang=es-CL"],
});

const page = await browser.newPage();
await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36");
await page.setViewport({ width: 1280, height: 800 });

try {
  // Paso 1: cargar página de login
  await page.goto("https://zeusr.sii.cl//AUT2000/InicioAutenticacion/IngresoRutClave.html", {
    waitUntil: "networkidle2",
    timeout: 30000,
  });

  // Paso 2: llenar RUT (sin puntos ni guión: 761297317)
  console.log("   Llenando RUT:", rutCompleto);
  await page.waitForSelector("#rutcntr", { timeout: 10000 });
  await page.click("#rutcntr");
  await page.type("#rutcntr", rutCompleto, { delay: 80 });

  // Paso 3: llenar clave
  await page.click("#clave");
  await page.type("#clave", clave, { delay: 80 });

  await page.screenshot({ path: "sii-before-login.png" });

  // Paso 4: submit
  console.log("   Haciendo submit...");
  await page.keyboard.press("Enter");
  await page.waitForNavigation({ waitUntil: "networkidle2", timeout: 20000 });

  const urlActual = page.url();
  console.log("   URL post-login:", urlActual);
  await page.screenshot({ path: "sii-after-login.png" });

  if (urlActual.includes("IngresoRutClave") || urlActual.includes("error") || urlActual.includes("Rechazada")) {
    console.log("❌ Login fallido.");
  } else {
    console.log("✅ Login SII exitoso!");

    // Paso 1 post-login: ir a Mi SII para establecer sesión
    await page.waitForTimeout(2000);
    await page.goto("https://misiir.sii.cl/cgi_misii/siihome.cgi", { waitUntil: "networkidle2", timeout: 20000 });
    await page.screenshot({ path: "sii-misii.png" });
    console.log("   Mi SII:", page.url());

    // Paso 2: navegar al RCV
    await page.waitForTimeout(2000);
    await page.goto("https://www4.sii.cl/consdcvinternetui/", { waitUntil: "networkidle2", timeout: 20000 });
    await page.screenshot({ path: "sii-rcv.png" });
    console.log("   RCV:", page.url());
  }
} catch (e) {
  console.error("❌ Error:", e.message);
  await page.screenshot({ path: "sii-error.png" }).catch(() => {});
} finally {
  await browser.close();
  await prisma.$disconnect();
}
