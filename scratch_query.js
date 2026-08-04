import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://pryoirzeghatrgecwrci.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs';

const supabase = createClient(supabaseUrl, supabaseKey);

async function main() {
  const { data, error } = await supabase
    .from('tenants')
    .select('id, name, slug, branding_json')
    .ilike('name', '%artur%');
    
  console.log('Tenants:', data);
  if (error) console.error('Error:', error);

  const { data: configs, error: err2 } = await supabase
    .from('beeia_configs')
    .select('*')
    .in('tenant_id', data?.map(t => t.id) || []);
    
  console.log('Configs:', configs);
  if (err2) console.error('Error 2:', err2);
}

main();
