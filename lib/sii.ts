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

async function loginSII(rutDigitos: string, dv: string, clave: string): Promise<string | null> {
  const { chromium } = require("playwright");

  const proxyUrl = process.env.PROXY_URL;
  let proxyConfig: { server: string; username?: string; password?: string } | undefined;
  if (proxyUrl) {
    const u = new URL(proxyUrl);
    proxyConfig = {
      server: `${u.protocol}//${u.host}`,
      username: u.username || undefined,
      password: u.password || undefined,
    };
    console.log('Usando proxy:', `${u.protocol}//${u.host}`, 'user:', u.username || '(none)');
  } else {
    console.log('Sin proxy configurado (PROXY_URL no definida)');
  }

  const browser = await chromium.launch({
    headless: false,
    proxy: proxyConfig,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--disable-blink-features=AutomationControlled",
    ],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      locale: "es-419",
      viewport: { width: 1280, height: 720 },
    });

    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      (window as any).chrome = { runtime: {}, app: {}, csi: () => {}, loadTimes: () => {} };
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
      Object.defineProperty(navigator, 'languages', { get: () => ['es-CL', 'es', 'en'] });
    });

    const page = await context.newPage();

    page.on('pageerror', (err: any) => console.log('Page JS exception:', err.message));
    page.on('requestfailed', (req: any) => {
      console.log('Request fallido:', req.url().substring(0, 120), req.failure()?.errorText);
    });

    await page.route('**CAutInicio.cgi**', async (route: any) => {
      console.log('POST body:', route.request().postData());
      await route.continue();
    });

    console.log("Navegando a login SII...");
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Diagnosticar qué scripts cargó F5 y el valor inicial del campo 411
    const diag = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script[src]')).map((s: any) => s.src);
      const inlines = Array.from(document.querySelectorAll('script:not([src])')).map((s: any) =>
        (s.textContent || '').substring(0, 400)
      );
      const f = document.querySelector('input[id="code"], input[name="411"]') as HTMLInputElement | null;
      const webdriver = (navigator as any).webdriver;
      return {
        scripts,
        inlines,
        field411: f ? `val="${f.value}" type="${f.type}"` : 'NO ENCONTRADO',
        webdriver,
      };
    });
    console.log('Scripts externos:', JSON.stringify(diag.scripts));
    console.log('navigator.webdriver:', diag.webdriver);
    console.log('Campo 411 inicial:', diag.field411);
    for (let i = 0; i < diag.inlines.length; i++) {
      const s = diag.inlines[i];
      if (s.includes('411') || s.includes('code') || s.includes('TS') || s.includes('challenge')) {
        console.log(`Inline[${i}] (relevante):`, s.substring(0, 500));
      } else {
        console.log(`Inline[${i}]:`, s.substring(0, 80));
      }
    }

    // Esperar hasta 30s a que F5 pueble el campo
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('input[id="code"], input[name="411"]') as HTMLInputElement;
        return el && el.value.length > 0;
      }, { timeout: 30000 });
      const val = await page.evaluate(() => (document.querySelector('input[id="code"]') as HTMLInputElement)?.value);
      console.log('Campo 411 poblado:', val?.substring(0, 50));
    } catch (_) {
      console.log('Campo 411 sigue vacío después de 30s');
    }

    await page.waitForSelector('input[name="rutcntr"]', { state: "visible", timeout: 30000 });
    await page.click('input[name="rutcntr"]');
    await page.type('input[name="rutcntr"]', `${rutDigitos}-${dv}`, { delay: 80 });
    await page.press('input[name="rutcntr"]', 'Tab');
    await page.waitForTimeout(500);
    await page.click('input[name="clave"]');
    await page.type('input[name="clave"]', clave, { delay: 80 });
    await page.waitForTimeout(1000);

    console.log("Clickeando #bt_ingresar...");
    await Promise.all([
      page.waitForNavigation({ timeout: 60000, waitUntil: "load" }).catch(() => {}),
      page.click('#bt_ingresar'),
    ]);

    console.log("Post-login URL:", page.url());
    const cookies = await context.cookies();
    const cookieHeader = cookies.map((c: any) => `${c.name}=${c.value}`).join("; ");
    const hasToken = cookies.some((c: any) => c.name === "TOKEN" || c.name === "CSESSIONID");
    const hasLW = cookies.some((c: any) => c.name.startsWith("NETSCAPE_LIVEWIRE"));
    console.log("Login resultado: TOKEN=", hasToken, "LIVEWIRE=", hasLW,
      "keys=", cookies.map((c: any) => c.name).join(","));

    if (!hasToken && !hasLW) {
      const html = await page.content();
      const errMatch = html.match(/class="[^"]*error[^"]*"[^>]*>([\s\S]{0,300})/i);
      const errMsg = errMatch ? errMatch[1].replace(/<[^>]+>/g, "").trim() : "Sin cookies de sesión";
      console.error("Login SII sin cookies. Error:", errMsg);
      return null;
    }

    return cookieHeader;
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

  const resp = await fetch(
    "https://www4.sii.cl/consdcvinternetui/services/data/facadeService/getResumen",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www4.sii.cl",
        "Referer": "https://www4.sii.cl/consdcvinternetui/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
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
  console.log(`getResumen ${operacion} respuesta:`, JSON.stringify(json).substring(0, 300));

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
  const tokenMatch = cookies.match(/(?:TOKEN|CSESSIONID)=([^;]+)/);
  const conversationId = tokenMatch ? tokenMatch[1] : "unknown";

  const payload = {
    metaData: {
      namespace: "cl.sii.sdi.lob.diii.consdcv.data.api.interfaces.FacadeService/getDetalleDocumentos",
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
      tipoDocumento: tipoDoc,
      busquedaInicial: true,
    },
  };

  const resp = await fetch(
    "https://www4.sii.cl/consdcvinternetui/services/data/facadeService/getDetalleDocumentos",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json, text/plain, */*",
        "Origin": "https://www4.sii.cl",
        "Referer": "https://www4.sii.cl/consdcvinternetui/",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
        "Cookie": cookies,
      },
      body: JSON.stringify(payload),
    }
  );

  if (!resp.ok) {
    console.error(`getDetalle HTTP ${resp.status} para ${operacion}/${tipoDoc}`);
    return [];
  }

  const json = await resp.json();
  return parsearDetalle(json);
}

function parsearDetalle(json: any): DocumentoSII[] {
  const docs: DocumentoSII[] = [];
  const lista =
    json?.data?.listaDte ??
    json?.data?.listaDetalleDte ??
    json?.data?.detalle ??
    json?.data ?? [];

  if (!Array.isArray(lista)) return docs;

  for (const r of lista) {
    docs.push({
      doc_type: String(r.tipoDoc ?? r.codDoc ?? r.tipo ?? r.tipoDte ?? ""),
      doc_number: String(r.folio ?? r.nroDoc ?? r.numero ?? ""),
      rut_emisor: r.rutEmisor ?? r.rutDoc ?? "",
      nombre_emisor: r.razonSocial ?? r.nombreEmisor ?? r.rznSoc ?? "",
      rut_receptor: r.rutReceptor ?? "",
      nombre_receptor: r.nombreReceptor ?? "",
      fecha_emision: r.fechaDoc ?? r.fecha ?? r.fchDoc ?? "",
      monto_neto: Number(r.montoNeto ?? r.neto ?? r.mntNeto ?? 0),
      monto_iva: Number(r.montoIva ?? r.iva ?? r.mntIva ?? 0),
      monto_total: Number(r.montoTotal ?? r.total ?? r.mntTotal ?? 0),
      monto_exento: Number(r.montoExento ?? r.exento ?? r.mntExe ?? 0),
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
    console.log("Iniciando login SII...");
    const cookies = await loginSII(rutDigitos, dv, clave);
    if (!cookies) {
      return { ok: false, error: "No se pudo autenticar en el SII. Verifica las credenciales." };
    }
    console.log("Login exitoso. Cookies obtenidas.");

    const [resumenCompras, resumenVentas] = await Promise.all([
      llamarApiRCV(cookies, rutDigitos, dv, period, "COMPRA"),
      llamarApiRCV(cookies, rutDigitos, dv, period, "VENTA"),
    ]);

    const comprasPromises = resumenCompras.map((tipo: any) =>
      llamarApiDetalle(cookies, rutDigitos, dv, period, "COMPRA", tipo.tipoDoc ?? tipo.codDoc ?? tipo.tipo)
    );
    const ventasPromises = resumenVentas.map((tipo: any) =>
      llamarApiDetalle(cookies, rutDigitos, dv, period, "VENTA", tipo.tipoDoc ?? tipo.codDoc ?? tipo.tipo)
    );

    const [comprasListas, ventasListas] = await Promise.all([
      Promise.all(comprasPromises),
      Promise.all(ventasPromises),
    ]);

    const compras = comprasListas.flat();
    const ventas = ventasListas.flat();

    console.log(`Extracción completa: ${compras.length} compras, ${ventas.length} ventas`);

    return { ok: true, ventas, compras };
  } catch (e: any) {
    console.error("Error extracción SII:", e);
    return { ok: false, error: `Error al conectar con el SII: ${e.message}` };
  }
}
