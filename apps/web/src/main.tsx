import InstallPrompt from './components/InstallPrompt';
import './brand-storage';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import {applyAppearance} from './appearance';
import './styles.css';
import './sizing.css';
import './appearance.css';
import './themes.css';
import './brand-icons.css';
import './components/header-notifications.css';
import './components/pagination.css';
import './iclusters-brand.css';
import './viewport.css';
import './components/ssh-dialog.css';

applyAppearance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter><App /><InstallPrompt/></BrowserRouter>
  </React.StrictMode>
);

import './components/distribution-summary.css';

import './components/cluster-topology.css';

import './components/VmCreateWizard.css';

import './connection-notice.css';

import './responsive-layout.css';

if ('serviceWorker' in navigator && window.isSecureContext) {
 window.addEventListener('load',()=>{void navigator.serviceWorker.register('/sw.js',{updateViaCache:'none'}).catch(()=>{/* Installation remains available through the browser menu. */});});
}
