import { chromium, Browser, Page } from "playwright";
import { decrypt } from "./encryption";
import type { F29SII } from "./siiF29";

const MESES_ES: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};
const MESES_NUM: Record<string, string> = Object.fromEntries(
  Object.entries(MESES_ES).map(([k, v]) => [v.toLowerCase(), k])
);

function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function formatearRutConPuntos(rutDigitos: string): string {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

// Intenta determinar el period (YYYYMM) desde texto o href
function detectarPeriod(texto: string, href: string, anio: string): string | null {
  // Patrón "MM/YYYY" o "MM-YYYY"
  const mMatch = texto.match(/(\d{1,2})[\/\-](\d{4})/);
  if (mMatch) {
    const mes = mMatch[1].padStart(2, "0");
    const anioM = mMatch[2];
    return `${anioM}${mes}`;
  }
  // Patrón "YYYY-MM" o "YYYYMM"
  const ym = texto.match(/(\d{4})[\/\-]?(\d{2})/);
  if (ym && ym[1] === anio) return `${ym[1]}${ym[2]}`;
  // Nombre de mes en español
  for (const [nombre, num] of Object.entries(MESES_NUM)) {
    if (texto.toLowerCase().includes(nombre)) return `${anio}${num}`;
  }
  // Buscar en href
  const hrefM = href.match(/periodo[=\/](\d{4})[\/\-]?(\d{2})/i) || href.match(/(\d{4})(\d{2})/);
  if (hrefM) return `${hrefM[1]}${hrefM[2]}`;
  return null;
}

function parsearVerDocumentoHtml(html: string, period: string): F29SII | null {
  function extractCode(code: number): number {
    // Buscar patrón: el código aparece como número seguido de valor
    const patterns = [
      new RegExp(`\\b${code}\\b[^\\d]{0,30}?([\\d\\.]+)`, "i"),
      new RegExp(`"${code}"[^\\d]{0,20}?([\\d\\.]+)`, "i"),
      new RegExp(`>${code}<[^>]*>[^\\d]{0,10}?([\\d\\.]+)`, "i"),
    ];
    for (const re of patterns) {
      const m = html.match(re);
      if (m) {
        const val = parseInt(m[1].replace(/\./g, ""), 10);
        if (val > 0) return val;
      }
    }
    return 0;
  }

  const ivaDebito = extractCode(20);
  const ivaCredito = extractCode(24);
  const ivaRemanente = extractCode(27);
  const ppm = extractCode(63);
  const retencion = extractCode(111);
  const total = extractCode(91);

  if (ivaDebito === 0 && ivaCredito === 0 && ppm === 0 && total === 0) {
    console.error(`[F29 PW] parsear: no se encontraron datos en HTML (500): ${html.substring(0, 500)}`);
    return null;
  }

  return {
    periodo: period,
    iva_debito: ivaDebito,
    iva_credito: ivaCredito,
    iva_remanente: ivaRemanente,
    iva_neto: Math.max(0, ivaDebito - ivaCredito - ivaRemanente),
    retencion_honorarios: retencion,
    ppm,
    total_pagar: total,
    raw: html.substring(0, 2000),
  };
}

async function loginSIIPlaywright(page: Page, rutDigitos: string, dv: string, clave: string): Promise<boolean> {
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  try {
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      waitUntil: "load", timeout: 30000,
    });
    await page.waitForTimeout(1500);

    // Usar type() con delay para simular tecleo real (dispara keydown/keypress/keyup)
    // Limpiar primero y luego escribir carácter por carácter
    const rutField = page.locator('[name="rutcntr"]');
    await rutField.click();
    await rutField.selectText().catch(() => {});
    await page.keyboard.press("Control+a");
    await page.keyboard.type(rutConPuntos, { delay: 80 });

    const claveField = page.locator('[name="clave"]');
    await claveField.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(clave, { delay: 80 });

    // Forzar campos hidden que el SII espera en el POST (igual que el cliente HTTP)
    await page.evaluate(({ rut, dv }: { rut: string; dv: string }) => {
      const setField = (name: string, value: string) => {
        const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        if (el) el.value = value;
      };
      setField("rut", rut);
      setField("dv", dv);
      setField("referencia", "https://homer.sii.cl/");
      setField("411", "");
    }, { rut: rutDigitos, dv });

    await page.waitForTimeout(500);

    // Verificar qué quedó en rutcntr
    const rutVal = await rutField.inputValue().catch(() => "?");
    console.log(`[F29 PW] rutcntr value: "${rutVal}"`);

    // Submit esperando navegación
    await Promise.all([
      page.waitForNavigation({ timeout: 15000, waitUntil: "domcontentloaded" }).catch(() => {}),
      page.locator('input[type="submit"], button[type="submit"]').first().click().catch(() =>
        page.evaluate(() => (document.querySelector("form") as HTMLFormElement)?.submit())
      ),
    ]);

    await page.waitForTimeout(3000);

    const urlFinal = page.url();
    const cookies = await page.context().cookies();
    const cookieNames = cookies.map(c => c.name);
    console.log(`[F29 PW] URL post-login: ${urlFinal}`);
    console.log(`[F29 PW] Cookies: ${cookieNames.join(", ")}`);

    const hasAuth = cookies.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name === "NETSCAPE_LIVEWIRE");
    if (hasAuth) {
      console.log(`[F29 PW] Login OK RUT ${rutDigitos}`);
      return true;
    }

    // Loguear contenido de la página para diagnosticar el rechazo
    const pageContent = await page.content().catch(() => "");
    const bodyText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    console.error(`[F29 PW] Login sin cookies auth — URL: ${urlFinal}`);
    console.error(`[F29 PW] Página post-login texto (500): ${bodyText.substring(0, 500)}`);
    console.error(`[F29 PW] Página post-login HTML (800): ${pageContent.substring(0, 800)}`);
  } catch (e: any) {
    console.error(`[F29 PW] Error login: ${e.message.substring(0, 150)}`);
  }

  // Siempre intentar logout preventivo para no dejar sesión abierta
  for (const url of ["https://homer.sii.cl/cgi_AUT2000/autCTermino.cgi", "https://zeusr.sii.cl/cgi_AUT2000/CAutTermino.cgi"]) {
    try { await page.goto(url, { timeout: 8000 }); } catch {}
  }
  return false;
}

