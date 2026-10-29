import { createRoot } from 'react-dom/client';
import '@fontsource-variable/nunito';
import App from './App.jsx';
import './styles.css';

// As chamadas usam '/api/...'; sob um prefixo (/trilhas-app) elas precisam carregá-lo.
const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');
const nativeFetch = window.fetch.bind(window);
window.fetch = (u, ...rest) => nativeFetch(typeof u === 'string' && u.startsWith('/api/') ? BASE + u : u, ...rest);

createRoot(document.getElementById('root')).render(<App />);
