
import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Client } = pg;

const client = new Client({
    connectionString: 'postgresql://postgres:postgres@localhost:54322/postgres',
});

async function applyMigration() {
    try {
        await client.connect();
        console.log('Connected to database.');

        const migrationPath = path.join(__dirname, '../supabase/migrations/20260205_ai_system_schema.sql');
        const sql = fs.readFileSync(migrationPath, 'utf8');

        console.log('Applying migration...');
        await client.query(sql);
        console.log('Migration applied successfully.');

    } catch (err) {
        console.error('Error applying migration:', err);
    } finally {
        await client.end();
    }
}

applyMigration();
