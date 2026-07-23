import { prisma } from "./db";
import { extraerRCV, extraerHonorarios, DocumentoSII, HonorarioSII } from "./sii";
import { extraerF29 } from "./siiF29";
import { extraerF29Batch } from "./siiF29Playwright";
import { fireWebhook } from "./webhook";

async function getWebhook(empresaId: string) {
  return prisma.empresa.findUnique({
    where: { id: empresaId },
    select: { siiRut: true, webhookUrl: true, webhookSecret: true },
  });
}

function notificar(empresaId: string, modulo: string, period: string, status: "SUCCESS" | "FAILED", filas: number, taskId: string, error?: string | null) {
  getWebhook(empresaId).then((e) => {
    if (!e?.webhookUrl) return;
    fireWebhook(e.webhookUrl, e.webhookSecret, { event: "extraction_complete", module: modulo, period, status, rut: e.siiRut, filas, task_id: taskId, error });
  }).catch(() => {});
}

export async function obtenerOExtraerVentas(empresaId: string, siiRut: string, siiClaveEnc: string, period: string) {
  const existing = await prisma.extraccion.findFirst({
    where: { empresaId, period, modulo: "ventas", estado: "SUCCESS" },
    include: { ventas: true },
    orderBy: { creadoEn: "desc" },
  });
  if (existing && existing.ventas.length > 0) return { ok: true, data: existing.ventas, fromCache: true };

  const extraccion = await prisma.extraccion.create({ data: { empresaId, period, modulo: "ventas", estado: "RUNNING" } });

  try {
    const resultado = await extraerRCV(siiRut, siiClaveEnc, period);
    if (!resultado.ok) {
      await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "FAILED", errorMsg: resultado.error } });
      notificar(empresaId, "ventas", period, "FAILED", 0, extraccion.id, resultado.error);
      return { ok: false, error: resultado.error };
    }
    const ventas = resultado.ventas ?? [];
    await guardarVentas(extraccion.id, empresaId, period, ventas);
    await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "SUCCESS", filas: ventas.length } });
    notificar(empresaId, "ventas", period, "SUCCESS", ventas.length, extraccion.id);
    const saved = await prisma.venta.findMany({ where: { extraccionId: extraccion.id } });
    return { ok: true, data: saved, fromCache: false, taskId: extraccion.id };
  } catch (e: any) {
    await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "FAILED", errorMsg: e.message } });
    notificar(empresaId, "ventas", period, "FAILED", 0, extraccion.id, e.message);
    return { ok: false, error: e.message };
  }
}

export async function obtenerOExtraerCompras(empresaId: string, siiRut: string, siiClaveEnc: string, period: string) {
  const existing = await prisma.extraccion.findFirst({
    where: { empresaId, period, modulo: "compras", estado: "SUCCESS" },
    include: { compras: true },
    orderBy: { creadoEn: "desc" },
  });
  if (existing && existing.compras.length > 0) return { ok: true, data: existing.compras, fromCache: true };

  const extraccion = await prisma.extraccion.create({ data: { empresaId, period, modulo: "compras", estado: "RUNNING" } });

  try {
    const resultado = await extraerRCV(siiRut, siiClaveEnc, period);
    if (!resultado.ok) {
      await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "FAILED", errorMsg: resultado.error } });
      notificar(empresaId, "compras", period, "FAILED", 0, extraccion.id, resultado.error);
      return { ok: false, error: resultado.error };
    }
    const compras = resultado.compras ?? [];
    await guardarCompras(extraccion.id, empresaId, period, compras);
    await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "SUCCESS", filas: compras.length } });
    notificar(empresaId, "compras", period, "SUCCESS", compras.length, extraccion.id);
    const saved = await prisma.compra.findMany({ where: { extraccionId: extraccion.id } });
    return { ok: true, data: saved, fromCache: false, taskId: extraccion.id };
  } catch (e: any) {
    await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "FAILED", errorMsg: e.message } });
    notificar(empresaId, "compras", period, "FAILED", 0, extraccion.id, e.message);
    return { ok: false, error: e.message };
  }
}

