import { decrypt } from "./encryption";

export interface DocumentoSII {
  doc_type: string;
  doc_number: string;
  rut_emisor?: string;
  nombre_emisor?: string;
  rut_receptor?: string;
  nombre_receptor?: string;
  fecha_emision: string;
  monto_neto: number;
  monto_iva: number;
  monto_total: number;
  monto_exento: number;
}

export interface ExtraccionResult {
  ok: boolean;
  ventas?: DocumentoSII[];
  compras?: DocumentoSII[];
  error?: string;
}

function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

function formatearRutConPuntos(rutDigitos: string): string {
  // 76129731 -> 76.129.731
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

async function siFetch(url: string, options: any = {}): Promise<Response> {
  return fetch(url, options);
}

export async function loginSII(rutDigitos: string, dv: string, clave: string): Promise<string | null> {
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  const baseHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  };

  const getResp = await siFetch(
    "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html",
    { headers: baseHeaders }
  );

  const getCookies: string[] = getResp.headers.getSetCookie
    ? getResp.headers.getSetCookie()
    : [];
  const cookieJar = getCookies.map((c: string) => c.split(";")[0]).join("; ");

  await getResp.text();

  const formBody = new URLSearchParams({
    rut: rutDigitos,
    dv,
    referencia: "https://homer.sii.cl/",
    "411": "",
    rutcntr: rutConPuntos,
    clave,
  }).toString();

  // Intentar palena.sii.cl primero (servidor usado por ERPs, sin F5 browser challenge)
  const endpoints = [
    { url: "https://palena.sii.cl/cgi_AUT2000/CAutInicio.cgi", origin: "https://palena.sii.cl", referer: "https://palena.sii.cl/" },
    { url: "https://zeusr.sii.cl/cgi_AUT2000/CAutInicio.cgi", origin: "https://zeusr.sii.cl", referer: "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html" },
  ];

  for (const ep of endpoints) {
    const postResp = await siFetch(ep.url, {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": ep.origin,
        "Referer": ep.referer,
        "Cookie": cookieJar,
      },
      body: formBody,
      redirect: "follow",
    });

    const postCookies: string[] = postResp.headers.getSetCookie ? postResp.headers.getSetCookie() : [];
    const allCookies = [...getCookies, ...postCookies].map((c: string) => c.split(";")[0]);
    const finalCookieStr = allCookies.join("; ");
    const hasToken = allCookies.some((c: string) => c.startsWith("TOKEN=") || c.startsWith("CSESSIONID="));
    const hasLW = allCookies.some((c: string) => c.startsWith("NETSCAPE_LIVEWIRE"));

    if (hasToken || hasLW) {
      return finalCookieStr;
    }

    await postResp.text();
  }

  console.error("SII login failed for RUT", rutDigitos);
  // Fallback con Playwright: maneja sesiones activas y otros bloqueos interactivos
  console.warn(`[SII] Intentando login Playwright para RUT ${rutDigitos}...`);
  return loginSIIConPlaywright(rutDigitos, dv, clave);
}

async function logoutSII(cookies: string): Promise<void> {
  const headers = {
    "Cookie": cookies,
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://zeusr.sii.cl/",
  };
  // Intentar todos los endpoints conocidos de logout del SII
  await Promise.allSettled([
    fetch("https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi", { headers, redirect: "follow" }),
    fetch("https://homer.sii.cl/cgi_AUT2000/autCTermino.cgi", { headers: { ...headers, Referer: "https://homer.sii.cl/" }, redirect: "follow" }),
  ]);
}

