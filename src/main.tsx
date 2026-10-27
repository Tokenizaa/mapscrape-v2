import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Authenticated platform sessions take precedence; API keys remain for external integrations.
// Credentials stay in sessionStorage and are never embedded in the application bundle.
const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const key = window.sessionStorage.getItem('mapscrape_session_token') || window.sessionStorage.getItem('mapscrape_api_key') || '';
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  if (key && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${key}`);
  return nativeFetch(input, { ...init, headers });
};

createRoot(document.getElementById('root')!).render(<App />);
