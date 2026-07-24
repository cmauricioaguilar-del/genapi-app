import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { chromium } from "playwright";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function formatearRutConPuntos(rutDigitos: string): string {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  if (!empresaId) return NextResponse.json({ error: "empresaId requerido." }, { status: 400 });

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nombre: true, siiRut: true, siiClaveEnc: true },
  });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const clave = decrypt(empresa.siiClaveEnc);
  const rutNorm = normalizarRut(empresa.siiRut);
  const rutDigitos = rutNorm.slice(0, -1);
  const dv = rutNorm.slice(-1);
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  const resultado: Record<string, any> = {
    empresa: empresa.nombre,
    rut: empresa.siiRut,
  };

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu", "--disable-blink-features=AutomationControlled"],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      locale: "es-CL",
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      (window as any).chrome = { runtime: {} };
    });
    const page = await context.newPage();

    // 1. LOGIN
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      waitUntil: "load", timeout: 30000,
    });
    await page.waitForTimeout(1500);

    await page.locator('[name="rutcntr"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(rutConPuntos, { delay: 80 });

    await page.locator('[name="clave"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(clave, { delay: 80 });

    await page.evaluate(({ rut, dv }: { rut: string; dv: string }) => {
      const set = (name: string, val: string) => {
        const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        if (el) el.value = val;
      };
      set("rut", rut); set("dv", dv);
      set("referencia", "https://homer.sii.cl/");
      set("411", "");
    }, { rut: rutDigitos, dv });

    await page.waitForTimeout(500);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000, waitUntil: "domcontentloaded" }).catch(() => {}),
      page.locator('input[type="submit"], button[type="submit"]').first().click().catch(() =>
        page.evaluate(() => (document.querySelector("form") as HTMLFormElement)?.submit())
      ),
    ]);
    await page.waitForTimeout(3000);

    const urlPostLogin = page.url();
    const cookiesLogin = await page.context().cookies();
    const loginOk = cookiesLogin.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name.startsWith("NETSCAPE_LIVEWIRE"));
    resultado.login_ok = loginOk;
    resultado.url_post_login = urlPostLogin;
    resultado.cookies_auth = cookiesLogin.filter(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name.startsWith("NETSCAPE_LIVEWIRE")).map(c => c.name);

    // 2. VERIFICAR ACCESO A PÁGINA PROTEGIDA (antes del logout)
    const respProtegida = await page.goto("https://homer.sii.cl/", {
      waitUntil: "domcontentloaded", timeout: 10000,
    }).catch(() => null);
    const urlProtegidaAntes = page.url();
    const sesionActivaAntes = !urlProtegidaAntes.includes("IngresoRutClave") && !urlProtegidaAntes.includes("zeusr");
    resultado.verificacion_antes_logout = {
      url: urlProtegidaAntes,
      sesion_activa: sesionActivaAntes,
    };

    // 3. LOGOUT — usar misiir.sii.cl que es donde está el botón "Cerrar Sesión"
    await page.goto("https://misiir.sii.cl/cgi_AUT2000/autCTermino.cgi", { timeout: 8000, waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(1000);
    await page.goto("https://zeusr.sii.cl/cgi_AUT2000/CAutTermino.cgi", { timeout: 8000, waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForTimeout(2000);
    resultado.url_post_logout = page.url();

    // 4. VERIFICAR ACCESO A PÁGINA PROTEGIDA (después del logout)
    await page.goto("https://homer.sii.cl/", {
      waitUntil: "domcontentloaded", timeout: 10000,
    }).catch(() => {});
    const urlProtegidaDespues = page.url();
    const sesionActivaDespues = !urlProtegidaDespues.includes("IngresoRutClave") && !urlProtegidaDespues.includes("zeusr");
    resultado.verificacion_despues_logout = {
      url: urlProtegidaDespues,
      sesion_activa: sesionActivaDespues,
      sesion_cerrada: !sesionActivaDespues,
    };

    resultado.logout_exitoso = !sesionActivaDespues;

    await context.close();
  } catch (e: any) {
    resultado.error = e.message;
  } finally {
    await browser.close();
  }

  return NextResponse.json(resultado, { status: 200 });
}
