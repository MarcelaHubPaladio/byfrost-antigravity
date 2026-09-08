import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pryoirzeghatrgecwrci.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data: inbox, error: inboxErr } = await supabase
    .from('wa_webhook_inbox')
    .select('id, received_at, reason, payload_json, ok, meta_json')
    .order('received_at', { ascending: false })
    .limit(3);

  console.log('Last 3 Webhook Logs:');
  console.log(JSON.stringify(inbox, null, 2));
  if (inboxErr) console.error('Error inbox:', inboxErr);

  const { data: contacts, error: contactsErr } = await supabase
    .from('wa_contacts')
    .select('id, phone_e164, name, role_hint, meta_json, updated_at')
    .ilike('phone_e164', '%@g.us%')
    .order('updated_at', { ascending: false })
    .limit(5);

  console.log('\nLast 5 Group Contacts:');
  console.log(JSON.stringify(contacts, null, 2));
  if (contactsErr) console.error('Error contacts:', contactsErr);
}

main();
