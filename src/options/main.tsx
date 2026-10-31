import { createRoot } from 'react-dom/client';
import { OptionsApp } from './OptionsApp';
import './options.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Missing #root');

createRoot(rootElement).render(<OptionsApp />);