// Navega a internet.html y extrae folio+codInt por período del año dado
async function obtenerFoliosPorAnio(
  page: Page,
  rutDigitos: string,
  anio: string
): Promise<Map<string, { folio: string; codInt: string }>> {
  const result = new Map<string, { folio: string; codInt: string }>();

  try {
    await page.goto("https://www4.sii.cl/sifmConsultaInternet/internet.html", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });

    // Esperar a que la tabla GWT renderice — puede tardar varios segundos
    console.log(`[F29 PW] Esperando tabla GWT en internet.html...`);
    let tablaVisible = false;
    for (let i = 0; i < 10; i++) {
      await page.waitForTimeout(2000);
      // Buscar una celda que diga exactamente "29" (número del formulario en la tabla)
      const celdas = await page.$$eval("td", (tds) =>
        tds.map(td => td.textContent?.trim() ?? "")
      );
      if (celdas.some(t => t === "29" || t === "F-29" || t === "F29")) {
        tablaVisible = true;
        console.log(`[F29 PW] Tabla GWT detectada al intento ${i + 1}`);
        break;
      }
    }

    if (!tablaVisible) {
      // Loguear HTML para diagnóstico
      const html = await page.content();
      console.error(`[F29 PW] Tabla GWT no apareció. HTML (1000): ${html.substring(0, 1000)}`);
      return result;
    }

    // Encontrar la celda que dice "29" y su fila
    const f29Row = page.locator("tr").filter({
      has: page.locator("td", { hasText: /^(F-?29|29)$/ }),
    }).first();

    const rowText = await f29Row.textContent().catch(() => "");
    console.log(`[F29 PW] F29 row texto: ${rowText?.substring(0, 300)}`);

    // Buscar links dentro de la fila que tengan solo números (cantidad de declaraciones del año)
    const celdas = await f29Row.locator("td").all();
    let clickedAnio = false;

    for (const celda of celdas) {
      const txt = (await celda.textContent() ?? "").trim();
      // El año va en el header — buscar la celda con un número pequeño (1-99 declaraciones)
      const link = celda.locator("a").first();
      if (!(await link.isVisible().catch(() => false))) continue;
      const href = await link.getAttribute("href") ?? "";
      const linkTxt = (await link.textContent() ?? "").trim();
      console.log(`[F29 PW] Celda F29 row: txt="${txt}" linkTxt="${linkTxt}" href="${href}"`);

      // Buscar celda del año objetivo
      if (href.includes(anio) || txt.includes(anio)) {
        await link.click();
        clickedAnio = true;
        console.log(`[F29 PW] Click en celda del año ${anio}`);
        break;
      }
    }

    if (!clickedAnio) {
      // Obtener headers de la tabla para saber qué columna es cada año
      const headers = await page.$$eval("th", ths => ths.map(th => th.textContent?.trim() ?? ""));
      console.log(`[F29 PW] Headers tabla: ${JSON.stringify(headers)}`);

      // Encontrar índice de columna para el año
      const colIdx = headers.findIndex(h => h.includes(anio));
      if (colIdx >= 0) {
        const linkEnCol = f29Row.locator("td").nth(colIdx).locator("a").first();
        if (await linkEnCol.isVisible().catch(() => false)) {
          await linkEnCol.click();
          clickedAnio = true;
          console.log(`[F29 PW] Click en columna ${colIdx} (año ${anio})`);
        }
      }
    }

    if (!clickedAnio) {
      console.error(`[F29 PW] No se encontró celda del año ${anio} en tabla F29`);
      return result;
    }

    await page.waitForTimeout(4000);
    const urlLista = page.url();
    const htmlLista = await page.content();
    console.log(`[F29 PW] URL lista F29: ${urlLista}`);
    console.log(`[F29 PW] Lista HTML (1000): ${htmlLista.substring(0, 1000)}`);

    // Extraer folio + codInt de los links de la lista
    const allLinks = await page.$$eval("a[href]", els =>
      els.map(e => ({
        href: (e as HTMLAnchorElement).href,
        text: (e as HTMLAnchorElement).closest("tr")?.textContent?.trim() ?? (e as HTMLAnchorElement).textContent?.trim() ?? "",
      }))
    );

    for (const lnk of allLinks) {
      if (!lnk.href.includes("folio") && !lnk.href.includes("formCompacto") && !lnk.href.includes("verDocumento")) continue;
      const folioM = lnk.href.match(/folio=(\d+)/i);
      const codIntM = lnk.href.match(/codInt=(\d+)/i);
      if (!folioM || !codIntM) continue;

      const period = detectarPeriod(lnk.text, lnk.href, anio);
      console.log(`[F29 PW] Link con folio: folio=${folioM[1]} codInt=${codIntM[1]} period=${period} texto="${lnk.text.substring(0, 80)}"`);
      if (period && !result.has(period)) {
        result.set(period, { folio: folioM[1], codInt: codIntM[1] });
      }
    }

    // Fallback: buscar patrones folio= en el HTML
    if (result.size === 0) {
      const folioRe = /folio=(\d+)[^"&]*codInt=(\d+)/gi;
      let m;
      while ((m = folioRe.exec(htmlLista)) !== null) {
        const ctx = htmlLista.substring(Math.max(0, m.index - 200), m.index + 200);
        const period = detectarPeriod(ctx, m[0], anio);
        if (period && !result.has(period)) {
          console.log(`[F29 PW] Folio desde regex: folio=${m[1]} codInt=${m[2]} period=${period}`);
          result.set(period, { folio: m[1], codInt: m[2] });
        }
      }
    }

  } catch (e: any) {
    console.error(`[F29 PW] Error obtenerFolios: ${e.message.substring(0, 200)}`);
  }

  console.log(`[F29 PW] Folios encontrados para ${anio}: ${result.size} — ${JSON.stringify([...result.entries()].map(([p, v]) => `${p}:${v.folio}`))}`);
  return result;
}

