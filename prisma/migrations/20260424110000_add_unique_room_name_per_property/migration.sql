-- Deduplicate room names per property before adding unique constraint
-- Keeps the row with the lowest id (alphabetically) and deletes the rest
DELETE FROM "PropertyRoom"
WHERE id NOT IN (
  SELECT DISTINCT ON ("propertyId", name) id
  FROM "PropertyRoom"
  ORDER BY "propertyId", name, id
);

-- CreateIndex
CREATE UNIQUE INDEX "PropertyRoom_propertyId_name_key" ON "PropertyRoom"("propertyId", "name");
