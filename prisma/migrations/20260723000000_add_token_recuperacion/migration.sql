CREATE TABLE "tokens_recuperacion" (
  "id"       TEXT NOT NULL,
  "email"    TEXT NOT NULL,
  "token"    TEXT NOT NULL,
  "expiraEn" TIMESTAMP(3) NOT NULL,
  "usado"    BOOLEAN NOT NULL DEFAULT false,
  "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "tokens_recuperacion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "tokens_recuperacion_token_key" ON "tokens_recuperacion"("token");
