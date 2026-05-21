-- ─── Step 1: Create GeocodingStatus enum ────────────────────────────────────

CREATE TYPE "GeocodingStatus" AS ENUM ('PENDING', 'RESOLVED', 'NOT_FOUND', 'ERROR');

-- ─── Step 2: Create Neighborhood table ───────────────────────────────────────

CREATE TABLE "Neighborhood" (
    "id"          TEXT         NOT NULL,
    "slug"        TEXT         NOT NULL,
    "displayName" TEXT         NOT NULL,
    "city"        TEXT         NOT NULL,
    "state"       TEXT         NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Neighborhood_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Neighborhood_slug_city_state_key" ON "Neighborhood"("slug", "city", "state");
CREATE INDEX "Neighborhood_city_state_idx" ON "Neighborhood"("city", "state");

-- ─── Step 3: Populate Neighborhood from all existing location strings ─────────
--
-- Slug formula: translate accented chars → ASCII → lowercase → spaces to hyphens
--               → strip anything that is not [a-z0-9-]
--
-- Source columns:   translate source  → target  (46 chars each side)
--   á à ã â ä  →  a a a a a   (5)
--   é è ê ë    →  e e e e     (4)
--   í ì î ï    →  i i i i     (4)
--   ó ò õ ô ö  →  o o o o o   (5)
--   ú ù û ü    →  u u u u     (4)
--   ç          →  c           (1)   = 23 lowercase
--   Á À Ã Â Ä  →  A A A A A   (5)
--   É È Ê Ë    →  E E E E     (4)
--   Í Ì Î Ï    →  I I I I     (4)
--   Ó Ò Õ Ô Ö  →  O O O O O   (5)
--   Ú Ù Û Ü    →  U U U U     (4)
--   Ç          →  C           (1)   = 23 uppercase

INSERT INTO "Neighborhood" ("id", "slug", "displayName", "city", "state", "createdAt")
SELECT
    gen_random_uuid(),
    regexp_replace(
        lower(regexp_replace(
            trim(translate(
                src.neighborhood,
                'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
                'aaaaaeeeeiiiioooouuuucAAAAAEEEEIIIIOOOOOUUUUC'
            )),
            '\s+', '-', 'g'
        )),
        '[^a-z0-9-]', '', 'g'
    ),
    src.neighborhood,
    src.city,
    src.state,
    NOW()
FROM (
    SELECT DISTINCT neighborhood, city, state FROM "Property"
    UNION
    SELECT DISTINCT neighborhood, city, state FROM "LocationCache"
) src
ON CONFLICT DO NOTHING;

-- ─── Step 4: Add neighborhoodId to Property (nullable for backfill) ───────────

ALTER TABLE "Property" ADD COLUMN "neighborhoodId" TEXT;

UPDATE "Property" p
SET "neighborhoodId" = n.id
FROM "Neighborhood" n
WHERE p.neighborhood = n."displayName"
  AND p.city         = n.city
  AND p.state        = n.state;

ALTER TABLE "Property" ALTER COLUMN "neighborhoodId" SET NOT NULL;

-- ─── Step 5: Add new columns to LocationCache (nullable for backfill) ─────────

ALTER TABLE "LocationCache" ADD COLUMN "neighborhoodId" TEXT;
ALTER TABLE "LocationCache" ADD COLUMN "status"         "GeocodingStatus" NOT NULL DEFAULT 'PENDING';
ALTER TABLE "LocationCache" ADD COLUMN "retryAfter"     TIMESTAMP(3);

UPDATE "LocationCache" lc
SET "neighborhoodId" = n.id
FROM "Neighborhood" n
WHERE lc.neighborhood = n."displayName"
  AND lc.city         = n.city
  AND lc.state        = n.state;

-- Derive initial status from already-resolved lat/lng data
UPDATE "LocationCache"
SET "status" = CASE
    WHEN latitude  IS NOT NULL
     AND longitude IS NOT NULL THEN 'RESOLVED'::"GeocodingStatus"
    WHEN "resolvedAt" IS NOT NULL  THEN 'NOT_FOUND'::"GeocodingStatus"
    ELSE 'PENDING'::"GeocodingStatus"
END;

ALTER TABLE "LocationCache" ALTER COLUMN "neighborhoodId" SET NOT NULL;

-- ─── Step 6: Add FK constraints ───────────────────────────────────────────────

ALTER TABLE "Property" ADD CONSTRAINT "Property_neighborhoodId_fkey"
    FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "LocationCache" ADD CONSTRAINT "LocationCache_neighborhoodId_fkey"
    FOREIGN KEY ("neighborhoodId") REFERENCES "Neighborhood"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─── Step 7: Add new indexes ──────────────────────────────────────────────────

CREATE UNIQUE INDEX "LocationCache_neighborhoodId_key" ON "LocationCache"("neighborhoodId");
CREATE INDEX "Property_neighborhoodId_idx" ON "Property"("neighborhoodId");

-- ─── Step 8: Drop superseded indexes ─────────────────────────────────────────

DROP INDEX "LocationCache_neighborhood_city_state_key";
DROP INDEX "Property_city_neighborhood_idx";

-- ─── Step 9: Drop old string columns ─────────────────────────────────────────

ALTER TABLE "Property"
    DROP COLUMN "neighborhood",
    DROP COLUMN "city",
    DROP COLUMN "state";

ALTER TABLE "LocationCache"
    DROP COLUMN "neighborhood",
    DROP COLUMN "city",
    DROP COLUMN "state";
