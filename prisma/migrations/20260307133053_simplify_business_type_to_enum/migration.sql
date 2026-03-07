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

-- AlterTable
ALTER TABLE "Property" ADD COLUMN     "businessType" "BusinessCode" NOT NULL;

-- DropTable
DROP TABLE "BusinessType";

-- DropTable
DROP TABLE "PropertyBusinessType";
