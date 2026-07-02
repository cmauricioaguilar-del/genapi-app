import { chromium } from "playwright";
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

export interface F29Data {
  periodo: string;
  iva_debito: number;
  iva_credito: number;
  iva_remanente: number;
  iva_neto: number;
  retencion_honorarios: number;
  ppm: number;
  total_pagar: number;
}

export interface ExtraccionResult {
  ok: boolean;
  ventas?: DocumentoSII[];
  compras?: DocumentoSII[];
  f29?: F29Data;
  error?: string;
}

export function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}

export function formatPeriod(mes: number, anio: number): string {
  return `${anio}${String(mes).padStart(2, "0")}`;
}

export function parseTipoDoc(codigo: string): string {
  const tipos: Record<string, string> = {
    "33": "FACTURA",
    "34": "FACTURA_NO_AFECTA",
    "39": "BOLETA",
    "41": "BOLETA_NO_AFECTA",
    "56": "NOTA_DEBITO",
    "61": "NOTA_CREDITO",
    "46": "LIQUIDACION",
    "52": "GUIA_DESPACHO",
    "110": "FACTURA_EXPORTACION",
    "111": "LIQUIDACION_EXPORTACION",
    "112": "NOTA_DEBITO_EXPORTACION",
  };
  return tipos[codigo] ?? `TIPO_${codigo}`;
}

export async function extraerRCV(
  siiRut: string,
  siiClaveEnc: string,
  period: string
): Promise<ExtraccionResult> {
  const clave = decrypt(siiClaveEnc);
  const anio = period.slice(0, 4);
  const mes = period.slice(4, 6);

  let browser;
  try {
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Login SII
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresaRutClave.html");
    await page.fill("#rut", siiRut.replace("-", ""));
    await page.fill("#clave", clave);
    await page.click("#bt_ingresar");
    await page.waitForNavigation({ timeout: 15000 });

    const url = page.url();
    if (url.includes("IngresaRutClave") || url.includes("error")) {
      return { ok: false, error: "Credenciales SII incorrectas." };
    }

    // Extraer RCV ventas
    const ventasUrl = `https://palena.sii.cl/cgi_dte/UF_SRVCL/CONSULTA_RCV.cgi?RUT_EMP=${normalizarRut(siiRut)}&PERIODO=${anio}${mes}&TIPO=VENTA&FORMATO=JSON`;
    await page.goto(ventasUrl);
    const ventasText = await page.content();

    // Extraer RCV compras
    const comprasUrl = `https://palena.sii.cl/cgi_dte/UF_SRVCL/CONSULTA_RCV.cgi?RUT_EMP=${normalizarRut(siiRut)}&PERIODO=${anio}${mes}&TIPO=COMPRA&FORMATO=JSON`;
    await page.goto(comprasUrl);
    const comprasText = await page.content();

    await browser.close();

    let ventas: DocumentoSII[] = [];
    let compras: DocumentoSII[] = [];

    try { ventas = JSON.parse(ventasText)?.data ?? []; } catch {}
    try { compras = JSON.parse(comprasText)?.data ?? []; } catch {}

    return { ok: true, ventas, compras };
  } catch (e) {
    if (browser) await browser.close();
    console.error("Error extracción SII:", e);
    return { ok: false, error: "Error al conectar con el SII. Intenta más tarde." };
  }
}
