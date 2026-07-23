import { chromium, Browser, Page } from "playwright";
import { decrypt } from "./encryption";
import type { F29SII } from "./siiF29";

const MESES_ES: Record<string, string> = {
  "01": "Enero", "02": "Febrero", "03": "Marzo", "04": "Abril",
  "05": "Mayo", "06": "Junio", "07": "Julio", "08": "Agosto",
  "09": "Septiembre", "10": "Octubre", "11": "Noviembre", "12": "Diciembre",
};

function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function formatearRutConPuntos(rutDigitos: string): string {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

function parsearFormCompactoHtml(html: string, period: string): F29SII | null {
  function extractCode(code: string | number): number {
    const re = new RegExp(`\\b${code}\\b[^\\d-]*([\\d.]+)`, "i");
    const m = html.match(re);
    if (!m) return 0;
    return parseInt(m[1].replace(/\./g, ""), 10) || 0;
  }
  const ivaDebito = extractCode(20);
  const ivaCredito = extractCode(24);
  const ivaRemanente = extractCode(27);
  const ppm = extractCode(63);
  const retencion = extractCode(111);
  const total = extractCode(91);

  if (ivaDebito === 0 && ivaCredito === 0 && ppm === 0 && total === 0) return null;

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

async function loginSIIConPlaywright(page: Page, rutDigitos: string, dv: string, clave: string): Promise<boolean> {
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  try {
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.fill('[name="rut"]', rutDigitos);
    await page.fill('[name="dv"]', dv);
    await page.fill('[name="rutcntr"]', rutConPuntos);
    await page.fill('[name="clave"]', clave);
    await page.click('input[type="submit"], button[type="submit"]');
    await page.waitForTimeout(3000);

    const url = page.url();
    const cookies = await page.context().cookies();
    const hasAuth = cookies.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name === "NETSCAPE_LIVEWIRE");
    if (!hasAuth && url.includes("IngresoRutClave")) {
      console.error("[F29 PW] Login falló en zeusr, intentando palena");
      await page.goto("https://palena.sii.cl/cgi_AUT2000/CAutInicio.cgi", { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.fill('[name="rut"]', rutDigitos);
      await page.fill('[name="clave"]', clave);
      await page.click('input[type="submit"], button[type="submit"]');
      await page.waitForTimeout(3000);
      const cookies2 = await page.context().cookies();
      return cookies2.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name === "NETSCAPE_LIVEWIRE");
    }
    return hasAuth;
  } catch (e: any) {
    console.error("[F29 PW] Error en login:", e.message);
    return false;
  }
}

async function extraerUnPeriodo(page: Page, rutDigitos: string, period: string): Promise<F29SII | null> {
  const anio = period.slice(0, 4);
  const mes = period.slice(4, 6);
  const mesNombre = MESES_ES[mes] ?? mes;

  try {
    // Navegar al portal de consulta F29
    await page.goto(
      `https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29`,
      { waitUntil: "domcontentloaded", timeout: 30000 }
    );

    // Esperar a que GWT cargue contenido (buscar texto en la página)
    try {
      await page.waitForSelector("table, .gwt-Label, td", { timeout: 15000 });
    } catch {
      console.error(`[F29 PW] GWT no cargó para ${period}`);
    }
    await page.waitForTimeout(3000);

    // Intentar encontrar el período por texto (año o mes)
    const textosBuscados = [
      `${mesNombre} ${anio}`,
      `${mes}/${anio}`,
      `${anio}-${mes}`,
      `${anio}${mes}`,
      mesNombre,
    ];

    let clicked = false;
    for (const texto of textosBuscados) {
      const el = page.getByText(texto, { exact: false }).first();
      if (await el.isVisible().catch(() => false)) {
        await el.click();
        clicked = true;
        console.log(`[F29 PW] Click en "${texto}" para ${period}`);
        break;
      }
    }

    if (!clicked) {
      // Intentar interceptar requests XHR del GWT para obtener datos directamente
      console.error(`[F29 PW] No se encontró el período ${period} en el portal GWT`);
      return await extraerViaIntercept(page, rutDigitos, period);
    }

    await page.waitForTimeout(3000);

    // Buscar folio en URL o en la página
    const currentUrl = page.url();
    const folioEnUrl = currentUrl.match(/folio[=\/](\d{6,12})/i);
    if (folioEnUrl) {
      const folio = folioEnUrl[1];
      return await fetchFormCompacto(page, folio, rutDigitos, period);
    }

    // Buscar link a formCompacto o verDocumento
    const links = await page.$$eval("a[href]", (els) =>
      els.map(e => (e as HTMLAnchorElement).href).filter(h => h.includes("folio") || h.includes("formCompacto") || h.includes("verDocumento"))
    );
    if (links.length > 0) {
      const folioM = links[0].match(/folio[=\/](\d{6,12})/i);
      if (folioM) {
        return await fetchFormCompacto(page, folioM[1], rutDigitos, period);
      }
      await page.goto(links[0], { waitUntil: "domcontentloaded", timeout: 20000 });
      const html = await page.content();
      return parsearFormCompactoHtml(html, period);
    }

    // Extraer datos directamente de la página actual si tiene montos
    const html = await page.content();
    const resultado = parsearFormCompactoHtml(html, period);
    if (resultado) return resultado;

    // Intentar buscar botón "Ver Formulario" o "Ver Detalle"
    const botones = ["Ver Formulario", "Ver Detalle", "Ver PDF", "Imprimir", "Detalle"];
    for (const texto of botones) {
      const btn = page.getByText(texto, { exact: false }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(2000);
        const html2 = await page.content();
        const r2 = parsearFormCompactoHtml(html2, period);
        if (r2) return r2;
        break;
      }
    }

    return null;
  } catch (e: any) {
    console.error(`[F29 PW] Error extrayendo período ${period}:`, e.message);
    return null;
  }
}

async function fetchFormCompacto(page: Page, folio: string, rutDigitos: string, period: string): Promise<F29SII | null> {
  try {
    const url = `https://www4.sii.cl/rfiInternet/verDocumento?folio=${folio}&rut=${rutDigitos}&form=029`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 20000 });
    const html = await page.content();
    console.log(`[F29 PW] formCompacto folio=${folio} para ${period}, HTML len=${html.length}`);
    return parsearFormCompactoHtml(html, period);
  } catch (e: any) {
    console.error(`[F29 PW] Error fetchFormCompacto folio=${folio}:`, e.message);
    return null;
  }
}

