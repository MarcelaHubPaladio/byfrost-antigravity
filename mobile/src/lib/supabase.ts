import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// We reuse the same fallback credentials as the web app for now.
// Note: In a production app, you might want to use process.env via Expo config.
const supabaseUrl = "https://pryoirzeghatrgecwrci.supabase.co";
const supabaseAnonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InByeW9pcnplZ2hhdHJnZWN3cmNpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njk2MTczMDEsImV4cCI6MjA4NTE5MzMwMX0.9QvX9jjzkWV_31fSueWENYQpVf_QPCVELiR3jpNgdMs";

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
