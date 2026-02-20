import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pryoirzeghatrgecwrci.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYxNzMwMSwiZXhwIjoyMDg1MTkzMzAxfQ.vJtrz5lWyGMiqXOkLhM6eqF-A_j2HNeXqwPOjDdMrks';

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkStats() {
    const { data: allLogs } = await supabase
        .from('wa_webhook_inbox')
        .select('http_status, created_at, received_at')
        .order('received_at', { ascending: false })
        .limit(100);

    const stats = (allLogs || []).reduce((acc, l) => {
        acc[l.http_status] = (acc[l.http_status] || 0) + 1;
        return acc;
    }, {});

    console.log('HTTP Status stats (last 100):', stats);
    if (allLogs?.length) {
        console.log('Last webhook received at:', allLogs[0].received_at);
    }
}

checkStats();
