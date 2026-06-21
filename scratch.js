import pg from 'pg'
const { Client } = pg

const client = new Client({
  connectionString: 'postgres://postgres:Lunnar@q1w2@db.pryoirzeghatrgecwrci.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
})

async function run() {
  await client.connect()
  console.log('Connected!')
  const sql = `
DROP FUNCTION IF EXISTS public.get_public_m30_case(uuid);
CREATE OR REPLACE FUNCTION public.get_public_m30_case(p_token uuid)
RETURNS TABLE (
    id uuid,
    title text,
    summary_text text,
    meta_json jsonb,
    state text,
    journey_name text,
    customer_name text,
    tenant_id uuid
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id,
        c.title,
        c.summary_text,
        c.meta_json,
        c.state,
        (SELECT j.name FROM public.journeys j WHERE j.id = c.journey_id),
        (c.meta_json->>'customer_entity_name')::text,
        c.tenant_id
    FROM public.cases c
    WHERE c.share_token = p_token
      AND c.deleted_at IS NULL;
END;
$$;
  `
  await client.query(sql)
  console.log('RPC Updated successfully!')
  await client.end()
}

run().catch(console.error)
