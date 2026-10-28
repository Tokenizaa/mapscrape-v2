import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client for authentication
let supabase: any = null;

try {
  const supabaseUrl = process.env.SUPABASE_DIRECT_CONNECTION?.trim();
  const supabaseAnonKey = process.env.SUPABASE_ACCESS_TOKEN?.trim();
  
  if (supabaseUrl && supabaseAnonKey) {
    supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: true,
        detectSessionInUrl: false,
      },
    });
  }
} catch (e) {
  console.error('Supabase client initialization error:', e);
}

const nativeFetch = window.fetch.bind(window);

// If Supabase is available, use it for session management
if (supabase) {
  // Subscribe to auth changes to keep session in sync
  supabase.auth.onAuthStateChange((event: string, session: any) => {
    if (session?.user?.id) {
      // Store the Supabase user ID in sessionStorage for fallback
      window.sessionStorage.setItem('mapscrape_user_id', session.user.id);
      window.sessionStorage.setItem('mapscrape_user_email', session.user.email || '');
    } else {
      // Clear session storage on sign out
      window.sessionStorage.removeItem('mapscrape_user_id');
      window.sessionStorage.removeItem('mapscrape_user_email');
    }
  });
  
  // Initialize session - try to restore from Supabase
  supabase.auth.getSession().then(({ data, error }) => {
    if (data?.session?.user?.id) {
      window.sessionStorage.setItem('mapscrape_user_id', data.session.user.id);
      window.sessionStorage.setItem('mapscrape_user_email', data.session.user.email || '');
    }
  });
}

window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  let headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  
  // Add Authorization token if we have a Supabase session
  const token = window.sessionStorage.getItem('mapscrape_session_token');
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  
  return nativeFetch(input, { ...init, headers, cache: init.cache || 'no-store' });
};

createRoot(document.getElementById('root')!).render(<App />);