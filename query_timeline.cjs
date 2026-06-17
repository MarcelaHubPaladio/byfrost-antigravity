const { Client } = require('pg');
async function run() {
    const client = new Client({ connectionString: 'postgres://postgres.pryoirzeghatrgecwrci:Lunnar%40q1w2@aws-0-sa-east-1.pooler.supabase.com:6543/postgres' });
    await client.connect();
    const res = await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'timeline_events'`);
    console.table(res.rows);
    await client.end();
}
run();
