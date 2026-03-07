const { Client } = require('pg');

async function run() {
    const client = new Client({
        connectionString: 'postgres://postgres.pryoirzeghatrgecwrci:Lunnar%40q1w2@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
    });

    try {
        await client.connect();

        console.log("=== Top Queries by Time ===");
        const res1 = await client.query('SELECT substr(query, 1, 150) as query_preview, calls, total_time, mean_time, rows FROM pg_stat_statements ORDER BY total_time DESC LIMIT 5');
        console.table(res1.rows);

        console.log("=== Top Queries by Calls ===");
        const res2 = await client.query('SELECT substr(query, 1, 150) as query_preview, calls, total_time, mean_time, rows FROM pg_stat_statements ORDER BY calls DESC LIMIT 10');
        console.table(res2.rows);

    } catch (err) {
        if (err.message.includes('total_time')) {
            // PG13+ pg_stat_statements changed total_time to total_exec_time
            const res1 = await client.query('SELECT substr(query, 1, 150) as query_preview, calls, total_exec_time, mean_exec_time, rows FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 5');
            console.table(res1.rows);
            const res2 = await client.query('SELECT substr(query, 1, 150) as query_preview, calls, total_exec_time, mean_exec_time, rows FROM pg_stat_statements ORDER BY calls DESC LIMIT 10');
            console.table(res2.rows);
        } else {
            console.error('Error executing query', err);
        }
    } finally {
        await client.end();
    }
}

run();
