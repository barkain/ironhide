import React, { Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Layout } from './components/layout/Layout';
import { PageLoadingSpinner } from './components/ui/PageLoadingSpinner';
import { preloadAllSessions } from './lib/tauri';

// Lazy load all page components for code splitting
const Dashboard = React.lazy(() => import('./pages/Dashboard'));
const Sessions = React.lazy(() => import('./pages/Sessions'));
const SessionDetail = React.lazy(() => import('./pages/SessionDetail'));
const TurnDetail = React.lazy(() => import('./pages/TurnDetail'));
const Trends = React.lazy(() => import('./pages/Trends'));
const Compare = React.lazy(() => import('./pages/Compare'));
const Settings = React.lazy(() => import('./pages/Settings'));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 30, // 30 minutes cache retention
      retry: 1,
    },
  },
});

// Preload sessions on app startup (outside component to run once)
let preloadStarted = false;
function startPreload() {
  if (preloadStarted) return;
  preloadStarted = true;

  preloadAllSessions()
    .then((count) => {
      console.log(`Session preload complete: ${count} sessions cached`);
    })
    .catch((error) => {
      console.warn('Session preload failed:', error);
    });
}

function App() {
  // Trigger preload on mount
  useEffect(() => {
    startPreload();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Suspense fallback={<PageLoadingSpinner />}>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
              <Route path="sessions" element={<Sessions />} />
              <Route path="sessions/:id" element={<SessionDetail />} />
              <Route path="sessions/:id/turns/:turnNumber" element={<TurnDetail />} />
              <Route path="trends" element={<Trends />} />
              <Route path="compare" element={<Compare />} />
              <Route path="compare/:sessionIds" element={<Compare />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Suspense>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
