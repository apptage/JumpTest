import React from 'react';
import { createRoot } from 'react-dom/client';
import ReleaseTracker, { ClientDashboard } from './ReleaseTracker.jsx';

// Public, read-only client portal: jumptest.app/?client=<token>
const clientToken = new URLSearchParams(window.location.search).get('client');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    {clientToken ? <ClientDashboard token={clientToken} /> : <ReleaseTracker />}
  </React.StrictMode>
);
