-- Migrate existing DRAFT properties to PENDING
UPDATE "Property" SET "status" = 'PENDING'::"PropertyStatus" WHERE "status" = 'DRAFT'::"PropertyStatus";

-- Remove default before altering type
ALTER TABLE "Property" ALTER COLUMN "status" DROP DEFAULT;

-- Rename old enum, create new one without DRAFT, switch column, drop old
ALTER TYPE "PropertyStatus" RENAME TO "PropertyStatus_old";
CREATE TYPE "PropertyStatus" AS ENUM ('PENDING', 'ACTIVE', 'INACTIVE');
ALTER TABLE "Property" ALTER COLUMN "status" TYPE "PropertyStatus" USING "status"::text::"PropertyStatus";
ALTER TABLE "Property" ALTER COLUMN "status" SET DEFAULT 'PENDING';
DROP TYPE "PropertyStatus_old";
