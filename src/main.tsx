import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Brand manual typography: Plus Jakarta Sans for the interface, JetBrains Mono for data (self-hosted, no font CDN)
import '@fontsource/plus-jakarta-sans/400.css';
import '@fontsource/plus-jakarta-sans/400-italic.css';
import '@fontsource/plus-jakarta-sans/600.css';
import '@fontsource/plus-jakarta-sans/700.css';
import '@fontsource/plus-jakarta-sans/800.css';
import '@fontsource/jetbrains-mono/400.css';
import '@fontsource/jetbrains-mono/500.css';
import '@fontsource/jetbrains-mono/600.css';
import './styles.css';
import { App } from './App';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
