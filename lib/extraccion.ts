import { PrismaClient } from "@prisma/client";
import { extraerRCV, DocumentoSII } from "./sii";

const prisma = new PrismaClient();

export async function obtenerOExtraerVentas(empresaId: string, siiRut: string, siiClaveEnc: string, period: string) {
  // Si ya hay datos en BD, retornarlos
  const existing = await prisma.extraccion.findFirst({
    where: { empresaId, period, modulo: "ventas", estado: "SUCCESS" },
    include: { ventas: true },
    orderBy: { creadoEn: "desc" },
  });

  if (existing && existing.ventas.length > 0) {
    return { ok: true, data: existing.ventas, fromCache: true };
  }

  // Crear registro de extracción
  const extraccion = await prisma.extraccion.create({
    data: { empresaId, period, modulo: "ventas", estado: "RUNNING" },
  });

  try {
    const resultado = await extraerRCV(siiRut, siiClaveEnc, period);
    if (!resultado.ok) {
      await prisma.extraccion.update({
        where: { id: extraccion.id },
        data: { estado: "FAILED", errorMsg: resultado.error },
      });
      return { ok: false, error: resultado.error };
    }

    const ventas = resultado.ventas ?? [];
    await guardarVentas(extraccion.id, empresaId, period, ventas);

    await prisma.extraccion.update({
      where: { id: extraccion.id },
      data: { estado: "SUCCESS", filas: ventas.length },
    });

    const saved = await prisma.venta.findMany({ where: { extraccionId: extraccion.id } });
    return { ok: true, data: saved, fromCache: false, taskId: extraccion.id };
  } catch (e: any) {
    await prisma.extraccion.update({
      where: { id: extraccion.id },
      data: { estado: "FAILED", errorMsg: e.message },
    });
    return { ok: false, error: e.message };
  }
}

export async function obtenerOExtraerCompras(empresaId: string, siiRut: string, siiClaveEnc: string, period: string) {
  const existing = await prisma.extraccion.findFirst({
    where: { empresaId, period, modulo: "compras", estado: "SUCCESS" },
    include: { compras: true },
    orderBy: { creadoEn: "desc" },
  });

  if (existing && existing.compras.length > 0) {
    return { ok: true, data: existing.compras, fromCache: true };
  }

  const extraccion = await prisma.extraccion.create({
    data: { empresaId, period, modulo: "compras", estado: "RUNNING" },
  });

  try {
    const resultado = await extraerRCV(siiRut, siiClaveEnc, period);
    if (!resultado.ok) {
      await prisma.extraccion.update({
        where: { id: extraccion.id },
        data: { estado: "FAILED", errorMsg: resultado.error },
      });
      return { ok: false, error: resultado.error };
    }

    const compras = resultado.compras ?? [];
    await guardarCompras(extraccion.id, empresaId, period, compras);

    await prisma.extraccion.update({
      where: { id: extraccion.id },
      data: { estado: "SUCCESS", filas: compras.length },
    });

    const saved = await prisma.compra.findMany({ where: { extraccionId: extraccion.id } });
    return { ok: true, data: saved, fromCache: false, taskId: extraccion.id };
  } catch (e: any) {
    await prisma.extraccion.update({
      where: { id: extraccion.id },
      data: { estado: "FAILED", errorMsg: e.message },
    });
    return { ok: false, error: e.message };
  }
}

async function guardarVentas(extraccionId: string, empresaId: string, period: string, docs: DocumentoSII[]) {
  if (docs.length === 0) return;
  await prisma.venta.createMany({
    data: docs.map((d) => ({
      extraccionId,
      empresaId,
      period,
      docType: d.doc_type,
      docNumber: d.doc_number,
      rutEmisor: d.rut_emisor ?? "",
      nombreEmisor: d.nombre_emisor ?? "",
      rutReceptor: d.rut_receptor ?? "",
      nombreReceptor: d.nombre_receptor ?? "",
      fechaEmision: d.fecha_emision,
      montoNeto: d.monto_neto,
      montoIva: d.monto_iva,
      montoTotal: d.monto_total,
      montoExento: d.monto_exento,
    })),
  });
}

async function guardarCompras(extraccionId: string, empresaId: string, period: string, docs: DocumentoSII[]) {
  if (docs.length === 0) return;
  await prisma.compra.createMany({
    data: docs.map((d) => ({
      extraccionId,
      empresaId,
      period,
      docType: d.doc_type,
      docNumber: d.doc_number,
      rutEmisor: d.rut_emisor ?? "",
      nombreEmisor: d.nombre_emisor ?? "",
      rutReceptor: d.rut_receptor ?? "",
      nombreReceptor: d.nombre_receptor ?? "",
      fechaEmision: d.fecha_emision,
      montoNeto: d.monto_neto,
      montoIva: d.monto_iva,
      montoTotal: d.monto_total,
      montoExento: d.monto_exento,
    })),
  });
}

export async function obtenerExtraccion(taskId: string, empresaId: string) {
  return prisma.extraccion.findFirst({
    where: { id: taskId, empresaId },
    select: { id: true, modulo: true, period: true, estado: true, filas: true, errorMsg: true, creadoEn: true },
  });
}
