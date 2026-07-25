import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { chromium } from "playwright";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMPRESA_ID = "cmrunzwap00003so6vemz4lqd"; // Latin Computer SPA
const PERIODOS = ["202601", "202602", "202603", "202604", "202605", "202606"];

function normalizarRut(rut: string) {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}
function formatearRutConPuntos(rutDigitos: string) {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

async function leerFolio(page: import("playwright").Page): Promise<{ folio: string; tipo: string } | null> {
  return page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("td, div, span, option"));
    for (const el of all) {
      const m = el.textContent?.trim().match(/^(\d{8,12})\s*-\s*(DECLARACION VIGENTE|DECLARACION RECTIFICATORIA|DECLARACION PRIMITIVA)/i);
      if (m) return { folio: m[1], tipo: m[2] };
    }
    return null;
  });
}

async function expandirMeses(page: import("playwright").Page, log: string[]): Promise<boolean> {
  const posNum = await page.evaluate(() => {
    const tds = Array.from(document.querySelectorAll("td, a, span"));
    const el = tds.find(e => {
      const t = e.textContent?.trim() ?? "";
      return /^\d+$/.test(t) && parseInt(t) > 0 && parseInt(t) < 20;
    });
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (!posNum) { log.push("  expandirMeses: contador no encontrado"); return false; }
  await page.mouse.click(posNum.x, posNum.y);
  log.push(`  expandirMeses: click en (${posNum.x}, ${posNum.y})`);
  for (let t = 0; t < 20; t++) {
    await page.waitForTimeout(500);
    const ok = await page.evaluate(() => {
      return Array.from(document.querySelectorAll("td")).some(el => {
        const txt = el.textContent?.trim() ?? "";
        return txt === "Declaración sin observaciones." || txt === "Declaracion sin observaciones.";
      });
    });
    if (ok) { log.push("  expandirMeses: meses visibles"); return true; }
  }
  log.push("  expandirMeses: meses no aparecieron tras 10s");
  return false;
}

async function capturarCandidatos(page: import("playwright").Page): Promise<{ x: number; y: number }[]> {
  return page.evaluate(() => {
    const found: { x: number; y: number }[] = [];
    for (const el of Array.from(document.querySelectorAll("td"))) {
      const t = el.textContent?.trim() ?? "";
      if (t === "Declaración sin observaciones." || t === "Declaracion sin observaciones.") {
        const rect = el.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0)
          found.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
      }
    }
    found.sort((a, b) => a.y - b.y);
    const dedup: { x: number; y: number }[] = [];
    for (const p of found) {
      if (!dedup.length || Math.abs(p.y - dedup[dedup.length - 1].y) > 5) dedup.push(p);
    }
    return dedup;
  });
}

async function clickVolver(page: import("playwright").Page, log: string[]) {
  const pos = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll("a, button, input[type=button], input[type=submit]"))
      .find(e => e.textContent?.trim() === "Volver" || (e as HTMLInputElement).value === "Volver");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });
  if (pos) {
    await page.mouse.click(pos.x, pos.y);
    log.push(`  Volver clickeado (${pos.x}, ${pos.y})`);
    await page.waitForTimeout(3000);
  } else {
    log.push("  Volver no encontrado — esperando 3s");
    await page.waitForTimeout(3000);
  }
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const empresa = await prisma.empresa.findUnique({
    where: { id: EMPRESA_ID },
    select: { nombre: true, siiRut: true, siiClaveEnc: true },
  });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const clave = decrypt(empresa.siiClaveEnc);
  const rutNorm = normalizarRut(empresa.siiRut);
  const rutDigitos = rutNorm.slice(0, -1);
  const dv = rutNorm.slice(-1);
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  const log: string[] = [];
  const resultados: Record<string, any>[] = [];

  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
      "--disable-blink-features=AutomationControlled"],
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
    log.push("Iniciando login...");
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", { waitUntil: "load", timeout: 30000 });
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
      set("rut", rut); set("dv", dv); set("referencia", "https://homer.sii.cl/"); set("411", "");
    }, { rut: rutDigitos, dv });
    await page.waitForTimeout(500);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000, waitUntil: "domcontentloaded" }).catch(() => {}),
      page.locator('input[type="submit"], button[type="submit"]').first().click().catch(() =>
        page.evaluate(() => (document.querySelector("form") as HTMLFormElement)?.submit())
      ),
    ]);
    await page.waitForTimeout(3000);

    const cookies = await page.context().cookies();
    const loginOk = cookies.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name.startsWith("NETSCAPE_LIVEWIRE"));
    if (!loginOk) {
      await context.close();
      return NextResponse.json({ error: "Login fallido", log });
    }
    log.push("Login OK");

    // 2. NAVEGAR A F29
    await page.goto("https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await page.waitForTimeout(12000);
    log.push("Página F29 cargada");

    // 3. ITERAR CADA MES
    for (let i = 0; i < PERIODOS.length; i++) {
      const period = PERIODOS[i];
      const res: Record<string, any> = { period };

      try {
        log.push(`--- ${period} (mes ${i + 1}/${PERIODOS.length}) ---`);

        const expandido = await expandirMeses(page, log);
        if (!expandido) {
          res.error = "No se pudo expandir meses";
          resultados.push(res);
          continue;
        }
        await page.waitForTimeout(2000);

        const candidatos = await capturarCandidatos(page);
        log.push(`  Celdas: ${candidatos.length} → mes[${i}]=${JSON.stringify(candidatos[i])}`);
        if (candidatos.length <= i) {
          res.error = `Solo ${candidatos.length} celdas, se necesita índice ${i}`;
          resultados.push(res);
          continue;
        }

        const celda = candidatos[i];
        res.celda = celda;

        await page.mouse.click(celda.x, celda.y);

        let folioDelDom: { folio: string; tipo: string } | null = null;
        for (let t = 0; t < 20; t++) {
          await page.waitForTimeout(500);
          folioDelDom = await leerFolio(page);
          if (folioDelDom) break;
        }
        res.folio_dom = folioDelDom;
        if (!folioDelDom) {
          log.push(`  ${period}: Sin folio en DOM`);
          res.error = "Sin folio en DOM";
          resultados.push(res);
          await clickVolver(page, log);
          continue;
        }
        log.push(`  ${period}: folio=${folioDelDom.folio}`);

        const posCompacto = await page.evaluate(() => {
          const el = Array.from(document.querySelectorAll("a, button, td, span, div"))
            .find(e => e.textContent?.trim() === "Formulario Compacto");
          if (!el) return null;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return null;
          return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
        });
        if (!posCompacto) {
          log.push(`  ${period}: No se encontró "Formulario Compacto"`);
          res.error = "Sin botón Formulario Compacto";
          resultados.push(res);
          await clickVolver(page, log);
          continue;
        }

        let capturedUrl = "";
        const requestHandler = (req: import("playwright").Request) => {
          const u = req.url();
          if (u.includes("formCompacto") && !capturedUrl) capturedUrl = u;
        };
        context.on("request", requestHandler);

        await page.mouse.click(posCompacto.x, posCompacto.y);

        for (let t = 0; t < 20; t++) {
          await page.waitForTimeout(500);
          if (capturedUrl) break;
        }
        context.off("request", requestHandler);

        for (const p of context.pages()) {
          if (p !== page) await p.close().catch(() => {});
        }
        await page.waitForTimeout(500);

        log.push(`  ${period}: capturedUrl = ${capturedUrl}`);
        res.pdf_url = capturedUrl;

        if (!capturedUrl) {
          log.push(`  ${period}: Sin URL de PDF`);
          res.error = "Sin URL de PDF";
          resultados.push(res);
          await clickVolver(page, log);
          continue;
        }

        const pdfResp = await context.request.get(capturedUrl, {
          headers: {
            "Referer": "https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29",
            "Accept": "application/pdf,*/*",
          },
        });
        const ct = pdfResp.headers()["content-type"] ?? "";
        const buf = await pdfResp.body();
        res.pdf_status = pdfResp.status();
        res.pdf_ct = ct;
        res.pdf_bytes = buf.length;
        res.pdf_ok = buf.slice(0, 4).toString("ascii") === "%PDF";

        if (!res.pdf_ok) {
          log.push(`  ${period}: PDF inválido (len=${buf.length}, ct=${ct})`);
          res.error = "Respuesta no es PDF";
          resultados.push(res);
          await clickVolver(page, log);
          continue;
        }

        const f29Existente = await prisma.f29Genapi.findFirst({
          where: { empresaId: EMPRESA_ID, period },
          select: { id: true },
        });
        if (f29Existente) {
          await prisma.f29Genapi.update({
            where: { id: f29Existente.id },
            data: { pdfBytes: new Uint8Array(buf) },
          });
          res.guardado = "actualizado";
        } else {
          const ext = await prisma.extraccion.create({
            data: { empresaId: EMPRESA_ID, period, modulo: "f29", estado: "SUCCESS" },
          });
          await prisma.f29Genapi.create({
            data: { empresaId: EMPRESA_ID, extraccionId: ext.id, period, pdfBytes: new Uint8Array(buf) },
          });
          res.guardado = "creado";
        }
        log.push(`  ${period}: PDF guardado (${res.guardado}) len=${buf.length}`);
        res.error = null;

        await clickVolver(page, log);

      } catch (e: any) {
        res.error = e.message;
        log.push(`  ${period}: ERROR ${e.message}`);
        await clickVolver(page, log).catch(() => {});
      }

      resultados.push(res);
    }

    // LOGOUT
    await page.goto("https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi", { timeout: 8000 }).catch(() => {});
    await context.close();
    log.push("Logout OK");

  } catch (e: any) {
    log.push(`ERROR GENERAL: ${e.message}`);
  } finally {
    await browser.close();
  }

  const exitosos = resultados.filter(r => r.pdf_ok && !r.error).length;
  return NextResponse.json({ ok: exitosos === PERIODOS.length, exitosos, total: PERIODOS.length, resultados, log });
}
