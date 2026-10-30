'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { queryClient } from '@/config/queryClient.js';

export function Providers({ children }) {
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
