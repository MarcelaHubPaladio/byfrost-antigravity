import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pryoirzeghatrgecwrci.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2OTYxNzMwMSwiZXhwIjoyMDg1MTkzMzAxfQ.vJtrz5lWyGMiqXOkLhM6eqF-A_j2HNeXqwPOjDdMrks';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check401Logs() {
    console.log('Fetching recent 401 errors from wa_webhook_inbox...');

    const { data: webhooks, error: wErr } = await supabase
        .from('wa_webhook_inbox')
        .select('id, zapi_instance_id, reason, received_at, meta_json')
        .eq('http_status', 401)
        .order('received_at', { ascending: false })
        .limit(5);

    if (wErr) {
        console.error(wErr);
    } else if (webhooks && webhooks.length > 0) {
        webhooks.forEach(w => {
            console.log(`[${w.received_at}] Inst: ${w.zapi_instance_id} | Reason: ${w.reason} | Meta:`, JSON.stringify(w.meta_json));
        });
    } else {
        console.log('No recent 401 errors found in wa_webhook_inbox.');
    }
}

check401Logs();
