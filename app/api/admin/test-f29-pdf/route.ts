import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { chromium } from "playwright";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

function normalizarRut(rut: string): string {
  return rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
}
function formatearRutConPuntos(rutDigitos: string): string {
  const len = rutDigitos.length;
  if (len <= 3) return rutDigitos;
  if (len <= 6) return rutDigitos.slice(0, len - 3) + "." + rutDigitos.slice(len - 3);
  return rutDigitos.slice(0, len - 6) + "." + rutDigitos.slice(len - 6, len - 3) + "." + rutDigitos.slice(len - 3);
}

// Parsea el string table de una respuesta GWT-RPC //OK[..., [...strings...]]
// Retorna todos los strings del string table y los números del array principal
function parsearGwtRpc(body: string): { strings: string[]; numeros: number[] } {
  try {
    // Extraer todos los strings entre comillas del cuerpo GWT-RPC
    const strings: string[] = [];
    const re = /"((?:[^"\\]|\\.)*)"/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) {
      strings.push(m[1]);
    }
    // Extraer números del array principal (antes del string table)
    const numeros: number[] = [];
    const numRe = /\b(\d+)\b/g;
    while ((m = numRe.exec(body)) !== null) {
      numeros.push(parseInt(m[1], 10));
    }
    return { strings, numeros };
  } catch {
    return { strings: [], numeros: [] };
  }
}

// Extrae posibles folios y períodos del string table GWT
function extraerFoliosPorPeriodo(strings: string[]): Map<string, { folio: string; codInt: string }> {
  const result = new Map<string, { folio: string; codInt: string }>();

  // Buscar strings que parezcan períodos YYYYMM (ej: "202601", "202501")
  // y strings que parezcan folios (números de 8-12 dígitos)
  const periodos = strings.filter(s => /^20\d{2}(0[1-9]|1[0-2])$/.test(s));
  const folios = strings.filter(s => /^\d{8,12}$/.test(s));

  console.log(`[F29 GWT] Períodos encontrados en string table: ${JSON.stringify(periodos)}`);
  console.log(`[F29 GWT] Posibles folios: ${JSON.stringify(folios)}`);

  // Intentar asociar cada período con un folio buscando proximidad en el string table
  for (const periodo of periodos) {
    const idxPeriodo = strings.indexOf(periodo);
    // Buscar folio cercano (±5 posiciones)
    let folio = "";
    let codInt = "";
    for (let offset = -5; offset <= 5; offset++) {
      const candidate = strings[idxPeriodo + offset];
      if (candidate && /^\d{8,12}$/.test(candidate) && candidate !== periodo) {
        if (!folio) folio = candidate;
      }
      if (candidate && /^[A-Z0-9]{1,10}$/.test(candidate) && candidate !== periodo && candidate !== folio) {
        if (!codInt) codInt = candidate;
      }
    }
    if (folio) {
      result.set(periodo, { folio, codInt });
      console.log(`[F29 GWT] Período ${periodo} → folio=${folio} codInt=${codInt}`);
    }
  }

  return result;
}