export async function obtenerOExtraerHonorarios(empresaId: string, siiRut: string, siiClaveEnc: string, anio: string) {
  const existing = await prisma.extraccion.findFirst({
    where: { empresaId, period: anio, modulo: "honorarios", estado: "SUCCESS" },
    include: { honorarios: true },
    orderBy: { creadoEn: "desc" },
  });
  if (existing && existing.honorarios.length > 0) return { ok: true, data: existing.honorarios, fromCache: true };

  const extraccion = await prisma.extraccion.create({ data: { empresaId, period: anio, modulo: "honorarios", estado: "RUNNING" } });

  try {
    const resultado = await extraerHonorarios(siiRut, siiClaveEnc, anio);
    if (!resultado.ok) {
      await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "FAILED", errorMsg: resultado.error } });
      notificar(empresaId, "honorarios", anio, "FAILED", 0, extraccion.id, resultado.error);
      return { ok: false, error: resultado.error };
    }
    const honorarios = resultado.honorarios ?? [];
    await guardarHonorarios(extraccion.id, empresaId, honorarios);
    await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "SUCCESS", filas: honorarios.length } });
    notificar(empresaId, "honorarios", anio, "SUCCESS", honorarios.length, extraccion.id);
    const saved = await prisma.honorario.findMany({ where: { extraccionId: extraccion.id } });
    return { ok: true, data: saved, fromCache: false, taskId: extraccion.id };
  } catch (e: any) {
    await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "FAILED", errorMsg: e.message } });
    notificar(empresaId, "honorarios", anio, "FAILED", 0, extraccion.id, e.message);
    return { ok: false, error: e.message };
  }
}

export async function obtenerOExtraerF29(empresaId: string, siiRut: string, siiClaveEnc: string, period: string) {
  const existing = await prisma.extraccion.findFirst({
    where: { empresaId, period, modulo: "f29", estado: "SUCCESS" },
    include: { f29: true },
    orderBy: { creadoEn: "desc" },
  });
  if (existing?.f29) return { ok: true, data: existing.f29, fromCache: true };

  const extraccion = await prisma.extraccion.create({ data: { empresaId, period, modulo: "f29", estado: "RUNNING" } });

  try {
    const resultado = await extraerF29(siiRut, siiClaveEnc, period);
    if (!resultado.ok) {
      await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "FAILED", errorMsg: resultado.error } });
      notificar(empresaId, "f29", period, "FAILED", 0, extraccion.id, resultado.error);
      return { ok: false, error: resultado.error };
    }
    const f29 = resultado.f29!;
    const saved = await prisma.f29Genapi.create({
      data: { extraccionId: extraccion.id, empresaId, period, ivaDebito: f29.iva_debito, ivaCredito: f29.iva_credito, ivaRemanente: f29.iva_remanente, ivaNeto: f29.iva_neto, retencionHonorarios: f29.retencion_honorarios, ppm: f29.ppm, totalPagar: f29.total_pagar, rawData: f29.raw },
    });
    await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "SUCCESS", filas: 1 } });
    notificar(empresaId, "f29", period, "SUCCESS", 1, extraccion.id);
    return { ok: true, data: saved, fromCache: false, taskId: extraccion.id };
  } catch (e: any) {
    await prisma.extraccion.update({ where: { id: extraccion.id }, data: { estado: "FAILED", errorMsg: e.message } });
    notificar(empresaId, "f29", period, "FAILED", 0, extraccion.id, e.message);
    return { ok: false, error: e.message };
  }
}