async function extraerDatosF29(
  page: Page,
  rutDigitos: string,
  folio: string,
  codInt: string,
  period: string
): Promise<F29SII | null> {
  // Intentar verDocumento (HTML) primero
  try {
    const url = `https://www4.sii.cl/rfiInternet/verDocumento?folio=${folio}&rut=${rutDigitos}&form=029&codInt=${codInt}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    const html = await page.content();
    console.log(`[F29 PW] verDocumento ${period} len=${html.length}`);
    const f29 = parsearVerDocumentoHtml(html, period);
    if (f29) return f29;
  } catch (e: any) {
    console.warn(`[F29 PW] verDocumento falló para ${period}: ${e.message.substring(0, 80)}`);
  }

  // Fallback: formCompacto (PDF) — extraer texto via Playwright text content
  try {
    const url = `https://www4.sii.cl/rfiInternet/formCompacto?folio=${folio}&rut=${rutDigitos}&form=029&codInt=${codInt}`;
    const resp = await page.evaluate(async (u) => {
      try {
        const r = await fetch(u, { credentials: "include" });
        return { status: r.status, body: await r.text() };
      } catch { return { status: 0, body: "" }; }
    }, url);
    if (resp.status === 200 && resp.body.length > 100) {
      console.log(`[F29 PW] formCompacto ${period} len=${resp.body.length}`);
      const f29 = parsearVerDocumentoHtml(resp.body, period);
      if (f29) return f29;
    }
  } catch (e: any) {
    console.warn(`[F29 PW] formCompacto falló para ${period}: ${e.message.substring(0, 80)}`);
  }

  return null;
}

