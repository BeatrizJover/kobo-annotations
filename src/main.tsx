import { render } from 'preact';
import { App } from './ui/App';
import { loadInWorker } from './worker/client';
import './styles/theme.css';
import './ui/app.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
render(<App load={loadInWorker} />, root);