export async function obtenerOExtraerF29Batch(
  empresaId: string,
  siiRut: string,
  siiClaveEnc: string,
  periods: string[]
): Promise<{ period: string; ok: boolean; fromCache?: boolean; error?: string }[]> {
  if (periods.length === 0) return [];

  // Verificar cuáles ya están en caché
  const existentes = await prisma.extraccion.findMany({
    where: { empresaId, modulo: "f29", estado: "SUCCESS", period: { in: periods } },
    select: { period: true },
  });
  const periodosEnCache = new Set(existentes.map(e => e.period));
  const periodosFaltantes = periods.filter(p => !periodosEnCache.has(p));

  const resultados: { period: string; ok: boolean; fromCache?: boolean; error?: string }[] = [];

  // Períodos en caché → marcar como fromCache
  for (const p of periods) {
    if (periodosEnCache.has(p)) {
      resultados.push({ period: p, ok: true, fromCache: true });
    }
  }

  if (periodosFaltantes.length === 0) return resultados;

  // Crear registros RUNNING para todos los períodos faltantes
  const extraccionIds = new Map<string, string>();
  for (const p of periodosFaltantes) {
    const ext = await prisma.extraccion.create({ data: { empresaId, period: p, modulo: "f29", estado: "RUNNING" } });
    extraccionIds.set(p, ext.id);
  }

  // Un solo login + Playwright para todos los períodos faltantes
  let batchResults: Map<string, import("./siiF29").F29SII>;
  try {
    batchResults = await extraerF29Batch(siiRut, siiClaveEnc, periodosFaltantes);
  } catch (e: any) {
    // Si Playwright falla completamente, marcar todos como FAILED
    for (const p of periodosFaltantes) {
      const extId = extraccionIds.get(p)!;
      await prisma.extraccion.update({ where: { id: extId }, data: { estado: "FAILED", errorMsg: e.message } });
      resultados.push({ period: p, ok: false, error: e.message });
    }
    return resultados;
  }

  // Guardar resultados en BD
  for (const p of periodosFaltantes) {
    const extId = extraccionIds.get(p)!;
    const f29 = batchResults.get(p);

    if (!f29) {
      // Fallback: intentar con getPropuesta (mes actual)
      const fallback = await extraerF29(siiRut, siiClaveEnc, p);
      if (fallback.ok && fallback.f29) {
        const f = fallback.f29;
        await prisma.f29Genapi.create({
          data: { extraccionId: extId, empresaId, period: p, ivaDebito: f.iva_debito, ivaCredito: f.iva_credito, ivaRemanente: f.iva_remanente, ivaNeto: f.iva_neto, retencionHonorarios: f.retencion_honorarios, ppm: f.ppm, totalPagar: f.total_pagar, rawData: f.raw },
        });
        await prisma.extraccion.update({ where: { id: extId }, data: { estado: "SUCCESS", filas: 1 } });
        resultados.push({ period: p, ok: true, fromCache: false });
      } else {
        const errMsg = `F29 no encontrado para período ${p}`;
        await prisma.extraccion.update({ where: { id: extId }, data: { estado: "FAILED", errorMsg: errMsg } });
        resultados.push({ period: p, ok: false, error: errMsg });
      }
    } else {
      try {
        await prisma.f29Genapi.create({
          data: { extraccionId: extId, empresaId, period: p, ivaDebito: f29.iva_debito, ivaCredito: f29.iva_credito, ivaRemanente: f29.iva_remanente, ivaNeto: f29.iva_neto, retencionHonorarios: f29.retencion_honorarios, ppm: f29.ppm, totalPagar: f29.total_pagar, rawData: f29.raw },
        });
        await prisma.extraccion.update({ where: { id: extId }, data: { estado: "SUCCESS", filas: 1 } });
        resultados.push({ period: p, ok: true, fromCache: false });
      } catch (e: any) {
        await prisma.extraccion.update({ where: { id: extId }, data: { estado: "FAILED", errorMsg: e.message } });
        resultados.push({ period: p, ok: false, error: e.message });
      }
    }
  }

  return resultados;
}

async function guardarVentas(extraccionId: string, empresaId: string, period: string, docs: DocumentoSII[]) {
  if (!docs.length) return;
  await prisma.venta.createMany({ data: docs.map((d) => ({ extraccionId, empresaId, period, docType: String(d.doc_type), docNumber: d.doc_number, rutEmisor: d.rut_emisor ?? "", nombreEmisor: d.nombre_emisor ?? "", rutReceptor: d.rut_receptor ?? "", nombreReceptor: d.nombre_receptor ?? "", fechaEmision: d.fecha_emision, montoNeto: d.monto_neto, montoIva: d.monto_iva, montoTotal: d.monto_total, montoExento: d.monto_exento })) });
}

async function guardarCompras(extraccionId: string, empresaId: string, period: string, docs: DocumentoSII[]) {
  if (!docs.length) return;
  await prisma.compra.createMany({ data: docs.map((d) => ({ extraccionId, empresaId, period, docType: String(d.doc_type), docNumber: d.doc_number, rutEmisor: d.rut_emisor ?? "", nombreEmisor: d.nombre_emisor ?? "", rutReceptor: d.rut_receptor ?? "", nombreReceptor: d.nombre_receptor ?? "", fechaEmision: d.fecha_emision, montoNeto: d.monto_neto, montoIva: d.monto_iva, montoTotal: d.monto_total, montoExento: d.monto_exento })) });
}

async function guardarHonorarios(extraccionId: string, empresaId: string, docs: HonorarioSII[]) {
  if (!docs.length) return;
  await prisma.honorario.createMany({ data: docs.map((d) => ({ extraccionId, empresaId, anio: d.anio, mes: d.mes, folio: d.folio, fechaEmision: d.fecha_emision, rutEmisor: d.rut_emisor, nombreEmisor: d.nombre_emisor, montoBruto: d.monto_bruto, retencion: d.retencion, montoLiquido: d.monto_liquido })) });
}

export async function obtenerExtraccion(taskId: string, empresaId: string) {
  return prisma.extraccion.findFirst({
    where: { id: taskId, empresaId },
    select: { id: true, modulo: true, period: true, estado: true, filas: true, errorMsg: true, creadoEn: true },
  });
}