export async function extraerF29Batch(
  siiRut: string,
  siiClaveEnc: string,
  periods: string[]
): Promise<Map<string, F29SII>> {
  const results = new Map<string, F29SII>();
  if (periods.length === 0) return results;

  const clave = decrypt(siiClaveEnc);
  const rutNormalizado = normalizarRut(siiRut);
  const rutDigitos = rutNormalizado.slice(0, -1);
  const dv = rutNormalizado.slice(-1);

  // Agrupar períodos por año
  const porAnio = new Map<string, string[]>();
  for (const p of periods) {
    const anio = p.slice(0, 4);
    if (!porAnio.has(anio)) porAnio.set(anio, []);
    porAnio.get(anio)!.push(p);
  }

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({
      headless: true,
      args: [
        "--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu",
        "--disable-blink-features=AutomationControlled",
      ],
    });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      locale: "es-CL",
    });
    // Ocultar navigator.webdriver para evitar detección de headless
    await context.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
      (window as any).chrome = { runtime: {} };
    });
    const page = await context.newPage();

    const loginOk = await loginSIIPlaywright(page, rutDigitos, dv, clave);
    if (!loginOk) {
      await context.close();
      return results;
    }

    // Procesar cada año
    for (const [anio, periodosAnio] of porAnio.entries()) {
      const foliosAnio = await obtenerFoliosPorAnio(page, rutDigitos, anio);

      for (const period of periodosAnio) {
        const folioData = foliosAnio.get(period);
        if (!folioData) {
          console.warn(`[F29 PW] Sin folio para período ${period}`);
          continue;
        }
        const f29 = await extraerDatosF29(page, rutDigitos, folioData.folio, folioData.codInt, period);
        if (f29) {
          results.set(period, f29);
          console.log(`[F29 PW] OK ${period}: iva_débito=${f29.iva_debito} total=${f29.total_pagar}`);
        }
      }
    }

    // Logout
    for (const url of ["https://homer.sii.cl/cgi_AUT2000/autCTermino.cgi", "https://zeusr.sii.cl/cgi_AUT2000/CAutTermino.cgi"]) {
      try { await page.goto(url, { timeout: 8000 }); } catch {}
    }
    await context.close();
  } catch (e: any) {
    console.error("[F29 PW] Error batch:", e.message.substring(0, 200));
  } finally {
    if (browser) await browser.close();
  }

  return results;
}
