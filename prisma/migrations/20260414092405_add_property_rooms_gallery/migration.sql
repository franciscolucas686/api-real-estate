-- AlterTable
ALTER TABLE "PropertyImage" ADD COLUMN     "label" TEXT,
ADD COLUMN     "order" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "roomId" TEXT;

-- CreateTable
CREATE TABLE "PropertyRoom" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PropertyRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PropertyRoom_propertyId_idx" ON "PropertyRoom"("propertyId");

-- CreateIndex
CREATE INDEX "PropertyRoom_propertyId_order_idx" ON "PropertyRoom"("propertyId", "order");

-- CreateIndex
CREATE INDEX "PropertyImage_roomId_idx" ON "PropertyImage"("roomId");

-- CreateIndex
CREATE INDEX "PropertyImage_propertyId_order_idx" ON "PropertyImage"("propertyId", "order");

-- AddForeignKey
ALTER TABLE "PropertyRoom" ADD CONSTRAINT "PropertyRoom_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyImage" ADD CONSTRAINT "PropertyImage_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "PropertyRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;
