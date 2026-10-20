import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startAuth } from './lib/sync.ts';
import './styles.css';

startAuth();
createRoot(document.getElementById('root')!).render(<App />);
