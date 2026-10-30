'use client';

import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import ReleaseTracker from '@/ReleaseTracker.jsx';
import { ClientDashboard } from '@features/client/index.jsx';

function AppRouteInner() {
  const searchParams = useSearchParams();
  const clientToken = searchParams.get('client');

  if (clientToken) {
    return (
      <div className="app-root" id="root">
        <ClientDashboard token={clientToken} />
      </div>
    );
  }

  return (
    <div className="app-root" id="root">
      <ReleaseTracker />
    </div>
  );
}

export default function AppRoutePage() {
  return (
    <Suspense fallback={<div className="app-root" id="root" />}>
      <AppRouteInner />
    </Suspense>
  );
}
