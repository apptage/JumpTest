import React from 'react';
import { createRoot } from 'react-dom/client';
import ReleaseTracker from './ReleaseTracker.jsx';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ReleaseTracker />
  </React.StrictMode>
);
