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
  return null;
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
  return parsearDetalle(json);
}

function parsearDetalle(json: any): DocumentoSII[] {
  const docs: DocumentoSII[] = [];
  const lista = Array.isArray(json?.data) ? json.data : [];

  for (const r of lista) {
    const rutDoc = r.detRutDoc ? `${r.detRutDoc}-${r.detDvDoc ?? ""}` : "";
    docs.push({
      doc_type: String(r.detTipoDoc ?? r.tipoDoc ?? r.codDoc ?? ""),
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


    siFetch("https://homer.sii.cl/cgi_AUT2000/autCTermino.cgi", {
      headers: { "Cookie": cookies, "Referer": "https://homer.sii.cl/" },
    }).catch(() => {});

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
      // Loguear fragmento con la tabla de datos
      const tableIdx = html.search(/<table/i);
      const tableSnippet = tableIdx >= 0 ? html.slice(tableIdx, tableIdx + 800).replace(/\s+/g, " ") : "NO-TABLE";
      console.log(`[honorarios] mes=${mes} html_len=${html.length} table=${tableSnippet}`);
      const found = parsearHonorariosHTML(html, anio, mes);
      console.log(`[honorarios] mes=${mes} registros=${found.length}`);
      honorarios.push(...found);
    }

    return { ok: true, honorarios };
  } catch (e: any) {
    console.error("Error extracción honorarios SII:", e);
    return { ok: false, error: `Error al conectar con el SII: ${e.message}` };
  }
}

function parsearHonorariosHTML(html: string, anio: string, mes: string): HonorarioSII[] {
  const docs: HonorarioSII[] = [];
  const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch: RegExpExecArray | null;

  while ((rowMatch = rowRegex.exec(html)) !== null) {
    const cells: string[] = [];
    const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let cellMatch: RegExpExecArray | null;
    while ((cellMatch = cellRe.exec(rowMatch[1])) !== null) {
      cells.push(cellMatch[1].replace(/<[^>]+>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").trim());
    }
    if (cells.length < 8) continue;

    // La tabla SII tiene: Ver | N° | Estado | Fecha | Rut | Nombre | Soc.Prof. | Brutos | Retenido | Pagado | Observar
    // cells[0]=Ver(link), cells[1]=N°folio, cells[2]=Estado, cells[3]=Fecha,
    // cells[4]=Rut, cells[5]=Nombre, cells[6]=Soc.Prof., cells[7]=Brutos, cells[8]=Retenido, cells[9]=Pagado
    const folio = cells[1].replace(/\./g, "").replace(/,/g, "").trim();
    if (!/^\d+$/.test(folio)) continue;
    docs.push({
      anio, mes, folio,
      fecha_emision: cells[3] ?? "",
      rut_emisor: cells[4] ?? "",
      nombre_emisor: cells[5] ?? "",
      monto_bruto: parseMonto(cells[7] ?? "0"),
      retencion: parseMonto(cells[8] ?? "0"),
      monto_liquido: parseMonto(cells[9] ?? "0"),
    });
  }
  return docs;
}

function parseMonto(s: string): number {
  return parseInt(s.replace(/\./g, "").replace(/,/g, "").replace(/[^\d-]/g, "") || "0", 10) || 0;
}
