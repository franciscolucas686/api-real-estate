/*
  Warnings:

  - You are about to drop the column `status` on the `Property` table. All the data in the column will be lost.
  - You are about to drop the column `title` on the `Property` table. All the data in the column will be lost.

*/
-- DropIndex
DROP INDEX "Property_type_status_idx";

-- AlterTable
ALTER TABLE "Property" DROP COLUMN "status",
DROP COLUMN "title";

-- DropEnum
DROP TYPE "PropertyStatus";

-- CreateIndex
CREATE INDEX "Property_type_idx" ON "Property"("type");
