import React from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from './config/queryClient.js';
import ReleaseTracker from './ReleaseTracker.jsx';
import { ClientDashboard } from './features/client/index.jsx';

// Public, read-only client portal: jumptest.app/?client=<token>
const clientToken = new URLSearchParams(window.location.search).get('client');

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {clientToken ? <ClientDashboard token={clientToken} /> : <ReleaseTracker />}
    </QueryClientProvider>
  </React.StrictMode>
);
