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

function mergeCookies(existing: Map<string, string>, setCookieHeaders: string[]): void {
  for (const header of setCookieHeaders) {
    const kv = header.split(";")[0].trim();
    const eqIdx = kv.indexOf("=");
    if (eqIdx === -1) continue;
    const name = kv.slice(0, eqIdx);
    existing.set(name, kv);
  }
}

function cookieMapToHeader(map: Map<string, string>): string {
  return Array.from(map.values()).join("; ");
}

async function loginSII(rutDigitos: string, dv: string, clave: string): Promise<string | null> {
  const jar = new Map<string, string>();
  const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36";

  // Paso 1: GET página de login para obtener cookies F5 (TS*) y campos ocultos del form
  const p1 = await fetch(
    "https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html",
    {
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-419,es;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    }
  );
  mergeCookies(jar, p1.headers.getSetCookie?.() ?? []);
  const html1 = await p1.text();
  console.log("Login paso1 status:", p1.status, "cookies:", jar.size);

  // Extraer campos ocultos del formulario
  const hiddenFields: Record<string, string> = {};
  const inputRegex = /<input[^>]+type=["']hidden["'][^>]*>/gi;
  const nameRegex = /name=["']([^"']+)["']/i;
  const valueRegex = /value=["']([^"']*)["']/i;
  let match;
  while ((match = inputRegex.exec(html1)) !== null) {
    const nameMatch = nameRegex.exec(match[0]);
    const valueMatch = valueRegex.exec(match[0]);
    if (nameMatch) hiddenFields[nameMatch[1]] = valueMatch ? valueMatch[1] : "";
  }
  console.log("Campos ocultos encontrados:", Object.keys(hiddenFields).join(","));

  // Paso 2: POST login con todos los campos del formulario
  const formData = new URLSearchParams({
    ...hiddenFields,
    rutcntr: `${rutDigitos}-${dv}`,
    rut: rutDigitos,
    dv: dv,
    clave: clave,
    referencia: "https://www.sii.cl",
  });

  const p2 = await fetch(
    "https://zeusr.sii.cl/cgi_AUT2000/CAutInicio.cgi",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Referer": "https://zeusr.sii.cl//AUT2000/InicioAutenticacion/IngresoRutClave.html",
        "Origin": "https://zeusr.sii.cl",
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "es-419,es;q=0.9",
        "Cookie": cookieMapToHeader(jar),
      },
      body: formData.toString(),
      redirect: "manual",
    }
  );
  mergeCookies(jar, p2.headers.getSetCookie?.() ?? []);
  console.log("Login paso2 status:", p2.status, "location:", p2.headers.get("location"), "cookies:", jar.size);

  if (p2.status === 302 || p2.status === 301) {
    let location = p2.headers.get("location") ?? "";
    if (location && !location.startsWith("http")) {
      location = "https://zeusr.sii.cl" + location;
    }
    if (location) {
      const p3 = await fetch(location, {
        headers: {
          "User-Agent": UA,
          "Accept": "text/html,application/xhtml+xml,*/*",
          "Cookie": cookieMapToHeader(jar),
        },
        redirect: "manual",
      });
      mergeCookies(jar, p3.headers.getSetCookie?.() ?? []);
      console.log("Login paso3 status:", p3.status, "cookies:", jar.size);

      if (p3.status === 302 || p3.status === 301) {
        let loc2 = p3.headers.get("location") ?? "";
        if (loc2 && !loc2.startsWith("http")) loc2 = "https://zeusr.sii.cl" + loc2;
        if (loc2) {
          const p4 = await fetch(loc2, {
            headers: { "User-Agent": UA, "Accept": "text/html,*/*", "Cookie": cookieMapToHeader(jar) },
            redirect: "manual",
          });
          mergeCookies(jar, p4.headers.getSetCookie?.() ?? []);
          console.log("Login paso4 status:", p4.status, "cookies:", jar.size);
        }
      }
    }
  } else {
    const html = await p2.text();
    const errMatch = html.match(/class="[^"]*error[^"]*"[^>]*>([\s\S]{0,300})/i)
      ?? html.match(/<b>([\s\S]{0,200})<\/b>/i)
      ?? html.match(/<p>([\s\S]{0,200})<\/p>/i);
    const errMsg = errMatch ? errMatch[1].replace(/<[^>]+>/g, "").trim() : html.substring(0, 500);
    console.error("Login SII error:", errMsg);
    return null;
  }

  const hasToken = jar.has("TOKEN") || jar.has("CSESSIONID");
  const hasLW = jar.has("NETSCAPE_LIVEWIRE.rut") || [...jar.keys()].some(k => k.startsWith("NETSCAPE_LIVEWIRE"));
  console.log("Login resultado: TOKEN=", hasToken, "LIVEWIRE=", hasLW, "keys=", [...jar.keys()].join(","));

  if (!hasToken && !hasLW) {
    console.error("Login SII: no se obtuvieron cookies de sesión");
    return null;
  }

  return cookieMapToHeader(jar);
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