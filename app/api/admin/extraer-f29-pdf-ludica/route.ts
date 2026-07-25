import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { chromium } from "playwright";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMPRESA_ID = "cmri21z6200263so3ei1bt08n"; // Lúdica Spa
const PERIODOS = ["202601", "202602", "202603", "202604", "202605"];

function normalizarRut(rut: string) {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}
function formatearRutConPuntos(rutDigitos: string) {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

// Extrae folio del panel de detalle GWT
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

    // 3. CLICK EN EL CONTADOR (ej: "5") PARA EXPANDIR TABLA DE MESES
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
    if (!posNum) {
      await context.close();
      return NextResponse.json({ error: "No se encontró contador de declaraciones", log });
    }
    await page.mouse.click(posNum.x, posNum.y);
    await page.waitForTimeout(8000);
    log.push(`Click en contador (${posNum.x}, ${posNum.y})`);

    // 4. CAPTURAR COORDENADAS DE LAS CELDAS DE MESES (una sola vez, con la tabla ya expandida)
    const candidatos = await page.evaluate(() => {
      const tds = Array.from(document.querySelectorAll("td"));
      const found: { x: number; y: number }[] = [];
      for (const el of tds) {
        const t = el.textContent?.trim() ?? "";
        if (t === "Declaración sin observaciones." || t === "Declaracion sin observaciones.") {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            found.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          }
        }
      }
      found.sort((a, b) => a.y - b.y);
      const dedup: { x: number; y: number }[] = [];
      for (const p of found) {
        if (!dedup.length || Math.abs(p.y - dedup[dedup.length - 1].y) > 5) dedup.push(p);
      }
      return dedup;
    });
    log.push(`Celdas encontradas: ${candidatos.length} → ${JSON.stringify(candidatos)}`);

    if (candidatos.length < PERIODOS.length) {
      await context.close();
      return NextResponse.json({ error: `Solo ${candidatos.length} celdas, se esperaban ${PERIODOS.length}`, log });
    }

    // codInt es de sesión — capturado solo la primera vez via popup
    let codIntSesion = "";

    // 5. ITERAR CADA MES — flujo manual: click mes → folio → Formulario Compacto → PDF → cerrar popup → Volver → repetir
    for (let i = 0; i < PERIODOS.length; i++) {
      const period = PERIODOS[i];
      const celda = candidatos[i];
      const res: Record<string, any> = { period, celda };

      try {
        log.push(`--- ${period} (celda ${i}: x=${celda.x} y=${celda.y}) ---`);

        // Click en la fila del mes
        await page.mouse.click(celda.x, celda.y);

        // Esperar que aparezca el folio del mes en el panel de detalle (máx 10s)
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
          // Intentar volver de todas formas para no romper el flujo
          await clickVolver(page, log);
          continue;
        }
        log.push(`  ${period}: folio=${folioDelDom.folio}`);

        // Construir URL del PDF
        let pdfUrl = "";

        if (codIntSesion) {
          // Meses 2-5: reutilizar codInt con el folio propio del mes
          pdfUrl = `https://www4.sii.cl/rfiInternet/formCompacto?folio=${folioDelDom.folio}&rut=${rutDigitos}&form=029&codInt=${codIntSesion}`;
          res.pdf_url_source = "folio_dom+codInt_sesion";
          log.push(`  ${period}: URL construida con folio+codInt`);
        } else {
          // Mes 1: capturar codInt via popup real
          const posCompacto = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll("a, button, td, span, div"));
            const el = all.find(e => e.textContent?.trim() === "Formulario Compacto");
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

          // Escuchar el popup ANTES de clickear
          const popupPromise = context.waitForEvent("page", { timeout: 12000 }).catch(() => null);
          await page.mouse.click(posCompacto.x, posCompacto.y);
          const popup = await popupPromise;

          if (popup) {
            // Esperar que el popup navegue a la URL real (desde ":" a formCompacto)
            await popup.waitForURL((url) => url.href.includes("formCompacto"), { timeout: 10000 }).catch(() => {});
            const realUrl = popup.url();
            log.push(`  ${period}: popup URL = ${realUrl}`);

            if (realUrl && realUrl.includes("formCompacto")) {
              pdfUrl = realUrl;
              const m = realUrl.match(/[?&]codInt=([^&]+)/i);
              if (m) { codIntSesion = m[1]; log.push(`  codInt sesión: ${codIntSesion}`); }
            }

            // Cerrar popup (ya tenemos la URL)
            await popup.close().catch(() => {});
          }

          res.pdf_url_source = "popup";
        }

        if (!pdfUrl) {
          log.push(`  ${period}: Sin URL de PDF`);
          res.error = "Sin URL de PDF";
          resultados.push(res);
          await clickVolver(page, log);
          continue;
        }

        res.pdf_url = pdfUrl;

        // Descargar PDF con cookies de sesión (sin navegar la página)
        const pdfResp = await context.request.get(pdfUrl, {
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

        // Guardar en BD
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

        // Click "Volver" para regresar a tabla de meses (listo para el siguiente)
        await clickVolver(page, log);

      } catch (e: any) {
        res.error = e.message;
        log.push(`  ${period}: ERROR ${e.message}`);
        await clickVolver(page, log).catch(() => {});
      }

      resultados.push(res);
    }

    // 6. LOGOUT
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

// Hace click en "Volver" y espera que vuelva la tabla de meses
async function clickVolver(page: import("playwright").Page, log: string[]) {
  const pos = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll("a, button, input[type=button], input[type=submit]"));
    const el = all.find(e => e.textContent?.trim() === "Volver" || (e as HTMLInputElement).value === "Volver");
    if (!el) return null;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  });

  if (pos) {
    await page.mouse.click(pos.x, pos.y);
    log.push(`  Volver clickeado (${pos.x}, ${pos.y})`);
    // Esperar que reaparezcan las celdas de meses (tabla de meses visible)
    for (let t = 0; t < 14; t++) {
      await page.waitForTimeout(500);
      const hayTabla = await page.evaluate(() => {
        const tds = Array.from(document.querySelectorAll("td"));
        return tds.some(el => {
          const t = el.textContent?.trim() ?? "";
          return t === "Declaración sin observaciones." || t === "Declaracion sin observaciones.";
        });
      });
      if (hayTabla) { log.push("  Tabla de meses visible"); break; }
    }
  } else {
    log.push("  Volver no encontrado — esperando 3s");
    await page.waitForTimeout(3000);
  }
}
