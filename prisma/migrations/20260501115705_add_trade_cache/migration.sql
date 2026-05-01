-- CreateTable
CREATE TABLE "TradeCache" (
    "id" TEXT NOT NULL,
    "hsCode" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "productName" TEXT NOT NULL,
    "exportAmount" DOUBLE PRECISION NOT NULL,
    "importAmount" DOUBLE PRECISION NOT NULL,
    "exportQty" DOUBLE PRECISION NOT NULL,
    "importQty" DOUBLE PRECISION NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "exportYoY" DOUBLE PRECISION NOT NULL,
    "importYoY" DOUBLE PRECISION NOT NULL,
    "avgExportPrice" DOUBLE PRECISION NOT NULL,
    "avgImportPrice" DOUBLE PRECISION NOT NULL,
    "avgExportPriceYoY" DOUBLE PRECISION NOT NULL,
    "avgImportPriceYoY" DOUBLE PRECISION NOT NULL,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TradeCache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TradeCache_country_year_month_idx" ON "TradeCache"("country", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "TradeCache_hsCode_country_year_month_key" ON "TradeCache"("hsCode", "country", "year", "month");
