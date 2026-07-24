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
  const period = req.nextUrl.searchParams.get("period") ?? "202601"; // YYYYMM
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

  const anio = period.slice(0, 4);
  const mes = parseInt(period.slice(4, 6), 10);

  const resultado: Record<string, any> = { empresa: empresa.nombre, period };

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
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.locator('[name="rutcntr"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(rutConPuntos, { delay: 80 });
    await page.locator('[name="clave"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(clave, { delay: 80 });
    await page.evaluate(({ rut, dv }: { rut: string; dv: string }) => {
      const set = (name: string, val: string) => { const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null; if (el) el.value = val; };
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
    resultado.login_ok = loginOk;
    if (!loginOk) {
      await context.close();
      return NextResponse.json({ ...resultado, error: "Login fallido" });
    }

    // 2. NAVEGAR A CONSULTA INTEGRAL F29 — interceptar respuestas de red
    const interceptadas: { url: string; body: string }[] = [];
    page.on("response", async (response) => {
      const url = response.url();
      if (/\.(js|css|gif|png|jpg|ico|woff|svg)(\?|$)/i.test(url)) return;
      if (!url.includes("sii.cl")) return;
      try {
        const body = await response.text().catch(() => "");
        if (body.length > 50) interceptadas.push({ url, body: body.slice(0, 600) });
      } catch {}
    });

    await page.goto("https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await page.waitForTimeout(8000);

    resultado.url_consulta = page.url();
    resultado.interceptadas_count = interceptadas.length;
    resultado.interceptadas_sample = interceptadas.slice(0, 5).map(r => ({ url: r.url, body: r.body.slice(0, 200) }));
    resultado.html_snippet = (await page.content()).slice(0, 800);

    // 3. BUSCAR Y CLICK EN EL NÚMERO DE DECLARACIONES DEL AÑO
    // La tabla GWT muestra el año y un número clickeable
    const clickAnio = await page.evaluate((anio: string) => {
      // Buscar cualquier celda que sea un enlace con el año en la misma fila
      const links = Array.from(document.querySelectorAll("a, td, span"));
      const numeros = links.filter(el => {
        const t = el.textContent?.trim() ?? "";
        return /^\d+$/.test(t) && parseInt(t) > 0 && parseInt(t) < 20;
      });
      resultado_debug: { return numeros.map(el => ({ tag: el.tagName, text: el.textContent?.trim(), class: el.className })); }
    }, anio);
    resultado.elementos_numericos = clickAnio;

    // Intentar click en el número bajo el año correspondiente
    const clickedNum = await page.evaluate((anio: string) => {
      const tds = Array.from(document.querySelectorAll("td, th"));
      const anioTd = tds.find(td => td.textContent?.trim() === anio);
      if (!anioTd) return "no_encontrado_anio";
      // El número de declaraciones está en la misma columna, fila siguiente
      const colIndex = Array.from(anioTd.parentElement?.children ?? []).indexOf(anioTd);
      const tbody = anioTd.closest("table")?.querySelector("tbody");
      if (!tbody) return "no_tbody";
      for (const row of Array.from(tbody.querySelectorAll("tr"))) {
        const cells = Array.from(row.querySelectorAll("td"));
        const cell = cells[colIndex];
        if (cell) {
          const link = cell.querySelector("a") ?? cell;
          if (/^\d+$/.test(link.textContent?.trim() ?? "")) {
            (link as HTMLElement).click();
            return `clicked:${link.textContent?.trim()}`;
          }
        }
      }
      return "no_numero_en_columna";
    }, anio);
    resultado.click_anio = clickedNum;
    await page.waitForTimeout(5000);

    resultado.html_after_click = (await page.content()).slice(0, 1200);

    // 4. BUSCAR MES Y CLICK EN CHECKMARK
    const MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
      "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
    const mesNombre = MESES[mes];
    resultado.mes_buscado = mesNombre;

    const clickMes = await page.evaluate((mesNombre: string) => {
      const links = Array.from(document.querySelectorAll("a, td"));
      const mesEl = links.find(el => el.textContent?.trim().toLowerCase().startsWith(mesNombre.toLowerCase()));
      if (!mesEl) return "no_encontrado_mes";
      // Buscar el visto (imagen, link, o td clickeable) en la misma fila
      const row = mesEl.closest("tr");
      if (!row) return "no_row";
      const clickables = Array.from(row.querySelectorAll("a, img, td[onclick]"));
      for (const el of clickables) {
        const href = (el as HTMLAnchorElement).href ?? "";
        const onclick = (el as HTMLElement).getAttribute("onclick") ?? "";
        if (href || onclick) {
          (el as HTMLElement).click();
          return `clicked_en_fila_${mesNombre}:${href || onclick}`;
        }
      }
      // Si no hay link/onclick, click en la fila directamente
      (row as HTMLElement).click();
      return `clicked_row_${mesNombre}`;
    }, mesNombre);
    resultado.click_mes = clickMes;
    await page.waitForTimeout(5000);

    resultado.html_after_mes = (await page.content()).slice(0, 1200);

    // 5. BUSCAR BOTÓN "FORMULARIO COMPACTO" Y CLICK — capturar popup
    const popupPromise = context.waitForEvent("page", { timeout: 15000 }).catch(() => null);
    const clickFormCompacto = await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll("a, button, input[type=button], input[type=submit]"));
      const btn = btns.find(el => {
        const t = (el.textContent ?? (el as HTMLInputElement).value ?? "").toLowerCase();
        return t.includes("compacto") || t.includes("formulario");
      });
      if (!btn) return null;
      (btn as HTMLElement).click();
      return (btn as HTMLAnchorElement).href || btn.textContent?.trim() || "clicked";
    });
    resultado.click_formulario_compacto = clickFormCompacto;

    const popup = await popupPromise;
    if (popup) {
      await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
      await popup.waitForTimeout(3000);
      resultado.popup_url = popup.url();
      resultado.popup_html_snippet = (await popup.content()).slice(0, 800);

      // Intentar descargar el PDF via fetch desde el popup
      const pdfUrl = popup.url();
      if (pdfUrl && pdfUrl !== "about:blank") {
        const pdfBuffer = await page.evaluate(async (url: string) => {
          try {
            const r = await fetch(url, { credentials: "include" });
            const ab = await r.arrayBuffer();
            return { ok: true, size: ab.byteLength, base64: btoa(String.fromCharCode(...new Uint8Array(ab).slice(0, 100))) };
          } catch (e: any) { return { ok: false, error: e.message }; }
        }, pdfUrl);
        resultado.pdf_fetch = pdfBuffer;
      }
      await popup.close().catch(() => {});
    } else {
      resultado.popup = "no_abierto";
      resultado.html_after_compacto = (await page.content()).slice(0, 1200);
    }

    // 6. LOGOUT
    await page.goto("https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi", { timeout: 8000 }).catch(() => {});
    await context.close();
  } catch (e: any) {
    resultado.error = e.message;
  } finally {
    await browser.close();
  }

  return NextResponse.json(resultado, { status: 200 });
}
