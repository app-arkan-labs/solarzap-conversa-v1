SELECT table_name, column_name 
FROM information_schema.columns 
WHERE table_schema = 'public' 
  AND (column_name ILIKE '%secret%' 
       OR column_name ILIKE '%token%' 
       OR column_name ILIKE '%api_key%' 
       OR column_name ILIKE '%apikey%')
ORDER BY table_name;
