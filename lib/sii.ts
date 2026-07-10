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

async function loginSII(rutDigitos: string, dv: string, clave: string): Promise<string | null> {
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  console.log("HTTP login SII (sin browser, fetch directo)");
  console.log("RUT:", rutConPuntos);

  const baseHeaders: Record<string, string> = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    "Accept-Language": "es-CL,es;q=0.9,en;q=0.8",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  };

  // Paso 1: GET página de login para obtener cookies F5
  const getResp = await siFetch(
    "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html",
    { headers: baseHeaders }
  );

  const getCookies: string[] = getResp.headers.getSetCookie
    ? getResp.headers.getSetCookie()
    : [];
  const cookieJar = getCookies.map((c: string) => c.split(";")[0]).join("; ");
  console.log("GET status:", getResp.status, "| cookies:", getCookies.map((c: string) => c.split("=")[0]).join(","));

  // Ver si el campo 411 viene con valor en el HTML del GET
  const getHtml = await getResp.text();
  const match411 = getHtml.match(/name=.411.[^>]{0,100}/i) || getHtml.match(/id=.code.[^>]{0,100}/i);
  console.log("Campo 411 en HTML GET:", match411?.[0] ?? "no encontrado");
  // Ver inline scripts en el GET para buscar nonce F5
  const inlineScripts = [...getHtml.matchAll(/<script[^>]*>([\s\S]{0,300}?)<\/script>/gi)].map(m => m[1].trim()).filter(Boolean);
  console.log("Inline scripts GET:", inlineScripts.length, "| primeros 200c:", inlineScripts.map(s => s.substring(0, 100)).join(" | "));

  // Paso 2: POST formulario de login (igual que el browser)
  const formBody = new URLSearchParams({
    rut: rutDigitos,
    dv,
    referencia: "http://www.sii.cl",
    "411": "",
    rutcntr: rutConPuntos,
    clave,
  }).toString();

  const postResp = await siFetch(
    "https://zeusr.sii.cl/cgi_AUT2000/CAutInicio.cgi",
    {
      method: "POST",
      headers: {
        ...baseHeaders,
        "Content-Type": "application/x-www-form-urlencoded",
        "Origin": "https://zeusr.sii.cl",
        "Referer": "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html",
        "Cookie": cookieJar,
      },
      body: formBody,
      redirect: "follow",
    }
  );

  const postCookies: string[] = postResp.headers.getSetCookie
    ? postResp.headers.getSetCookie()
    : [];
  const allCookies = [...getCookies, ...postCookies].map((c: string) => c.split(";")[0]);
  const finalCookieStr = allCookies.join("; ");

  const hasToken = allCookies.some((c: string) => c.startsWith("TOKEN=") || c.startsWith("CSESSIONID="));
  const hasLW = allCookies.some((c: string) => c.startsWith("NETSCAPE_LIVEWIRE"));

  console.log("POST status:", postResp.status, "| final URL:", postResp.url);
  console.log("Cookies: TOKEN=", hasToken, "LIVEWIRE=", hasLW, "| nombres:", allCookies.map((c: string) => c.split("=")[0]).join(","));

  if (!hasToken && !hasLW) {
    const html = await postResp.text();
    const texto = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    console.error("Login fallido. Respuesta SII:", texto.substring(0, 600));
    return null;
  }

  console.log("Login exitoso. Cookies obtenidas.");
  return finalCookieStr;
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
  console.log(`getResumen ${operacion}:`, JSON.stringify(json).substring(0, 300));

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

  const resp = await siFetch(
    "https://www4.sii.cl/consdcvinternetui/services/data/facadeService/getDetalleDocumentos",
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
