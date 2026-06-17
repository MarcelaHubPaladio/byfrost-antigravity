const { Client } = require('pg');
async function run() {
    const client = new Client({ connectionString: 'postgres://postgres.pryoirzeghatrgecwrci:Lunnar%40q1w2@aws-0-sa-east-1.pooler.supabase.com:6543/postgres' });
    await client.connect();
    const res = await client.query(`SELECT pg_get_constraintdef(c.oid) AS constraint_def FROM pg_constraint c WHERE c.conname = 'cases_status_check';`);
    console.log(res.rows[0]);
    await client.end();
}
run();