async function loginSIIConPlaywright(rutDigitos: string, dv: string, clave: string): Promise<string | null> {
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;
  const { chromium } = await import("playwright");

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

    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      waitUntil: "load", timeout: 30000,
    });
    await page.waitForTimeout(1500);

    const rutField = page.locator('[name="rutcntr"]');
    await rutField.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(rutConPuntos, { delay: 80 });

    const claveField = page.locator('[name="clave"]');
    await claveField.click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(clave, { delay: 80 });

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

    await Promise.all([
      page.waitForNavigation({ timeout: 15000, waitUntil: "domcontentloaded" }).catch(() => {}),
      page.locator('input[type="submit"], button[type="submit"]').first().click().catch(() =>
        page.evaluate(() => (document.querySelector("form") as HTMLFormElement)?.submit())
      ),
    ]);

    await page.waitForTimeout(2000);

    // Detectar página de "sesión ya activa" y cerrar la sesión anterior automáticamente
    const bodyText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
    const urlActual = page.url();
    const sesionActivaDetectada =
      bodyText.toLowerCase().includes("sesión activa") ||
      bodyText.toLowerCase().includes("sesion activa") ||
      bodyText.toLowerCase().includes("ya tiene una") ||
      bodyText.toLowerCase().includes("cierre su sesión") ||
      urlActual.toLowerCase().includes("decissession") ||
      urlActual.toLowerCase().includes("sesion");

    if (sesionActivaDetectada) {
      console.log(`[SII PW] Sesión anterior activa para RUT ${rutDigitos} — cerrando...`);
      const clicked = await page.evaluate(() => {
        const all = Array.from(document.querySelectorAll("input[type=submit], button, a"));
        const btn = all.find(el => {
          const t = ((el.textContent ?? "") + " " + ((el as HTMLInputElement).value ?? "")).toLowerCase();
          return t.includes("aceptar") || t.includes("continuar") || t.includes("cerrar") || t.includes("nueva") || t.includes("ingresar");
        });
        if (btn) { (btn as HTMLElement).click(); return true; }
        return false;
      });
      if (clicked) {
        await page.waitForNavigation({ timeout: 10000, waitUntil: "domcontentloaded" }).catch(() => {});
        await page.waitForTimeout(2000);
      }
    }

    const cookies = await page.context().cookies();
    const hasAuth = cookies.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name.startsWith("NETSCAPE_LIVEWIRE"));

    if (!hasAuth) {
      const finalText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
      console.error(`[SII PW] Login fallido para RUT ${rutDigitos}: ${finalText.substring(0, 200)}`);
      await context.close();
      return null;
    }

    const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join("; ");
    console.log(`[SII PW] Login OK RUT ${rutDigitos}`);
    await context.close();
    return cookieStr;
  } catch (e: any) {
    console.error(`[SII PW] Error login RUT ${rutDigitos}: ${e.message.substring(0, 150)}`);
    return null;
  } finally {
    await browser.close();
  }
}

async function llamarApiRCV(
  cookies: string,
  rutDigitos: string,
  dv: string,
  periodo: string,
  operacion: "COMPRA" | "VENTA"
): Promise<any[]> {
  const tokenMatch = cookies.match(/(?:TOKEN|CSESSIONID)=([^;]+)/);
  const conversationId = tokenMatch ? tokenMatch[1] : "unknown";

  const payload = {
    metaData: {
      namespace: "cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/getResumen",
      conversationId,
      transactionId: crypto.randomUUID(),
      page: null,
    },
    data: {
      rutEmisor: rutDigitos,
      dvEmisor: dv,
      ptributario: periodo,
      estadoContab: "REGISTRO",
      operacion,
      busquedaInicial: true,
    },
  };

  const resp = await siFetch(
    "https://www4.sii.cl/consdcvinternetui/services/data/facadeService/getResumen",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www4.sii.cl",
        "Referer": "https://www4.sii.cl/consdcvinternetui/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "Cookie": cookies,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    console.error(`getResumen HTTP ${resp.status} para ${operacion}`);
    return [];
  }

  const json = await resp.json();

  const tipos = json?.data?.listaResumenDte ?? json?.data?.listaDte ?? json?.data ?? [];
  return Array.isArray(tipos) ? tipos : [];
}