// Intercept: capturar requests XHR del GWT para extraer datos directamente
async function extraerViaIntercept(page: Page, rutDigitos: string, period: string): Promise<F29SII | null> {
  const anio = period.slice(0, 4);
  const mes = period.slice(4, 6);

  // Intentar endpoint directo de consulta de declaraciones
  const endpoints = [
    `https://www4.sii.cl/sifmConsultaInternet/services/consultaDeclaracionesServlet?rut=${rutDigitos}&periodo=${anio}-${mes}&form=29`,
    `https://www4.sii.cl/sifmConsultaInternet/consultaDeclaracion?rut=${rutDigitos}&anio=${anio}&mes=${mes}`,
    `https://www4.sii.cl/sifmConsultaInternet/ajax?dest=cifxx&form=29&periodo=${anio}${mes}`,
  ];

  for (const url of endpoints) {
    try {
      const resp = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: "include" });
        return { status: r.status, body: await r.text() };
      }, url);
      if (resp.status === 200 && resp.body.length > 100) {
        console.log(`[F29 PW] Intercept OK: ${url}`);
        const f = parsearFormCompactoHtml(resp.body, period);
        if (f) return f;
        // Intentar parsear JSON
        try {
          const json = JSON.parse(resp.body);
          const d = json?.data ?? json ?? {};
          const ivaDebito = Number(d.ivaDebito ?? d.iva_debito ?? 0);
          const ivaCredito = Number(d.ivaCredito ?? d.iva_credito ?? 0);
          const ivaRemanente = Number(d.ivaRemanente ?? d.iva_remanente ?? 0);
          if (ivaDebito || ivaCredito) {
            return {
              periodo: period, iva_debito: ivaDebito, iva_credito: ivaCredito,
              iva_remanente: ivaRemanente, iva_neto: Math.max(0, ivaDebito - ivaCredito - ivaRemanente),
              retencion_honorarios: Number(d.retencionHonorarios ?? 0),
              ppm: Number(d.ppm ?? 0), total_pagar: Number(d.totalPagar ?? d.total_pagar ?? 0), raw: json,
            };
          }
        } catch { /* no es JSON */ }
      }
    } catch { /* ignorar */ }
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

    const loginOk = await loginSIIConPlaywright(page, rutDigitos, dv, clave);
    if (!loginOk) {
      console.error("[F29 PW] No se pudo autenticar en SII");
      return results;
    }
    console.log(`[F29 PW] Login OK, extrayendo ${periods.length} períodos`);

    for (const period of periods) {
      const f29 = await extraerUnPeriodo(page, rutDigitos, period);
      if (f29) {
        results.set(period, f29);
        console.log(`[F29 PW] Extraído ${period}: IVA débito=${f29.iva_debito}, total=${f29.total_pagar}`);
      } else {
        console.warn(`[F29 PW] Sin datos para ${period}`);
      }
    }

    // Logout
    try {
      await page.goto("https://homer.sii.cl/cgi_AUT2000/autCTermino.cgi", { timeout: 10000 });
    } catch { /* ignorar */ }
    await context.close();
  } catch (e: any) {
    console.error("[F29 PW] Error batch:", e.message);
  } finally {
    if (browser) await browser.close();
  }

  return results;
}
