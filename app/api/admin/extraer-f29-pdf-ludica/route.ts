import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { chromium } from "playwright";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const EMPRESA_ID = "cmri21z6200263so3ei1bt08n"; // Lúdica Spa
const PERIODOS = ["202601", "202602", "202603", "202604", "202605"];
// Coordenada Y de cada fila de mes en la tabla GWT (Enero→Mayo 2026)
const FILAS_Y = [320, 348, 376, 404, 432];

function normalizarRut(rut: string) {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}
function formatearRutConPuntos(rutDigitos: string) {
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

    // 2. NAVEGAR A CONSULTA INTEGRAL F29
    await page.goto("https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await page.waitForTimeout(12000);
    log.push("Página F29 cargada");

    // 3. CLICK EN "5" PARA EXPANDIR AÑO 2026
    const posNum = await page.evaluate(() => {
      const tds = Array.from(document.querySelectorAll("td, a, span"));
      const numEl = tds.find(el => {
        const t = el.textContent?.trim() ?? "";
        return /^\d+$/.test(t) && parseInt(t) > 0 && parseInt(t) < 20;
      });
      if (!numEl) return null;
      const rect = numEl.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    if (!posNum) {
      await context.close();
      return NextResponse.json({ error: "No se encontró el contador de declaraciones", log });
    }
    await page.mouse.click(posNum.x, posNum.y);
    await page.waitForTimeout(10000);
    log.push(`Click en contador de declaraciones (${posNum.x}, ${posNum.y})`);

    // Instalar interceptor de window.open una sola vez
    await page.evaluate(() => {
      const orig = window.open.bind(window);
      (window as any).__windowOpenCalls = [];
      window.open = function(...args: any[]) {
        (window as any).__windowOpenCalls.push(args.map(String));
        return orig(...args);
      };
    });

    // codInt es de sesión — lo capturamos en el primer mes y lo reutilizamos
    let codIntSesion = "";

    // Encontrar las N celdas "Declaración sin observaciones." ya renderizadas (ordenadas por Y)
    // La lista ya está expandida desde el paso 3
    const candidatosTD = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("td"));
      const found: { x: number; y: number }[] = [];
      for (const el of all) {
        const t = el.textContent?.trim() ?? "";
        if (t === "Declaración sin observaciones." || t === "Declaracion sin observaciones.") {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            found.push({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
          }
        }
      }
      // Ordenar por Y ascendente y deduplicar (GWT duplica elementos)
      found.sort((a, b) => a.y - b.y);
      const dedup: { x: number; y: number }[] = [];
      for (const p of found) {
        if (!dedup.length || Math.abs(p.y - dedup[dedup.length - 1].y) > 5) dedup.push(p);
      }
      return dedup;
    });
    log.push(`Celdas de meses encontradas: ${candidatosTD.length} → ${JSON.stringify(candidatosTD)}`);

    if (candidatosTD.length < PERIODOS.length) {
      await context.close();
      return NextResponse.json({ error: `Solo ${candidatosTD.length} celdas encontradas, se esperaban ${PERIODOS.length}`, log });
    }

    // 4. ITERAR LOS 5 MESES — SIN re-expandir, siguiendo flujo manual:
    //    click fila → esperar folio → click Formulario Compacto → capturar URL → cerrar popup → siguiente
    for (let i = 0; i < PERIODOS.length; i++) {
      const period = PERIODOS[i];
      const celda = candidatosTD[i];
      const res: Record<string, any> = { period, celda };

      try {
        log.push(`--- Procesando ${period} (celda ${i}: x=${celda.x} y=${celda.y}) ---`);

        // Leer folio actual antes del click para detectar cambio
        const folioAntes = await page.evaluate(() => {
          const all = Array.from(document.querySelectorAll("td, div, span"));
          for (const el of all) {
            const m = el.textContent?.trim().match(/^(\d{8,12})\s*-\s*(DECLARACION VIGENTE|DECLARACION RECTIFICATORIA|DECLARACION PRIMITIVA)/i);
            if (m) return m[1];
          }
          return null;
        });

        // Click en la celda del mes
        await page.evaluate(() => { (window as any).__windowOpenCalls = []; });
        await page.mouse.click(celda.x, celda.y);

        // Esperar hasta que el folio cambie (o aparezca por primera vez) — máx 10s
        let folioDelDom: { folio: string; tipo: string } | null = null;
        for (let intento = 0; intento < 20; intento++) {
          await page.waitForTimeout(500);
          folioDelDom = await page.evaluate((anterior: string | null) => {
            const all = Array.from(document.querySelectorAll("td, div, span"));
            for (const el of all) {
              const m = el.textContent?.trim().match(/^(\d{8,12})\s*-\s*(DECLARACION VIGENTE|DECLARACION RECTIFICATORIA|DECLARACION PRIMITIVA)/i);
              if (m && m[1] !== anterior) return { folio: m[1], tipo: m[2] };
            }
            return null;
          }, folioAntes);
          if (folioDelDom) break;
        }

        // Si el folio no cambió y es el primer mes, aceptar el que haya
        if (!folioDelDom && i === 0) {
          folioDelDom = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll("td, div, span"));
            for (const el of all) {
              const m = el.textContent?.trim().match(/^(\d{8,12})\s*-\s*(DECLARACION VIGENTE|DECLARACION RECTIFICATORIA|DECLARACION PRIMITIVA)/i);
              if (m) return { folio: m[1], tipo: m[2] };
            }
            return null;
          });
        }

        res.folio_antes = folioAntes;
        res.folio_dom = folioDelDom;

        if (!folioDelDom) {
          log.push(`  ${period}: Sin folio en DOM tras click`);
          res.error = "Sin folio en DOM";
          resultados.push(res);
          continue;
        }

        // Obtener URL del PDF
        let pdfUrl = "";
        if (codIntSesion) {
          // Reutilizar codInt ya conocido con el folio del mes actual
          pdfUrl = `https://www4.sii.cl/rfiInternet/formCompacto?folio=${folioDelDom.folio}&rut=${rutDigitos}&form=029&codInt=${codIntSesion}`;
          res.pdf_url_source = "codInt_reutilizado";
        } else {
          // Primera vez: click en "Formulario Compacto" para capturar codInt de sesión
          await page.evaluate(() => { (window as any).__windowOpenCalls = []; });
          const posCompacto = await page.evaluate(() => {
            const all = Array.from(document.querySelectorAll("a, button, input, td, span, div"));
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
            continue;
          }
          await page.mouse.click(posCompacto.x, posCompacto.y);
          await page.waitForTimeout(2000);
          const calls = await page.evaluate(() => (window as any).__windowOpenCalls ?? []);
          if (calls.length > 0 && calls[0][0] && calls[0][0] !== ":") {
            const realUrl: string = calls[0][0];
            const codIntM = realUrl.match(/[?&]codInt=([^&]+)/i);
            if (codIntM) { codIntSesion = codIntM[1]; log.push(`  codInt sesión: ${codIntSesion}`); }
            pdfUrl = realUrl;
          }
          res.pdf_url_source = "window_open";

          // Cerrar popup para no bloquear clicks siguientes
          await page.waitForTimeout(500);
          for (const p of context.pages()) {
            if (p !== page) await p.close().catch(() => {});
          }
        }

        if (!pdfUrl) {
          log.push(`  ${period}: Sin URL de PDF`);
          res.error = "Sin URL de PDF";
          resultados.push(res);
          continue;
        }

        res.pdf_url = pdfUrl;

        // Descargar PDF con context.request (cookies de sesión, sin navegar la página)
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
          continue;
        }

        // Guardar en BD: buscar F29Genapi existente por empresaId+period y actualizar pdfBytes
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
          log.push(`  ${period}: PDF guardado (actualizado) len=${buf.length}`);
        } else {
          // Crear Extraccion + F29Genapi desde cero
          const ext = await prisma.extraccion.create({
            data: {
              empresaId: EMPRESA_ID,
              period,
              modulo: "f29",
              estado: "SUCCESS",
            },
          });
          await prisma.f29Genapi.create({
            data: {
              empresaId: EMPRESA_ID,
              extraccionId: ext.id,
              period,
              pdfBytes: new Uint8Array(buf),
            },
          });
          res.guardado = "creado";
          log.push(`  ${period}: PDF guardado (nuevo registro) len=${buf.length}`);
        }

        res.error = null;
      } catch (e: any) {
        res.error = e.message;
        log.push(`  ${period}: ERROR ${e.message}`);
      }

      resultados.push(res);
    }

    // 5. LOGOUT
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