async function llamarApiDetalle(
  cookies: string,
  rutDigitos: string,
  dv: string,
  periodo: string,
  operacion: "COMPRA" | "VENTA",
  tipoDoc: string
): Promise<DocumentoSII[]> {
  // tipoDoc es el código SII conocido (33, 61, etc.) — se usa como fallback si el JSON no lo incluye
  const tokenMatch = cookies.match(/(?:TOKEN|CSESSIONID)=([^;]+)/);
  const conversationId = tokenMatch ? tokenMatch[1] : "unknown";

  const payload = {
    metaData: {
      namespace: `cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/${operacion === "COMPRA" ? "getDetalleCompra" : "getDetalleVenta"}`,
      conversationId,
      transactionId: crypto.randomUUID(),
      page: null,
    },
    data: {
      rutEmisor: rutDigitos,
      dvEmisor: dv,
      ptributario: periodo,
      estadoContab: "REGISTRO",
      operacion,
      codTipoDoc: String(tipoDoc),
      busquedaInicial: true,
    },
  };

  const resp = await siFetch(
    `https://www4.sii.cl/consdcvinternetui/services/data/facadeService/${operacion === "COMPRA" ? "getDetalleCompra" : "getDetalleVenta"}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www4.sii.cl",
        "Referer": "https://www4.sii.cl/consdcvinternetui/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
        "Cookie": cookies,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    const errBody = await resp.text().catch(() => "");
    console.error(`getDetalle HTTP ${resp.status} para ${operacion}/${tipoDoc}: ${errBody.substring(0, 300)}`);
    return [];
  }

  const json = await resp.json();
  return parsearDetalle(json, tipoDoc);
}

function parsearDetalle(json: any, tipoDocFallback = ""): DocumentoSII[] {
  const docs: DocumentoSII[] = [];
  const lista = Array.isArray(json?.data) ? json.data : [];

  for (const r of lista) {
    const rutDoc = r.detRutDoc ? `${r.detRutDoc}-${r.detDvDoc ?? ""}` : "";
    docs.push({
      doc_type: String(r.detTipoDoc ?? r.tipoDoc ?? r.codDoc ?? "") || String(tipoDocFallback),
      doc_number: String(r.detNroDoc ?? r.folio ?? r.nroDoc ?? ""),
      rut_emisor: rutDoc || r.rutEmisor || "",
      nombre_emisor: r.detRznSoc ?? r.razonSocial ?? "",
      rut_receptor: r.rutReceptor ?? "",
      nombre_receptor: r.nombreReceptor ?? "",
      fecha_emision: r.detFchDoc ?? r.fechaDoc ?? "",
      monto_neto: Number(r.detMntNeto ?? r.montoNeto ?? 0),
      monto_iva: Number(r.detMntIVA ?? r.detMntIva ?? r.montoIva ?? 0),
      monto_total: Number(r.detMntTotal ?? r.montoTotal ?? 0),
      monto_exento: Number(r.detMntExe ?? r.montoExento ?? 0),
    });
  }
  return docs;
}

export async function extraerRCV(
  siiRut: string,
  siiClaveEnc: string,
  period: string
): Promise<ExtraccionResult> {
  const clave = decrypt(siiClaveEnc);
  const rutNormalizado = normalizarRut(siiRut);
  const rutDigitos = rutNormalizado.slice(0, -1);
  const dv = rutNormalizado.slice(-1);

  try {
    const cookies = await loginSII(rutDigitos, dv, clave);
    if (!cookies) {
      return { ok: false, error: "No se pudo autenticar en el SII. Verifica las credenciales." };
    }

    const [resumenCompras, resumenVentas] = await Promise.all([
      llamarApiRCV(cookies, rutDigitos, dv, period, "COMPRA"),
      llamarApiRCV(cookies, rutDigitos, dv, period, "VENTA"),
    ]);

    const comprasPromises = resumenCompras.map((tipo: any) =>
      llamarApiDetalle(cookies, rutDigitos, dv, period, "COMPRA", tipo.rsmnTipoDocInteger)
    );
    const ventasPromises = resumenVentas.map((tipo: any) =>
      llamarApiDetalle(cookies, rutDigitos, dv, period, "VENTA", tipo.rsmnTipoDocInteger)
    );

    const [comprasListas, ventasListas] = await Promise.all([
      Promise.all(comprasPromises),
      Promise.all(ventasPromises),
    ]);

    const compras = comprasListas.flat();
    const ventas = ventasListas.flat();

    await logoutSII(cookies);

    return { ok: true, ventas, compras };
  } catch (e: any) {
    console.error("Error extracción SII:", e);
    return { ok: false, error: `Error al conectar con el SII: ${e.message}` };
  }
}

export interface HonorarioSII {
  anio: string;
  mes: string;
  folio: string;
  fecha_emision: string;
  rut_emisor: string;
  nombre_emisor: string;
  monto_bruto: number;
  retencion: number;
  monto_liquido: number;
}

export interface HonorariosResult {
  ok: boolean;
  honorarios?: HonorarioSII[];
  error?: string;
}

export async function extraerHonorarios(siiRut: string, siiClaveEnc: string, anio: string): Promise<HonorariosResult> {
  const clave = decrypt(siiClaveEnc);
  const rutNormalizado = siiRut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  const rutDigitos = rutNormalizado.slice(0, -1);
  const dv = rutNormalizado.slice(-1);

  try {
    const cookies = await loginSII(rutDigitos, dv, clave);
    if (!cookies) return { ok: false, error: "No se pudo autenticar en el SII." };

    const honorarios: HonorarioSII[] = [];
    const meses = ["01","02","03","04","05","06","07","08","09","10","11","12"];

    for (const mes of meses) {
      const url = `https://loa.sii.cl/cgi_IMT/TMBCOC_InformeMensualBheRec.cgi?cbanoinformemensual=${anio}&cbmesinformemensual=${mes}&dv_arrastre=${dv}&pagina_solicitada=0&rut_arrastre=${rutDigitos}`;
      const resp = await siFetch(url, {
        headers: {
          "Cookie": cookies,
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
          "Referer": `https://loa.sii.cl/cgi_IMT/TMBCOC_InformeAnualBheRec.cgi?rut_arrastre=${rutDigitos}&dv_arrastre=${dv}&cbanoinformeanual=${anio}`,
        },
      });
      if (!resp.ok) { console.error(`[honorarios] HTTP ${resp.status} mes=${mes}`); continue; }
      const html = await resp.text();
      honorarios.push(...parsearHonorariosHTML(html, anio, mes));
    }

    await logoutSII(cookies);

    return { ok: true, honorarios };
  } catch (e: any) {
    console.error("Error extracción honorarios SII:", e);
    return { ok: false, error: `Error al conectar con el SII: ${e.message}` };
  }
}

