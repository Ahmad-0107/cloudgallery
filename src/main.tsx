import React from 'react';
import ReactDOM from 'react-dom/client';
import { Amplify } from 'aws-amplify';
import './styles.css';
import outputs from '../amplify_outputs.json';
import App from './App';

Amplify.configure({
  ...outputs,
  API: { ...outputs.API, REST: outputs.custom.API },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
