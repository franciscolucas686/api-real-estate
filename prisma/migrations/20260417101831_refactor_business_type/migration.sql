-- Step 1: Create new enums
CREATE TYPE "BusinessType" AS ENUM ('RENT', 'SALE');
CREATE TYPE "SaleType" AS ENUM ('DIRECT', 'FINANCING', 'EXCHANGE');

-- Step 2: Create junction table
CREATE TABLE "PropertySaleType" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" "SaleType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PropertySaleType_pkey" PRIMARY KEY ("id")
);

-- Step 3: Add indexes and unique constraint
CREATE INDEX "PropertySaleType_propertyId_idx" ON "PropertySaleType"("propertyId");
CREATE UNIQUE INDEX "PropertySaleType_propertyId_type_key" ON "PropertySaleType"("propertyId", "type");

-- Step 4: Add new businessType column (nullable initially)
ALTER TABLE "Property" ADD COLUMN "businessType_new" "BusinessType";

-- Step 5: Migrate data - Map old BusinessCode to new BusinessType
UPDATE "Property" SET "businessType_new" = 'RENT' WHERE "businessType" = 'RENT';
UPDATE "Property" SET "businessType_new" = 'SALE' WHERE "businessType" IN ('SALE_DIRECT', 'SALE_FINANCING', 'EXCHANGE');

-- Step 6: Create PropertySaleType records for SALE properties
INSERT INTO "PropertySaleType" ("id", "propertyId", "type", "createdAt")
SELECT gen_random_uuid(), "id", 'DIRECT'::"SaleType", NOW() FROM "Property" WHERE "businessType" = 'SALE_DIRECT';

INSERT INTO "PropertySaleType" ("id", "propertyId", "type", "createdAt")
SELECT gen_random_uuid(), "id", 'FINANCING'::"SaleType", NOW() FROM "Property" WHERE "businessType" = 'SALE_FINANCING';

INSERT INTO "PropertySaleType" ("id", "propertyId", "type", "createdAt")
SELECT gen_random_uuid(), "id", 'EXCHANGE'::"SaleType", NOW() FROM "Property" WHERE "businessType" = 'EXCHANGE';

-- Step 7: Add FK constraint for PropertySaleType
ALTER TABLE "PropertySaleType" ADD CONSTRAINT "PropertySaleType_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 8: Finalize column swap
ALTER TABLE "Property" ALTER COLUMN "businessType_new" SET NOT NULL;
ALTER TABLE "Property" DROP COLUMN "businessType";
ALTER TABLE "Property" RENAME COLUMN "businessType_new" TO "businessType";

-- Step 9: Drop old enum
DROP TYPE "BusinessCode";
