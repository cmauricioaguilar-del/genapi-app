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
      if (text.includes('411') || text.includes('TS') || text.includes('code')) {
        console.log('Browser console:', text.substring(0, 200));
      }
    });

    // MutationObserver para detectar si algo setea el campo 411
    await context.addInitScript(() => {
      document.addEventListener('DOMContentLoaded', () => {
        const el = document.getElementById('code');
        if (el) {
          const proto = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
          Object.defineProperty(el, 'value', {
            set(v: string) {
              console.log('[411-setter] valor asignado:', v.substring(0, 80));
              proto.set!.call(this, v);
            },
            get() { return proto.get!.call(this); },
          });
        } else {
          console.log('[411-debug] campo code/411 NO encontrado en DOM');
        }
      });
    });

    // Interceptar scripts de F5 para diagnóstico
    await page.route('**/*.js', async (route: any) => {
      const response = await route.fetch();
      const url = route.request().url();
      const body = await response.text();
      if (body.includes('"411"') || body.includes("'411'") || body.includes('getElementById("code")') || body.includes("getElementById('code')")) {
        console.log('Script F5 con ref a 411:', url.substring(0, 150));
      }
      await route.fulfill({ response });
    });

    await page.route('**CAutInicio.cgi**', async (route: any) => {
      const req = route.request();
      console.log('POST interceptado. Body:', req.postData());
      await route.continue();
    });

    console.log("Playwright Xvfb non-headless: navegando a login SII...");
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      waitUntil: "load",
      timeout: 60000,
    });

    // Diagnóstico post-carga
    const htmlDebug = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script'))
        .map((s: any) => s.src || `(inline ${s.textContent?.length ?? 0} chars)`);
      const fields = Array.from(document.querySelectorAll('input'))
        .map((i: any) => `${i.name}(${i.type})=${(i.value ?? '').substring(0, 30)}`);
      return { scripts, fields };
    });
    console.log('Scripts cargados:', JSON.stringify(htmlDebug.scripts));
    console.log('Campos del form:', JSON.stringify(htmlDebug.fields));

    // Esperar hasta 12s por si F5 puebla el campo asincronamente
    try {
      await page.waitForFunction(() => {
        const el = document.querySelector('input[id="code"]') as HTMLInputElement;
        return el && el.value.length > 0;
      }, { timeout: 12000 });
      console.log('Campo 411 poblado exitosamente!');
    } catch (_) {
      console.log('Campo 411 NO poblado despues de 12s (F5 no ejecuto el challenge)');
    }

    const codeAfterLoad = await page.evaluate(() => {
      return (document.querySelector('input[id="code"]') as HTMLInputElement)?.value || '(vacío)';
    });
    console.log("Campo 411 final:", codeAfterLoad);

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

    // IP publica del contenedor (para diagnóstico de reputación F5)
    try {
      const ipResp = await fetch('https://api.ipify.org?format=json');
      const ipJson = await ipResp.json();
      console.log('IP publica Railway:', ipJson.ip);
    } catch (_) {}

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
