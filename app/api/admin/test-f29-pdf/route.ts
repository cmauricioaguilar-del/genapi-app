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

    // Escuchar popups/nuevas ventanas — capturar URL final y bytes de PDF
    const popupUrls: string[] = [];
    let pdfBytesPopup: Buffer | null = null;
    context.on("page", async (newPage) => {
      console.log(`[F29 POPUP] Nueva ventana abierta`);
      try {
        // Loguear TODAS las requests del popup para diagnóstico
        newPage.on("request", (req) => {
          console.log(`[F29 POPUP REQ] ${req.method()} ${req.url()}`);
          popupUrls.push(`REQ:${req.url()}`);
        });
        // Interceptar respuestas en el popup
        newPage.on("response", async (resp) => {
          const ct = resp.headers()["content-type"] ?? "";
          const u = resp.url();
          console.log(`[F29 POPUP RESP] ${u} ct=${ct.slice(0, 40)}`);
          if (ct.includes("pdf") || ct.includes("octet") || u.includes("formCompacto") || u.includes("rfiInternet")) {
            const buf = await resp.body().catch(() => null);
            if (buf && buf.length > 100) {
              popupUrls.push(`RESP:${u}:len=${buf.length}:inicio=${buf.slice(0, 4).toString("ascii")}`);
              if (buf.slice(0, 4).toString("ascii") === "%PDF") {
                pdfBytesPopup = buf;
                console.log(`[F29 POPUP] PDF capturado len=${buf.length}`);
              }
            }
          }
        });
        await newPage.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        await newPage.waitForTimeout(5000);
        popupUrls.push(`FINAL_URL:${newPage.url()}`);
      } catch (e: any) {
        popupUrls.push(`ERROR:${(e as Error).message}`);
      }
    });

    // Buscar el checkmark/celda de "Enero 2026" — puede ser img con title, td con title, o div con text
    // Estrategia: encontrar la fila de "Enero" y en esa fila, la celda de 2026 (primera con check/declaracion)
    const infoEnero = await page.evaluate(() => {
      // Buscar todos los elementos con title o textContent que contenga "sin observaciones"
      const all = Array.from(document.querySelectorAll("*"));
      const candidatos: { x: number; y: number; tag: string; text: string; title: string }[] = [];
      for (const el of all) {
        const title = el.getAttribute("title") ?? "";
        const text = el.textContent?.trim() ?? "";
        const isDeclaracion = title.includes("sin observaciones") || (text === "Declaración sin observaciones." || text === "Declaracion sin observaciones.");
        if (isDeclaracion) {
          const rect = el.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            candidatos.push({
              x: rect.left + rect.width / 2,
              y: rect.top + rect.height / 2,
              tag: el.tagName,
              text: text.slice(0, 40),
              title: title.slice(0, 40),
            });
          }
        }
      }
      return candidatos;
    });
    resultado.candidatos_declaracion = infoEnero;

    // Clickear el primer candidato visible con y > 200 (evitar header)
    const primero = infoEnero.find(c => c.y > 200);
    resultado.pos_declaracion = primero ?? null;

    let clickedEnero: string | null = null;
    if (primero) {
      await page.mouse.click(primero.x, primero.y);
      clickedEnero = `mouse_click:${primero.tag}@(${primero.x},${primero.y})`;
      console.log(`[F29] mouse.click check en (${primero.x}, ${primero.y}) tag=${primero.tag}`);
    } else {
      // Fallback: usar Playwright getByText directo
      try {
        await page.getByText("Declaración sin observaciones.").first().click({ timeout: 3000 });
        clickedEnero = "playwright_getByText_click";
      } catch {}
    }
    resultado.click_enero = clickedEnero;
    await page.waitForTimeout(8000);

    resultado.rfi_urls_after_enero = rfiUrls.slice();
    resultado.popup_urls_after_enero = popupUrls.slice();

    // Extraer folio directamente del DOM — aparece como "NNNNNNNN - DECLARACION VIGENTE"
    let folioCapturado = "";
    let codIntCapturado = "V";
    const folioDelDom = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("td, div, span"));
      for (const el of all) {
        const t = el.textContent?.trim() ?? "";
        const m = t.match(/^(\d{8,12})\s*-\s*(DECLARACION VIGENTE|DECLARACION RECTIFICATORIA|DECLARACION PRIMITIVA)/i);
        if (m) return { folio: m[1], evigCod: m[2] };
      }
      return null;
    });
    resultado.folio_del_dom = folioDelDom;

    if (folioDelDom) {
      folioCapturado = folioDelDom.folio;
      codIntCapturado = "V"; // formCompacto usa "V" para declaración vigente
    }

    // Interceptar window.open para capturar la URL que GWT pasa al abrir el popup
    await page.evaluate(() => {
      const orig = window.open.bind(window);
      (window as any).__windowOpenCalls = [];
      window.open = function(...args: any[]) {
        (window as any).__windowOpenCalls.push(args.map(String));
        return orig(...args);
      };
    });

    // Inspeccionar el botón "Formulario Compacto"
    const infoCompacto = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll("a, button, input, td, span, div"));
      const el = all.find(e => e.textContent?.trim() === "Formulario Compacto");
      if (!el) return null;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, tag: el.tagName };
    });
    resultado.pos_compacto = infoCompacto;

    // Usar page.on("popup") para capturar el popup ANTES de que se cierre
    const popupPromise = page.waitForEvent("popup", { timeout: 12000 }).catch(() => null);

    if (infoCompacto) {
      await page.mouse.click(infoCompacto.x, infoCompacto.y);
      resultado.click_form_compacto = `mouse_click:${infoCompacto.tag}@(${infoCompacto.x},${infoCompacto.y})`;
    }

    // Capturar la URL que GWT pasó a window.open
    await page.waitForTimeout(2000);
    const windowOpenCalls = await page.evaluate(() => (window as any).__windowOpenCalls ?? []).catch(() => []);
    resultado.window_open_calls = windowOpenCalls;

    // Esperar el popup
    const popup = await popupPromise;
    if (popup) {
      try {
        await popup.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
        await popup.waitForTimeout(3000);
        const popupFinalUrl = popup.url();
        resultado.popup_final_url = popupFinalUrl;
        console.log(`[F29] popup URL final: ${popupFinalUrl}`);

        // Capturar bytes si es PDF
        const popupContent = await popup.evaluate(() => document.title + " | " + document.body?.innerText?.slice(0, 200)).catch(() => "");
        resultado.popup_content_sample = popupContent;

        // Intentar descargar el PDF desde el popup
        const popupResponse = await popup.evaluate(async (url) => {
          try {
            const r = await fetch(url);
            const ct = r.headers.get("content-type") ?? "";
            return { ok: r.ok, status: r.status, ct };
          } catch (e) { return { error: String(e) }; }
        }, popup.url()).catch(() => null);
        resultado.popup_response_info = popupResponse;
      } catch (e: any) {
        resultado.popup_error = (e as Error).message;
      }
    } else {
      resultado.popup_captured = false;
    }

    await page.waitForTimeout(4000);
    resultado.rfi_urls_after_compacto = rfiUrls.slice();
    resultado.popup_urls_after_compacto = popupUrls.slice();

    // También intentar capturar folio de URLs interceptadas
    const todasUrls2 = [...rfiUrls, ...popupUrls];
    if (!folioCapturado) {
      for (const url of todasUrls2) {
        const folioM = url.match(/[?&]folio=(\d+)/i);
        const codIntM = url.match(/[?&]codInt=([^&]+)/i);
        if (folioM) { folioCapturado = folioM[1]; codIntCapturado = codIntM?.[1] ?? "V"; break; }
      }
    }

    await page.unroute("**/*rfiInternet*");

    // 4. DESCARGAR PDF CON EL FOLIO CAPTURADO
    if (folioCapturado) {
      resultado.folio = folioCapturado;
      resultado.codInt = codIntCapturado;
      const pdfUrl = `https://www4.sii.cl/rfiInternet/formCompacto?folio=${folioCapturado}&rut=${rutDigitos}&form=029&codInt=${codIntCapturado}`;
      resultado.pdf_url = pdfUrl;

      // Si el popup ya capturó el PDF, usarlo; si no, intentar descarga directa
      await page.waitForTimeout(2000); // dar tiempo al popup para cargar
      let pdfBytes: Buffer | null = pdfBytesPopup;

      if (!pdfBytes) {
        // Descarga directa con las cookies de sesión actuales
        const pdfHandler = async (response: import("playwright").Response) => {
          const ct = response.headers()["content-type"] ?? "";
          const u = response.url();
          if (ct.includes("pdf") || ct.includes("octet") || u.includes("formCompacto")) {
            const buf = await response.body().catch(() => null);
            if (buf && buf.length > 500) pdfBytes = buf;
          }
        };
        page.on("response", pdfHandler);
        await page.goto(pdfUrl, { waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(4000);
        page.off("response", pdfHandler);
      }

      resultado.pdf_bytes = pdfBytes ? (pdfBytes as Buffer).length : 0;
      resultado.pdf_inicio = pdfBytes ? (pdfBytes as Buffer).slice(0, 4).toString("ascii") : "";
      resultado.pdf_ok = resultado.pdf_inicio === "%PDF";
      resultado.pdf_from_popup = !!pdfBytesPopup;
      resultado.popup_urls_final = popupUrls;
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
