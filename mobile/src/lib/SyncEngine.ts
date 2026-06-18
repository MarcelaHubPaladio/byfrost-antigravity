import AsyncStorage from '@react-native-async-storage/async-storage';

const QUEUE_KEY = '@byfrost_sync_queue';

export type SyncJob = {
  id: string;
  type: 'order' | 'crm';
  payload: any; // The full data required to sync
  lat?: number;
  lng?: number;
  status: 'pending' | 'failed';
  errorReason?: string;
  createdAt: string;
};

// Generate a simple unique ID
const generateId = () => {
  return Date.now().toString(36) + Math.random().toString(36).substring(2);
};

export const SyncEngine = {
  /**
   * Enqueues a new job to be synchronized later.
   */
  enqueueJob: async (type: SyncJob['type'], payload: any, lat?: number, lng?: number): Promise<SyncJob> => {
    const job: SyncJob = {
      id: generateId(),
      type,
      payload,
      lat,
      lng,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      const queue = await SyncEngine.getQueue();
      queue.push(job);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
      console.log(`[SyncEngine] Queued new job: ${job.id}`);
      return job;
    } catch (error) {
      console.error('[SyncEngine] Error enqueueing job', error);
      throw error;
    }
  },

  /**
   * Retrieves the current queue.
   */
  getQueue: async (): Promise<SyncJob[]> => {
    try {
      const raw = await AsyncStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (error) {
      console.error('[SyncEngine] Error reading queue', error);
      return [];
    }
  },

  /**
   * Removes a job from the queue.
   */
  removeJob: async (id: string): Promise<void> => {
    try {
      const queue = await SyncEngine.getQueue();
      const newQueue = queue.filter(job => job.id !== id);
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
    } catch (error) {
      console.error(`[SyncEngine] Error removing job ${id}`, error);
    }
  },

  /**
   * Updates the status of a job (e.g., to 'failed').
   */
  updateJobStatus: async (id: string, status: 'pending' | 'failed', errorReason?: string): Promise<void> => {
    try {
      const queue = await SyncEngine.getQueue();
      const newQueue = queue.map(job => 
        job.id === id ? { ...job, status, errorReason } : job
      );
      await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(newQueue));
    } catch (error) {
      console.error(`[SyncEngine] Error updating job ${id}`, error);
    }
  },

  /**
   * Gets the count of pending and failed jobs.
   */
  getPendingCount: async (): Promise<number> => {
    const queue = await SyncEngine.getQueue();
    return queue.length; // Returns all jobs (pending and failed)
  },

  /**
   * Main processing loop to sync items with Supabase.
   * Note: The actual processing logic (the "how") needs to be injected
   * or imported so it can use the Supabase client.
   */
  processQueue: async (processorCallback: (job: SyncJob) => Promise<void>): Promise<void> => {
    const queue = await SyncEngine.getQueue();
    if (queue.length === 0) return;

    console.log(`[SyncEngine] Processing queue of ${queue.length} items...`);
    
    for (const job of queue) {
      try {
        console.log(`[SyncEngine] Processing job ${job.id} (${job.type})`);
        
        // Let the callback handle the actual API calls to Supabase
        await processorCallback(job);
        
        // If successful, remove from queue
        await SyncEngine.removeJob(job.id);
        console.log(`[SyncEngine] Job ${job.id} synchronized and removed.`);
      } catch (error: any) {
        console.error(`[SyncEngine] Failed to process job ${job.id}:`, error);
        // Update job status so we know it failed
        await SyncEngine.updateJobStatus(job.id, 'failed', error?.message || 'Unknown error');
      }
    }
    console.log(`[SyncEngine] Queue processing finished.`);
  }
};
