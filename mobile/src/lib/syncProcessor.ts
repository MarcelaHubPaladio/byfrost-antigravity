import { supabase } from './supabase';
import { SyncJob } from './SyncEngine';

/**
 * This function processes a single queued job.
 * It is called by the SyncEngine when the network is available.
 */
export const processSyncJob = async (job: SyncJob): Promise<void> => {
  console.log(`[SyncProcessor] Starting job ${job.id} of type ${job.type}`);
  
  if (job.type === 'order') {
    const { payload } = job;
    
    // 0. Upsert Customer if it's not provided with an ID
    let customerId = payload.case.customer_id;
    if (!customerId && payload.customer) {
      const { data: customer, error: custErr } = await supabase
        .from('customer_accounts')
        .upsert({
          tenant_id: payload.customer.tenant_id,
          name: payload.customer.name,
          phone_e164: payload.customer.phone_e164,
        }, { onConflict: 'tenant_id,phone_e164' })
        .select('id')
        .single();
      
      if (custErr) throw custErr;
      customerId = customer.id;
      payload.case.customer_id = customerId; // Attach the created ID to the case
    }

    // 1. Insert the main case (order)
    const { data: caseData, error: caseError } = await supabase
      .from('cases')
      .insert(payload.case)
      .select('id')
      .single();

    if (caseError) throw caseError;
    
    const newCaseId = caseData.id;

    // 2. Map the new Case ID to the dependent inserts
    if (payload.case_fields && payload.case_fields.length > 0) {
      const mappedFields = payload.case_fields.map((f: any) => ({ ...f, case_id: newCaseId }));
      const { error: fieldsError } = await supabase.from('case_fields').insert(mappedFields);
      if (fieldsError) throw fieldsError;
    }

    if (payload.case_items && payload.case_items.length > 0) {
      const mappedItems = payload.case_items.map((i: any) => ({ ...i, case_id: newCaseId }));
      const { error: itemsError } = await supabase.from('case_items').insert(mappedItems);
      if (itemsError) throw itemsError;
    }

    if (payload.timeline_events && payload.timeline_events.length > 0) {
      const mappedEvents = payload.timeline_events.map((e: any) => {
        const ev = { ...e, case_id: newCaseId };
        
        // Inject geolocation into timeline event if available
        if (job.lat && job.lng) {
          ev.meta_json = { 
            ...(ev.meta_json || {}), 
            offline_sync: true,
            location: { lat: job.lat, lng: job.lng } 
          };
        }
        return ev;
      });
      const { error: eventsError } = await supabase.from('timeline_events').insert(mappedEvents);
      if (eventsError) throw eventsError;
    }

    console.log(`[SyncProcessor] Order job ${job.id} successfully synced (New Case ID: ${newCaseId})`);
  } else {
    throw new Error(`Unsupported job type: ${job.type}`);
  }
};
