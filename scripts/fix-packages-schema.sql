-- Fix packages table schema - add missing description column
-- Run this to fix the packages table structure

-- Check if description column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='packages' AND column_name='description') THEN
        ALTER TABLE packages ADD COLUMN description TEXT;
        RAISE NOTICE 'Added description column to packages table';
    ELSE
        RAISE NOTICE 'Description column already exists in packages table';
    END IF;
END $$;

-- Check if package_type column exists, if not add it
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name='packages' AND column_name='package_type') THEN
        ALTER TABLE packages ADD COLUMN package_type VARCHAR(20) DEFAULT 'time_based';
        RAISE NOTICE 'Added package_type column to packages table';
    ELSE
        RAISE NOTICE 'Package_type column already exists in packages table';
    END IF;
END $$;

-- Update existing packages to have default values
UPDATE packages 
SET description = COALESCE(description, 'Package description'), 
    package_type = COALESCE(package_type, 'time_based')
WHERE description IS NULL OR package_type IS NULL;

-- Display current packages table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'packages' 
ORDER BY ordinal_position;
