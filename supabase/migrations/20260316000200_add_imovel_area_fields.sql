-- Migration to add property type and area fields to core_entities
ALTER TABLE core_entities 
ADD COLUMN IF NOT EXISTS property_type TEXT,
ADD COLUMN IF NOT EXISTS total_area NUMERIC(10,2),
ADD COLUMN IF NOT EXISTS useful_area NUMERIC(10,2);

-- Add comments for documentation
COMMENT ON COLUMN core_entities.property_type IS 'Type of property (Casa, Apartamento, etc) for Imóvel subtype';
COMMENT ON COLUMN core_entities.total_area IS 'Total area of the property in square meters';
COMMENT ON COLUMN core_entities.useful_area IS 'Useful/Private area of the property in square meters';
