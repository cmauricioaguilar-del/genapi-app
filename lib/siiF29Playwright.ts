import { chromium, Browser, Page, BrowserContext } from "playwright";
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

    // Esperar a que GWT cargue (puede tardar varios segundos)
    console.log(`[F29 PW] Esperando GWT para ${period}...`);
    try {
      await page.waitForFunction(
        () => document.querySelectorAll("td, table, .gwt-Label").length > 5,
        { timeout: 20000 }
      );
    } catch {
      console.warn(`[F29 PW] GWT tardó demasiado para ${period}`);
    }
    await page.waitForTimeout(2000);

    const htmlInicial = await page.content();
    console.log(`[F29 PW] HTML ${period} len=${htmlInicial.length}, tiene JS: ${htmlInicial.includes("sifmConsulta")}`);

    // Intentar encontrar el período por texto visible (el año o mes+año)
    const textosBuscados = [
      `${mesNombre} ${anio}`,
      `${mes}/${anio}`,
      `${anio}-${mes}`,
      mesNombre,
    ];

    let clicked = false;
    for (const texto of textosBuscados) {
      try {
        const el = page.getByText(texto, { exact: false }).first();
        const visible = await el.isVisible({ timeout: 2000 }).catch(() => false);
        if (visible) {
          await el.click();
          clicked = true;
          console.log(`[F29 PW] Click en "${texto}" para ${period}`);
          await page.waitForTimeout(3000);
          break;
        }
      } catch { /* continuar */ }
    }

    if (!clicked) {
      console.warn(`[F29 PW] No se encontró texto del período ${period} en GWT — intentando via fetch directo`);
      return await extraerViaFetchDesdePagina(page, rutDigitos, period);
    }

    // Buscar folio en URL actual
    const currentUrl = page.url();
    const folioEnUrl = currentUrl.match(/folio[=\/](\d{6,12})/i);
    if (folioEnUrl) {
      return await fetchFormCompacto(page, folioEnUrl[1], rutDigitos, period);
    }

    // Buscar links con folio en la página
    const links = await page.$$eval("a[href]", (els) =>
      els.map(e => (e as HTMLAnchorElement).href).filter(h => h.includes("folio") || h.includes("formCompacto") || h.includes("verDocumento"))
    );
    if (links.length > 0) {
      const folioM = links[0].match(/folio[=\/](\d{6,12})/i);
      if (folioM) return await fetchFormCompacto(page, folioM[1], rutDigitos, period);
      await page.goto(links[0], { waitUntil: "domcontentloaded", timeout: 20000 });
      return parsearFormCompactoHtml(await page.content(), period);
    }

    // Intentar parsear la página actual
    const html = await page.content();
    const resultado = parsearFormCompactoHtml(html, period);
    if (resultado) return resultado;

    // Buscar botones de detalle
    for (const texto of ["Ver Formulario", "Ver Detalle", "Ver PDF", "Imprimir", "Detalle"]) {
      const btn = page.getByText(texto, { exact: false }).first();
      if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(2000);
        const r2 = parsearFormCompactoHtml(await page.content(), period);
        if (r2) return r2;
        break;
      }
    }

    return null;
  } catch (e: any) {
    console.error(`[F29 PW] Error extrayendo período ${period}:`, e.message.substring(0, 150));
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
    console.error(`[F29 PW] Error fetchFormCompacto folio=${folio}:`, e.message.substring(0, 100));
    return null;
  }
}

// Fallback: usa fetch desde dentro del browser (con las cookies ya inyectadas)
async function extraerViaFetchDesdePagina(page: Page, rutDigitos: string, period: string): Promise<F29SII | null> {
  const anio = period.slice(0, 4);
  const mes = period.slice(4, 6);

  const endpoints = [
    `https://www4.sii.cl/sifmConsultaInternet/services/consultaDeclaracionesServlet?rut=${rutDigitos}&periodo=${anio}-${mes}&form=29`,
    `https://www4.sii.cl/sifmConsultaInternet/consultaDeclaracion?rut=${rutDigitos}&anio=${anio}&mes=${mes}`,
  ];

  for (const url of endpoints) {
    try {
      const resp = await page.evaluate(async (u) => {
        const r = await fetch(u, { credentials: "include" });
        return { status: r.status, body: await r.text() };
      }, url);
      if (resp.status === 200 && resp.body.length > 100) {
        console.log(`[F29 PW] fetch interno OK ${url.substring(0, 80)}`);
        const f = parsearFormCompactoHtml(resp.body, period);
        if (f) return f;
      }
    } catch { /* ignorar */ }
  }
  return null;
}

