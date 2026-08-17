'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

export function Providers({ children }: { children: ReactNode }) {
  // Created in state so the client isn't shared across requests during SSR.
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          // Ops data changes under the operator constantly (riders moving,
          // orders arriving), so this refetches more eagerly than a
          // customer-facing app would.
          queries: { retry: 1, staleTime: 5_000, refetchOnWindowFocus: true },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
