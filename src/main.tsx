import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Legacy UI requests and the versioned API share the same explicit API key.
// Keep the key only in this browser tab; never bake credentials into the bundle.
const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init: RequestInit = {}) => {
  const key = window.sessionStorage.getItem('mapscrape_api_key') || '';
  const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  if (key && !headers.has('Authorization')) headers.set('Authorization', `Bearer ${key}`);
  return nativeFetch(input, { ...init, headers });
};

createRoot(document.getElementById('root')!).render(<App />);
