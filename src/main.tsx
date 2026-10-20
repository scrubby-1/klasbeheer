import { createRoot } from 'react-dom/client';
import { App } from './App.tsx';
import { startSync } from './lib/sync.ts';
import './styles.css';

startSync();
createRoot(document.getElementById('root')!).render(<App />);
