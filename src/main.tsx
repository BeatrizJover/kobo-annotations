import { render } from 'preact';
import { registerSW } from 'virtual:pwa-register';
import { createIdbStore } from './store/db';
import { App } from './ui/App';
import { UpdateBanner, type RegisterUpdates } from './ui/UpdateBanner';
import { loadInWorker } from './worker/client';
import './styles/theme.css';
import './ui/app.css';

const registerUpdates: RegisterUpdates = (onUpdate) => {
  const updateSW = registerSW({ onNeedRefresh: () => onUpdate(() => void updateSW(true)) });
};

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app root element');
render(
  <>
    <UpdateBanner register={registerUpdates} />
    <App load={loadInWorker} store={createIdbStore()} />
  </>,
  root,
);