function parsearHonorariosHTML(html: string, anio: string, mes: string): HonorarioSII[] {
  const docs: HonorarioSII[] = [];

  // La página usa document.write() para generar el contenido dinámicamente.
  // Extraemos todos los strings de document.write y los concatenamos para obtener el HTML real.
  const writeRe = /document\.write\('([\s\S]*?)'\)/g;
  let writeMatch: RegExpExecArray | null;
  let virtualHtml = "";
  while ((writeMatch = writeRe.exec(html)) !== null) {
    // Desescapar secuencias JavaScript: \/ → /
    virtualHtml += writeMatch[1].replace(/\\\//g, "/");
  }

  // Buscar scripts inline con contenido (no los externos con src=)
  const inlineRe = /<script(?![^>]*\bsrc\b)[^>]*>([\s\S]*?)<\/script>/gi;
  let inlineMatch: RegExpExecArray | null;
  let lastInline = "";
  while ((inlineMatch = inlineRe.exec(html)) !== null) {
    if (inlineMatch[1].trim().length > 50) lastInline = inlineMatch[1].trim();
  }
  // La data viene en arr_informe_mensual['campo_N'] y CantidadFilas=N
  const cantMatch = html.match(/CantidadFilas\s*=\s*(\d+)/);
  const cant = cantMatch ? parseInt(cantMatch[1], 10) : 0;
  if (cant === 0) return docs;

  const getVal = (key: string): string => {
    const m = html.match(new RegExp(`arr_informe_mensual\\['${key}'\\]\\s*=\\s*(?:formatMiles\\("([^"]+)"[^)]*\\)|"([^"]*)")`))
    return m ? (m[1] ?? m[2] ?? "") : "";
  };

  for (let i = 1; i <= cant; i++) {
    const bruto = parseInt(getVal(`totalhonorarios_${i}`) || "0", 10);
    const liquido = parseInt(getVal(`honorariosliquidos_${i}`) || "0", 10);
    const rut = getVal(`rutemisor_${i}`);
    const dv = getVal(`dvemisor_${i}`);
    docs.push({
      anio, mes,
      folio: getVal(`nroboleta_${i}`),
      fecha_emision: getVal(`fecha_boleta_${i}`),
      rut_emisor: rut && dv ? `${rut}-${dv}` : rut,
      nombre_emisor: getVal(`nombre_emisor_${i}`),
      monto_bruto: bruto,
      retencion: bruto - liquido,
      monto_liquido: liquido,
    });
  }
  return docs;
}

function parseMonto(s: string): number {
  return parseInt(s.replace(/\./g, "").replace(/,/g, "").replace(/[^\d-]/g, "") || "0", 10) || 0;
}
