-- Check columns in appointments table to see if we have 'assigned_to'
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'appointments';

-- Check profiles or users table for role information
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND (table_name LIKE '%prof%' OR table_name LIKE '%user%');

-- If profiles exists, check its columns
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles';
