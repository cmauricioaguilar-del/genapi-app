import { prisma } from "./db";
import { extraerRCV, extraerHonorarios, DocumentoSII, HonorarioSII } from "./sii";
import { extraerF29 } from "./siiF29";
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
