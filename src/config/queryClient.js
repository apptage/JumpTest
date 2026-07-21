import { QueryClient } from '@tanstack/react-query';

/* Single app-wide query client. Server state (Supabase reads) lives here;
   client state (modals, filters, forms) stays in component useState. */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // avoid aggressive refetch on tab switch
      retry: 1,
      staleTime: 30_000,
    },
  },
});

