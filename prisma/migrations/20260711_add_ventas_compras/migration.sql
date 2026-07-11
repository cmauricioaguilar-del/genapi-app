-- Alter extracciones table
ALTER TABLE "extracciones" ADD COLUMN IF NOT EXISTS "actualizadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "extracciones" ADD COLUMN IF NOT EXISTS "filas" INTEGER;
ALTER TABLE "extracciones" ADD COLUMN IF NOT EXISTS "errorMsg" TEXT;
ALTER TABLE "extracciones" ALTER COLUMN "id" SET DEFAULT gen_random_uuid();
ALTER TABLE "extracciones" ALTER COLUMN "estado" SET DEFAULT 'PENDING';
ALTER TABLE "extracciones" DROP COLUMN IF EXISTS "resultado";
ALTER TABLE "extracciones" DROP COLUMN IF EXISTS "error";

-- Create ventas table
CREATE TABLE IF NOT EXISTS "ventas" (
  "id"             SERIAL PRIMARY KEY,
  "period"         TEXT NOT NULL,
  "docType"        TEXT NOT NULL,
  "docNumber"      TEXT NOT NULL,
  "rutEmisor"      TEXT NOT NULL,
  "nombreEmisor"   TEXT NOT NULL,
  "rutReceptor"    TEXT NOT NULL,
  "nombreReceptor" TEXT NOT NULL,
  "fechaEmision"   TEXT NOT NULL,
  "montoNeto"      INTEGER NOT NULL DEFAULT 0,
  "montoIva"       INTEGER NOT NULL DEFAULT 0,
  "montoTotal"     INTEGER NOT NULL DEFAULT 0,
  "montoExento"    INTEGER NOT NULL DEFAULT 0,
  "extractedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "empresaId"      TEXT NOT NULL,
  "extraccionId"   TEXT NOT NULL,
  FOREIGN KEY ("empresaId") REFERENCES "empresas"("id"),
  FOREIGN KEY ("extraccionId") REFERENCES "extracciones"("id")
);

-- Create compras table
CREATE TABLE IF NOT EXISTS "compras" (
  "id"             SERIAL PRIMARY KEY,
  "period"         TEXT NOT NULL,
  "docType"        TEXT NOT NULL,
  "docNumber"      TEXT NOT NULL,
  "rutEmisor"      TEXT NOT NULL,
  "nombreEmisor"   TEXT NOT NULL,
  "rutReceptor"    TEXT NOT NULL,
  "nombreReceptor" TEXT NOT NULL,
  "fechaEmision"   TEXT NOT NULL,
  "montoNeto"      INTEGER NOT NULL DEFAULT 0,
  "montoIva"       INTEGER NOT NULL DEFAULT 0,
  "montoTotal"     INTEGER NOT NULL DEFAULT 0,
  "montoExento"    INTEGER NOT NULL DEFAULT 0,
  "extractedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "empresaId"      TEXT NOT NULL,
  "extraccionId"   TEXT NOT NULL,
  FOREIGN KEY ("empresaId") REFERENCES "empresas"("id"),
  FOREIGN KEY ("extraccionId") REFERENCES "extracciones"("id")
);

-- Add relations to empresas
ALTER TABLE "empresas" ADD COLUMN IF NOT EXISTS "dummy_ventas" BOOLEAN DEFAULT FALSE;
ALTER TABLE "empresas" DROP COLUMN IF EXISTS "dummy_ventas";
