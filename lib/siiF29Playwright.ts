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
      waitUntil: "networkidle", timeout: 30000,
    });

    // Campos visibles: rutcntr (texto) y clave (password)
    await page.locator('[name="rutcntr"]').fill(rutConPuntos);
    await page.locator('[name="clave"]').fill(clave);

    // Poblar también campos hidden
    await page.evaluate(({ rut, dvVal }) => {
      const set = (sel: string, val: string) => {
        const el = document.querySelector<HTMLInputElement>(sel);
        if (el) { el.value = val; el.dispatchEvent(new Event("change", { bubbles: true })); }
      };
      set('[name="rut"]', rut);
      set('[name="dv"]', dvVal);
    }, { rut: rutDigitos, dvVal: dv });

    // Submit esperando navegación
    await Promise.all([
      page.waitForNavigation({ timeout: 15000, waitUntil: "domcontentloaded" }).catch(() => {}),
      page.evaluate(() => {
        const btn = document.querySelector<HTMLElement>('input[type="submit"], button[type="submit"]');
        if (btn) btn.click();
        else (document.querySelector("form") as HTMLFormElement)?.submit();
      }),
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

    console.error(`[F29 PW] Login sin cookies auth — URL: ${urlFinal}`);
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
    await page.waitForTimeout(2000);

    const title = await page.title();
    console.log(`[F29 PW] internet.html title: "${title}"`);

    // Encontrar el link de la fila F29 para el año actual
    // La tabla tiene: fila F29 → celdas por año con números clickeables
    const f29Row = page.locator("tr").filter({ hasText: "F29" }).first();
    const rowText = await f29Row.textContent().catch(() => "");
    console.log(`[F29 PW] F29 row texto: ${rowText?.substring(0, 200)}`);

    // Encontrar todos los links dentro de la fila F29
    const linksEnF29 = await f29Row.locator("a").all();
    console.log(`[F29 PW] Links en F29 row: ${linksEnF29.length}`);

    let clickedAnio = false;
    for (const link of linksEnF29) {
      const href = await link.getAttribute("href") ?? "";
      const txt = (await link.textContent() ?? "").trim();
      console.log(`[F29 PW] F29 link: txt="${txt}" href="${href}"`);
      // El link del año objetivo: href contiene el año o es el número de declaraciones del año
      if (href.includes(anio) || href.includes(`anio=${anio}`) || href.includes(`periodo=${anio}`)) {
        await link.click();
        clickedAnio = true;
        break;
      }
    }

    if (!clickedAnio && linksEnF29.length > 0) {
      // Fallback: hacer click en el primer link de la fila (generalmente es el año más reciente)
      console.log(`[F29 PW] Haciendo click en primer link F29 row`);
      await linksEnF29[0].click();
      clickedAnio = true;
    }

    if (!clickedAnio) {
      // Intentar click directo en texto del año en la tabla
      const anioCell = page.locator("table").locator(`text=${anio}`).first();
      if (await anioCell.isVisible().catch(() => false)) {
        await anioCell.click();
        clickedAnio = true;
      }
    }

    if (!clickedAnio) {
      console.error(`[F29 PW] No se pudo hacer click en año ${anio} de tabla F29`);
      return result;
    }

    await page.waitForTimeout(3000);
    const urlLista = page.url();
    const htmlLista = await page.content();
    console.log(`[F29 PW] URL lista F29: ${urlLista}`);
    console.log(`[F29 PW] Lista HTML (800): ${htmlLista.substring(0, 800)}`);

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

    // Si no encontramos por links, buscar patrones folio= en el HTML
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

    // Alternativa: navegar por cada período clickeando filas de la tabla
    if (result.size === 0) {
      console.log(`[F29 PW] Sin folios en links, intentando navegar por filas de tabla`);
      const rows = await page.$$("table tr");
      for (const row of rows.slice(1)) { // saltar header
        const rowText2 = await row.textContent() ?? "";
        const period = detectarPeriod(rowText2, "", anio);
        if (!period) continue;
        const rowLinks = await row.$$("a[href]");
        if (rowLinks.length === 0) continue;
        // Hacer click para navegar al detalle
        const href = await rowLinks[0].getAttribute("href") ?? "";
        const folioM2 = href.match(/folio=(\d+)/i);
        const codIntM2 = href.match(/codInt=(\d+)/i);
        if (folioM2 && codIntM2) {
          result.set(period, { folio: folioM2[1], codInt: codIntM2[1] });
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
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      locale: "es-CL",
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
