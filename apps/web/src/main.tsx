import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import {applyAppearance} from './appearance';
import './styles.css';
import './sizing.css';
import './appearance.css';
import './themes.css';
import './components/header-notifications.css';

applyAppearance();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter><App /></BrowserRouter>
  </React.StrictMode>
);
