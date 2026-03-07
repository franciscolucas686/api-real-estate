/*
  Warnings:

  - You are about to drop the `BusinessType` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `PropertyBusinessType` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `businessType` to the `Property` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "PropertyBusinessType" DROP CONSTRAINT "PropertyBusinessType_businessTypeId_fkey";

-- DropForeignKey
ALTER TABLE "PropertyBusinessType" DROP CONSTRAINT "PropertyBusinessType_propertyId_fkey";

-- AlterTable: add column as nullable first, backfill from existing relation, then set NOT NULL
ALTER TABLE "Property" ADD COLUMN "businessType" "BusinessCode";

-- Backfill existing properties with their business type from the relation
UPDATE "Property" p
SET "businessType" = (
  SELECT bt."code"
  FROM "PropertyBusinessType" pbt
  JOIN "BusinessType" bt ON bt."id" = pbt."businessTypeId"
  WHERE pbt."propertyId" = p."id"
  LIMIT 1
);

-- Set default for any properties that had no business type
UPDATE "Property" SET "businessType" = 'SALE_DIRECT' WHERE "businessType" IS NULL;

-- Now make column NOT NULL
ALTER TABLE "Property" ALTER COLUMN "businessType" SET NOT NULL;

-- DropTable
DROP TABLE "BusinessType";

-- DropTable
DROP TABLE "PropertyBusinessType";
