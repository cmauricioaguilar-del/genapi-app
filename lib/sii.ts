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
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  });

  try {
    const context = await browser.newContext({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      locale: "es-419",
    });
    const page = await context.newPage();

    console.log("Playwright: navegando a login SII...");
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", {
      waitUntil: "load",
      timeout: 60000,
    });

    console.log("Página cargada. Título:", await page.title(), "URL:", page.url());

    await page.waitForSelector('input[name="rutcntr"]', { state: "visible", timeout: 30000 });

    // Rellenar campo visible y disparar eventos para que JS de SII procese el RUT
    await page.fill('input[name="rutcntr"]', `${rutDigitos}-${dv}`);
    await page.dispatchEvent('input[name="rutcntr"]', 'change');
    await page.dispatchEvent('input[name="rutcntr"]', 'blur');
    await page.fill('input[name="clave"]', clave);
    await page.dispatchEvent('input[name="clave"]', 'change');

    // Esperar que JS de SII rellene los campos ocultos
    await page.waitForTimeout(1500);

    // Rellenar campos ocultos directamente por si el JS no los llenó
    await page.evaluate((args: { rutDigitos: string; dv: string }) => {
      const rutInput = document.querySelector('input[name="rut"]') as HTMLInputElement;
      const dvInput = document.querySelector('input[name="dv"]') as HTMLInputElement;
      if (rutInput) rutInput.value = args.rutDigitos;
      if (dvInput) dvInput.value = args.dv;
    }, { rutDigitos, dv });

    // Debug: ver estado de campos ocultos y botones disponibles
    const debug = await page.evaluate(() => {
      const rut = (document.querySelector('input[name="rut"]') as HTMLInputElement)?.value;
      const dv = (document.querySelector('input[name="dv"]') as HTMLInputElement)?.value;
      const code = (document.querySelector('input[id="code"]') as HTMLInputElement)?.value;
      const buttons = Array.from(document.querySelectorAll('button, a[onclick], input[type="image"]')).map((b: any) =>
        `${b.tagName}|${b.id}|${b.className}|${b.type || ""}|${(b.textContent || b.value || "").trim().substring(0, 30)}`
      ).join(" /// ");
      return { rut, dv, code, buttons };
    });
    console.log("Debug campos:", JSON.stringify(debug));

    // Intentar hacer click en botón real si existe, si no usar form.submit()
    const clicked = await page.evaluate(() => {
      const btn = document.querySelector('button[type="submit"], button:not([type]), input[type="image"]') as HTMLElement;
      if (btn) { btn.click(); return true; }
      const form = document.querySelector('form') as HTMLFormElement;
      if (form) { form.submit(); return true; }
      return false;
    });
    console.log("Submit ejecutado:", clicked);

    await page.waitForNavigation({ timeout: 60000, waitUntil: "load" }).catch(() => {});

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
