const https = require('https');

const data = JSON.stringify({
    query: "SELECT substr(query, 1, 150) as query_preview, calls, total_time, mean_time, rows FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;"
});

const options = {
    hostname: 'api.supabase.com',
    port: 443,
    path: '/v1/projects/pryoirzeghatrgecwrci/query',
    method: 'POST',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer sbp_66285de0439cf35900e7006a993d10a0a88ed8ab'
    }
};

const req = https.request(options, res => {
    let responseBody = '';
    res.on('data', chunk => {
        responseBody += chunk;
    });

    res.on('end', () => {
        console.log(`Status: ${res.statusCode}`);
        try {
            const parsed = JSON.parse(responseBody);
            console.log('Response:');
            console.table(parsed);
        } catch (e) {
            console.log('Raw body:', responseBody);
        }
    });
});

req.on('error', error => {
    console.error(error);
});

req.write(data);
req.end();