export async function GET(req: NextRequest) {
  const secret = req.nextUrl.searchParams.get("secret");
  if (secret !== (process.env.CRON_SECRET ?? "")) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const empresaId = req.nextUrl.searchParams.get("empresaId");
  const period = req.nextUrl.searchParams.get("period") ?? "202601";
  if (!empresaId) return NextResponse.json({ error: "empresaId requerido." }, { status: 400 });

  const empresa = await prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { nombre: true, siiRut: true, siiClaveEnc: true },
  });
  if (!empresa) return NextResponse.json({ error: "Empresa no encontrada." }, { status: 404 });

  const clave = decrypt(empresa.siiClaveEnc);
  const rutNorm = normalizarRut(empresa.siiRut);
  const rutDigitos = rutNorm.slice(0, -1);
  const dv = rutNorm.slice(-1);
  const rutConPuntos = formatearRutConPuntos(rutDigitos) + "-" + dv;

  const resultado: Record<string, any> = { empresa: empresa.nombre, period };

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

    // 1. LOGIN
    await page.goto("https://zeusr.sii.cl/AUT2000/InicioAutenticacion/IngresoRutClave.html", { waitUntil: "load", timeout: 30000 });
    await page.waitForTimeout(1500);
    await page.locator('[name="rutcntr"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(rutConPuntos, { delay: 80 });
    await page.locator('[name="clave"]').click();
    await page.keyboard.press("Control+a");
    await page.keyboard.type(clave, { delay: 80 });
    await page.evaluate(({ rut, dv }: { rut: string; dv: string }) => {
      const set = (name: string, val: string) => {
        const el = document.querySelector(`[name="${name}"]`) as HTMLInputElement | null;
        if (el) el.value = val;
      };
      set("rut", rut); set("dv", dv); set("referencia", "https://homer.sii.cl/"); set("411", "");
    }, { rut: rutDigitos, dv });
    await page.waitForTimeout(500);
    await Promise.all([
      page.waitForNavigation({ timeout: 15000, waitUntil: "domcontentloaded" }).catch(() => {}),
      page.locator('input[type="submit"], button[type="submit"]').first().click().catch(() =>
        page.evaluate(() => (document.querySelector("form") as HTMLFormElement)?.submit())
      ),
    ]);
    await page.waitForTimeout(3000);

    const cookies = await page.context().cookies();
    const loginOk = cookies.some(c => c.name === "TOKEN" || c.name === "CSESSIONID" || c.name.startsWith("NETSCAPE_LIVEWIRE"));
    resultado.login_ok = loginOk;
    if (!loginOk) {
      await context.close();
      return NextResponse.json({ ...resultado, error: "Login fallido" });
    }

    // 2. NAVEGAR A CONSULTA INTEGRAL — capturar respuesta COMPLETA de svcConsultaInt
    // Capturar TODAS las respuestas GWT para diagnóstico
    const todasGwt: { url: string; len: number; body: string }[] = [];
    let gwtBody = "";
    const gwtHandler = async (response: import("playwright").Response) => {
      const url = response.url();
      if (!url.includes("sii.cl")) return;
      if (/\.(js|css|gif|png|jpg|ico|woff|svg)(\?|$)/i.test(url)) return;
      try {
        const body = await response.text().catch(() => "");
        if (body.startsWith("//OK")) {
          todasGwt.push({ url, len: body.length, body: body.slice(0, 300) });
          // Solo sobrescribir con svcConsultaInt (el más largo, con los F29)
          if (url.includes("svcConsultaInt")) {
            gwtBody = body;
            console.log(`[F29 GWT] svcConsultaInt capturado len=${body.length}`);
          }
        }
      } catch {}
    };
    page.on("response", gwtHandler);

    await page.goto("https://www4.sii.cl/sifmConsultaInternet/index.html?dest=cifxx&form=29", {
      waitUntil: "domcontentloaded", timeout: 30000,
    });
    await page.waitForTimeout(12000);
    page.off("response", gwtHandler);

    resultado.todas_gwt_responses = todasGwt.map(r => ({ url: r.url, len: r.len, sample: r.body.slice(0, 150) }));

    resultado.gwt_body_len = gwtBody.length;
    resultado.gwt_body_sample = gwtBody.slice(0, 500);

    // 3. CLICK EN "5" PARA EXPANDIR EL AÑO Y CAPTURAR NAVEGACIÓN A rfiInternet
    // Interceptar cualquier request a rfiInternet para capturar folio+codInt
    const rfiUrls: string[] = [];
    await page.route("**/*rfiInternet*", async (route) => {
      const url = route.request().url();
      rfiUrls.push(url);
      console.log(`[F29 RFI] Interceptado: ${url}`);
      await route.continue();
    });

    // Click en el número de declaraciones del año (el "5" bajo 2026)
    const clickedNum = await page.evaluate(() => {
      const tds = Array.from(document.querySelectorAll("td, a"));
      const numEl = tds.find(el => {
        const t = el.textContent?.trim() ?? "";
        return /^\d+$/.test(t) && parseInt(t) > 0 && parseInt(t) < 20;
      });
      if (numEl) { (numEl as HTMLElement).click(); return numEl.textContent?.trim(); }
      return null;
    });
    resultado.click_num = clickedNum;

    // Usar mouse.click con coordenadas reales (GWT no responde a evaluate().click())
    const posNum = await page.evaluate(() => {
      const tds = Array.from(document.querySelectorAll("td, a, span"));
      const numEl = tds.find(el => {
        const t = el.textContent?.trim() ?? "";
        return /^\d+$/.test(t) && parseInt(t) > 0 && parseInt(t) < 20;
      });
      if (numEl) {
        const rect = numEl.getBoundingClientRect();
        return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, text: numEl.textContent?.trim() };
      }
      return null;
    });
    resultado.pos_num = posNum;
    if (posNum) {
      await page.mouse.click(posNum.x, posNum.y);
      console.log(`[F29] mouse.click en (${posNum.x}, ${posNum.y}) texto="${posNum.text}"`);
    }

    // Esperar más tiempo para que GWT re-renderice la tabla de meses
    await page.waitForTimeout(10000);

    // Dump DOM del frame principal para diagnóstico (completo, hasta 3000 chars)
    const domPrincipal = await page.evaluate(() => document.body?.innerHTML?.slice(0, 3000) ?? "").catch(() => "");
    resultado.dom_principal_post_click = domPrincipal;

    // Dump todos los textos visibles para ver qué hay en pantalla
    const textos = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("td, a, span, div, button"));
      return all.map(el => el.textContent?.trim() ?? "").filter(t => t.length > 0 && t.length < 50).slice(0, 100);
    }).catch(() => []);
    resultado.textos_visibles = textos;

    // Buscar "Enero" en TODOS los frames (GWT puede renderizar en iframes)
    const frames = page.frames();
    resultado.frames_count = frames.length;
    resultado.frames_urls = frames.map(f => f.url());

    // Buscar meses en todos los frames — también buscar variantes
    const mesesBuscar = ["enero", "ene", "january", "01/2026", "2026-01"];
    let clickedEnero: string | null = null;
    for (const frame of frames) {
      try {
        const found = await frame.evaluate((meses: string[]) => {
          const all = Array.from(document.querySelectorAll("a, td, span, div"));
          const el = all.find(e => {
            const t = e.textContent?.trim().toLowerCase() ?? "";
            return meses.some(m => t === m || t.startsWith(m));
          });
          if (!el) return null;
          const row = el.closest("tr");
          if (row) {
            const links = Array.from(row.querySelectorAll("a[href], td[onclick], span[onclick]"));
            for (const link of links) {
              const href = (link as HTMLAnchorElement).href ?? "";
              const onclick = link.getAttribute("onclick") ?? "";
              if (href.includes("rfi") || href.includes("sifm") || onclick) {
                (link as HTMLElement).click();
                return `clicked_link:${href || onclick}`;
              }
            }
            const cells = Array.from(row.querySelectorAll("td"));
            const secondCell = cells[1];
            if (secondCell) { (secondCell as HTMLElement).click(); return `clicked_cell_col2`; }
          }
          (el as HTMLElement).click();
          return `clicked_el:${el.tagName}:${el.textContent?.trim().slice(0, 30)}`;
        }, mesesBuscar);
        if (found) { clickedEnero = found; break; }
      } catch {}
    }
    resultado.click_enero = clickedEnero;
    await page.waitForTimeout(6000);

    resultado.rfi_urls_after_enero = rfiUrls.slice();

    // Si GWT navegó a rfiInternet, extraer folio+codInt de la URL
    let folioCapturado = "";
    let codIntCapturado = "";
    for (const url of rfiUrls) {
      const folioM = url.match(/[?&]folio=(\d+)/i);
      const codIntM = url.match(/[?&]codInt=([^&]+)/i);
      if (folioM) { folioCapturado = folioM[1]; codIntCapturado = codIntM?.[1] ?? ""; break; }
    }
    resultado.folio_capturado = folioCapturado;
    resultado.codInt_capturado = codIntCapturado;

    // Buscar "Formulario Compacto" en todos los frames y hacer click
    if (!folioCapturado) {
      // Si no navegó a rfiInternet, buscar el botón en la página actual
      for (const frame of page.frames()) {
        try {
          const clickedFC = await frame.evaluate(() => {
            const btns = Array.from(document.querySelectorAll("a, button, input"));
            const btn = btns.find(el => {
              const t = ((el as HTMLInputElement).value ?? el.textContent ?? "").toLowerCase();
              return t.includes("compacto");
            });
            if (btn) {
              (btn as HTMLElement).click();
              return (btn as HTMLAnchorElement).href || (btn as HTMLInputElement).value || "clicked";
            }
            return null;
          });
          if (clickedFC) { resultado.click_form_compacto = clickedFC; break; }
        } catch {}
      }
      await page.waitForTimeout(5000);
      resultado.rfi_urls_after_compacto = rfiUrls.slice();
      // Intentar capturar folio de la nueva navegación
      for (const url of rfiUrls) {
        const folioM = url.match(/[?&]folio=(\d+)/i);
        const codIntM = url.match(/[?&]codInt=([^&]+)/i);
        if (folioM) { folioCapturado = folioM[1]; codIntCapturado = codIntM?.[1] ?? ""; break; }
      }
    }

    await page.unroute("**/*rfiInternet*");

    // 4. DESCARGAR PDF CON EL FOLIO CAPTURADO
    if (folioCapturado) {
      resultado.folio = folioCapturado;
      resultado.codInt = codIntCapturado;
      const pdfUrl = `https://www4.sii.cl/rfiInternet/formCompacto?folio=${folioCapturado}&rut=${rutDigitos}&form=029&codInt=${codIntCapturado}`;
      resultado.pdf_url = pdfUrl;

      let pdfBytes: Buffer | null = null;
      const pdfHandler = async (response: import("playwright").Response) => {
        const ct = response.headers()["content-type"] ?? "";
        if (ct.includes("pdf") || ct.includes("octet")) {
          const buf = await response.body().catch(() => null);
          if (buf && buf.length > 500) pdfBytes = buf;
        }
      };
      page.on("response", pdfHandler);
      await page.goto(pdfUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
      await page.waitForTimeout(3000);
      page.off("response", pdfHandler);

      resultado.pdf_bytes = pdfBytes ? (pdfBytes as Buffer).length : 0;
      resultado.pdf_inicio = pdfBytes ? (pdfBytes as Buffer).slice(0, 4).toString("ascii") : "";
      resultado.pdf_ok = resultado.pdf_inicio === "%PDF";
    } else {
      // Diagnóstico: mostrar DOM de todos los frames para entender la estructura
      resultado.frames_dom = [];
      for (const frame of page.frames()) {
        try {
          const dom = await frame.evaluate(() => document.body?.innerHTML?.slice(0, 600) ?? "").catch(() => "");
          if (dom.length > 50) (resultado.frames_dom as string[]).push(`[${frame.url()}]: ${dom}`);
        } catch {}
      }
      resultado.error_pdf = "No se capturó folio desde rfiInternet";
    }

    // 5. LOGOUT
    await page.goto("https://zeusr.sii.cl/cgi_AUT2000/autTermino.cgi", { timeout: 8000 }).catch(() => {});
    await context.close();
  } catch (e: any) {
    resultado.error = e.message;
  } finally {
    await browser.close();
  }

  return NextResponse.json(resultado, { status: 200 });
}
