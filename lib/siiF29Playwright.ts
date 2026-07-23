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
    // Interceptar todas las respuestas de red para descubrir APIs del GWT
    const capturedResponses: { url: string; body: string }[] = [];
    page.on("response", async (response) => {
      const url = response.url();
      // Ignorar assets estáticos
      if (/\.(js|css|gif|png|jpg|ico|woff|ttf)(\?|$)/i.test(url)) return;
      if (url.includes("ruxitagent")) return;
      try {
        const body = await response.text().catch(() => "");
        if (body.length > 20) {
          capturedResponses.push({ url, body: body.substring(0, 1000) });
        }
      } catch {}
    });

    await page.goto("https://www4.sii.cl/sifmConsultaInternet/internet.html", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await page.waitForTimeout(15000); // dar tiempo al GWT para cargar y hacer llamadas

    console.log(`[F29 PW] Respuestas de red capturadas: ${capturedResponses.length}`);
    for (const r of capturedResponses) {
      console.log(`[F29 PW] NET URL: ${r.url}`);
      if (r.body.includes("folio") || r.body.includes("codInt") || r.body.includes("F29") || r.body.includes("29")) {
        console.log(`[F29 PW] NET BODY: ${r.body.substring(0, 500)}`);
      }
    }

    // Intentar llamadas directas a APIs conocidas del SII con fetch autenticado
    const apisAProbar = [
      `https://www4.sii.cl/sifmConsultaInternet/ConsultaIntegral?rut=${rutDigitos}&form=29&anio=${anio}`,
      `https://www4.sii.cl/sifmConsultaInternet/ObtenerDeclaraciones?rut=${rutDigitos}&form=29&anio=${anio}`,
      `https://www4.sii.cl/sifmConsultaInternet/internet.html?rut=${rutDigitos}&form=29&anio=${anio}`,
      `https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29&anio=${anio}`,
    ];

    for (const apiUrl of apisAProbar) {
      const resp = await page.evaluate(async (url) => {
        try {
          const r = await fetch(url, { credentials: "include" });
          return { status: r.status, url: r.url, body: await r.text() };
        } catch (e: any) { return { status: 0, url, body: e.message }; }
      }, apiUrl);
      console.log(`[F29 PW] API ${apiUrl} → ${resp.status} (${resp.body.length} chars)`);
      if (resp.body.includes("folio") || resp.body.includes("codInt")) {
        console.log(`[F29 PW] API con folios: ${resp.body.substring(0, 500)}`);
      }
    }

  } catch (e: any) {
    console.error(`[F29 PW] Error obtenerFolios: ${e.message.substring(0, 200)}`);
  }

  console.log(`[F29 PW] Folios encontrados para ${anio}: ${result.size}`);
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
