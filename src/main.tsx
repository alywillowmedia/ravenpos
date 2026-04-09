import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import { initializeTheme } from './lib/theme';

// Use HashRouter for Electron (file:// protocol), BrowserRouter for web
const isElectron = typeof window !== 'undefined' && (
    window.electronAPI?.isElectron === true ||
    window.location.protocol === 'file:'
);
const Router = isElectron ? HashRouter : BrowserRouter;

initializeTheme();

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Router>
            <App />
        </Router>
    </StrictMode>
);
