-- CreateEnum
CREATE TYPE "BusinessCode" AS ENUM ('RENT', 'SALE_DIRECT', 'SALE_FINANCING', 'EXCHANGE');

-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('HOUSE', 'APARTMENT', 'LAND', 'SMALL_FARM', 'COUNTRY_HOUSE');

-- CreateEnum
CREATE TYPE "PropertyStatus" AS ENUM ('AVAILABLE', 'SOLD', 'RENTED', 'RESERVED');

-- CreateEnum
CREATE TYPE "SunPosition" AS ENUM ('MORNING', 'AFTERNOON');

-- CreateEnum
CREATE TYPE "Zoning" AS ENUM ('RESIDENTIAL', 'COMMERCIAL', 'MIXED');

-- CreateEnum
CREATE TYPE "Topography" AS ENUM ('FLAT', 'ACCLIVITY', 'DECLIVITY');

-- CreateEnum
CREATE TYPE "WaterSource" AS ENUM ('WELL', 'SPRING', 'MAINS');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "refreshToken" TEXT,
    "refreshTokenExpiresAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BusinessType" (
    "id" TEXT NOT NULL,
    "code" "BusinessCode" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertyBusinessType" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "businessTypeId" TEXT NOT NULL,

    CONSTRAINT "PropertyBusinessType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "type" "PropertyType" NOT NULL,
    "status" "PropertyStatus" NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "rentPrice" DECIMAL(65,30),
    "condoFee" DECIMAL(65,30),
    "totalArea" DOUBLE PRECISION,
    "builtArea" DOUBLE PRECISION,
    "bedrooms" INTEGER,
    "bathrooms" INTEGER,
    "parkingSpaces" INTEGER,
    "state" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "neighborhood" TEXT NOT NULL,
    "coverImage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "House" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "floors" INTEGER NOT NULL,
    "isInCondominium" BOOLEAN,
    "condominiumName" TEXT,
    "condominiumAmenities" TEXT,

    CONSTRAINT "House_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Apartment" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "floor" INTEGER NOT NULL,
    "hasElevator" BOOLEAN NOT NULL,
    "hasBalcony" BOOLEAN NOT NULL,
    "sunPosition" "SunPosition" NOT NULL,
    "hasPool" BOOLEAN,

    CONSTRAINT "Apartment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Land" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "zoning" "Zoning" NOT NULL,
    "topography" "Topography" NOT NULL,

    CONSTRAINT "Land_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmallFarm" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "hasHouse" BOOLEAN NOT NULL,
    "hasPool" BOOLEAN NOT NULL,
    "hasLake" BOOLEAN NOT NULL,
    "hasFruitTrees" BOOLEAN NOT NULL,
    "waterSource" "WaterSource" NOT NULL,

    CONSTRAINT "SmallFarm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CountryHouse" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "hasRiver" BOOLEAN NOT NULL,
    "hasSpring" BOOLEAN NOT NULL,

    CONSTRAINT "CountryHouse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "BusinessType_code_key" ON "BusinessType"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PropertyBusinessType_propertyId_businessTypeId_key" ON "PropertyBusinessType"("propertyId", "businessTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Property_code_key" ON "Property"("code");

-- CreateIndex
CREATE INDEX "Property_type_status_idx" ON "Property"("type", "status");

-- CreateIndex
CREATE INDEX "Property_city_neighborhood_idx" ON "Property"("city", "neighborhood");

-- CreateIndex
CREATE UNIQUE INDEX "House_propertyId_key" ON "House"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Apartment_propertyId_key" ON "Apartment"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Land_propertyId_key" ON "Land"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "SmallFarm_propertyId_key" ON "SmallFarm"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "CountryHouse_propertyId_key" ON "CountryHouse"("propertyId");

-- AddForeignKey
ALTER TABLE "PropertyBusinessType" ADD CONSTRAINT "PropertyBusinessType_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertyBusinessType" ADD CONSTRAINT "PropertyBusinessType_businessTypeId_fkey" FOREIGN KEY ("businessTypeId") REFERENCES "BusinessType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "House" ADD CONSTRAINT "House_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Apartment" ADD CONSTRAINT "Apartment_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Land" ADD CONSTRAINT "Land_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SmallFarm" ADD CONSTRAINT "SmallFarm_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CountryHouse" ADD CONSTRAINT "CountryHouse_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE CASCADE ON UPDATE CASCADE;
