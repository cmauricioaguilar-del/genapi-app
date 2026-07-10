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

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
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
      (window as any).chrome = { runtime: {} };
    });

    const page = await context.newPage();

    page.on('pageerror', (err: any) => console.log('Page JS exception:', err.message));
    page.on('requestfailed', (req: any) => {
      console.log('Request fallido:', req.url().substring(0, 120), req.failure()?.errorText);
    });
    page.on('console', (msg: any) => {
      const text = msg.text();
      if (text.includes('411') || text.includes('code')) {
        console.log('Browser console:', text.substring(0, 200));
      }
    });

    // Detectar si algo setea el campo 411 desde el browser
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('code') as HTMLInputElement | null;
        if (!el) { console.log('[411] campo NO encontrado'); return; }
        const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
        Object.defineProperty(el, 'value', {
          set(v: string) {
            console.log('[411] valor asignado:', String(v).substring(0, 80));
            proto.set!.call(this, v);
          },
          get() { return proto.get!.call(this); },
        });
      });
    });

    await page.route('**CAutInicio.cgi**', async (route: any) => {
      console.log('POST interceptado. Body:', route.request().postData());
      await route.continue();
    });

    console.log("Playwright Xvfb non-headless: navegando a login SII...");
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      waitUntil: "networkidle",
      timeout: 60000,
    });

    // Esperar hasta 10s por si algo puebla el campo asincronamente
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('input[id="code"]') as HTMLInputElement;
        return el && el.value.length > 0;
      }, { timeout: 10000 });
      console.log('Campo 411 poblado!');
    } catch (_) {
      const val = await page.evaluate(() =>
        (document.querySelector('input[id="code"]') as HTMLInputElement)?.value || '(vacío)'
      );
      console.log('Campo 411 despues de espera:', val);
    }

    await page.waitForSelector('input[name="rutcntr"]', { state: "visible", timeout: 30000 });

    await page.click('input[name="rutcntr"]');
    await page.type('input[name="rutcntr"]', `${rutDigitos}-${dv}`, { delay: 80 });
    await page.press('input[name="rutcntr"]', 'Tab');
    await page.waitForTimeout(500);

    await page.click('input[name="clave"]');
    await page.type('input[name="clave"]', clave, { delay: 80 });
    await page.waitForTimeout(1000);

    const codeBeforeSubmit = await page.evaluate(() => {
      return (document.querySelector('input[id="code"]') as HTMLInputElement)?.value || '(vacío)';
    });
    console.log("Campo 411 antes de submit:", codeBeforeSubmit);

    console.log("Clickeando botón #bt_ingresar...");
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