async function loginSIIPlaywright(page: Page, rutDigitos: string, dv: string, clave: string): Promise<boolean> {
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  try {
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      waitUntil: "networkidle",
      timeout: 30000,
    });

    // Diagnosticar qué inputs existen en la página
    const inputs = await page.evaluate(() =>
      Array.from(document.querySelectorAll("input")).map(el => ({
        name: el.name, id: el.id, type: el.type, visible: el.offsetParent !== null,
      }))
    );
    console.log(`[F29 PW] Inputs en login page:`, JSON.stringify(inputs));

    // Llenar campos visibles por tipo (no por name, porque los con name son hidden)
    const textInputs = await page.$$("input[type='text']:visible, input:not([type]):visible");
    const passwordInputs = await page.$$("input[type='password']:visible");

    console.log(`[F29 PW] Visible text inputs: ${textInputs.length}, password inputs: ${passwordInputs.length}`);

    if (textInputs.length > 0) {
      // El primer campo visible de texto suele ser el RUT
      await textInputs[0].fill(rutConPuntos);
      if (textInputs.length > 1) {
        // Algunos portales tienen campo separado para DV
        await textInputs[1].fill(dv);
      }
    }

    if (passwordInputs.length > 0) {
      await passwordInputs[0].fill(clave);
    }

    // También asegurar los campos hidden via JS (por si acaso)
    await page.evaluate(({ rut, dvVal, rutcntr, claveVal }) => {
      const set = (sel: string, val: string) => {
        const el = document.querySelector<HTMLInputElement>(sel);
        if (el) { el.value = val; el.dispatchEvent(new Event("change", { bubbles: true })); }
      };
      set('[name="rut"]', rut);
      set('[name="dv"]', dvVal);
      set('[name="rutcntr"]', rutcntr);
      set('[name="clave"]', claveVal);
    }, { rut: rutDigitos, dvVal: dv, rutcntr: rutConPuntos, claveVal: clave });

    // Submit
    await page.evaluate(() => {
      const btn = document.querySelector<HTMLElement>('input[type="submit"], button[type="submit"]');
      if (btn) btn.click();
      else (document.querySelector("form") as HTMLFormElement)?.submit();
    });

    await page.waitForTimeout(5000);

    const urlFinal = page.url();
    const cookies = await page.context().cookies();
    const cookieNames = cookies.map(c => c.name);
    console.log(`[F29 PW] URL post-login: ${urlFinal}`);
    console.log(`[F29 PW] Cookies post-login: ${cookieNames.join(", ")}`);

    const hasAuth = cookies.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name === "NETSCAPE_LIVEWIRE");
    if (hasAuth) {
      console.log(`[F29 PW] Login OK para RUT ${rutDigitos}`);
      return true;
    }

    console.error(`[F29 PW] Login falló para RUT ${rutDigitos} — URL: ${urlFinal}`);
    return false;
  } catch (e: any) {
    console.error(`[F29 PW] Error login: ${e.message.substring(0, 150)}`);
    return false;
  }
}

function formatearRutConPuntos(rutDigitos: string): string {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
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
      acceptDownloads: false,
    });
    const page = await context.newPage();

    const loginOk = await loginSIIPlaywright(page, rutDigitos, dv, clave);
    if (!loginOk) {
      await context.close();
      return results;
    }

    for (const period of periods) {
      const f29 = await extraerUnPeriodo(page, rutDigitos, period);
      if (f29) {
        results.set(period, f29);
        console.log(`[F29 PW] OK ${period}: débito=${f29.iva_debito}, total=${f29.total_pagar}`);
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
    console.error("[F29 PW] Error batch:", e.message.substring(0, 200));
  } finally {
    if (browser) await browser.close();
  }

  return results;
}
