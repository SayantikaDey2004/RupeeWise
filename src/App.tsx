import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import FloatingSidebarLayout from '@/components/layouts/FloatingSidebarLayout';

import routes from './routes';

import { AuthProvider } from '@/contexts/AuthContext';
import { RealtimeProvider } from '@/contexts/RealtimeContext';
import { RouteGuard } from '@/components/common/RouteGuard';
import { Toaster } from '@/components/ui/toaster';

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <RealtimeProvider>
          <RouteGuard>
            <IntersectObserver />
            <Routes>
              {routes.map((route, index) => {
                // Landing and Login pages don't need layout
                if (route.path === '/login' || route.path === '/') {
                  return (
                    <Route
                      key={index}
                      path={route.path}
                      element={route.element}
                    />
                  );
                }

                // Payment app doesn't need FloatingSidebarLayout (has its own design)
                if (route.path === '/payment') {
                  return (
                    <Route
                      key={index}
                      path={route.path}
                      element={route.element}
                    />
                  );
                }

                // All other pages use FloatingSidebarLayout
                return (
                  <Route
                    key={index}
                    path={route.path}
                    element={<FloatingSidebarLayout>{route.element}</FloatingSidebarLayout>}
                  />
                );
              })}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <Toaster />
          </RouteGuard>
        </RealtimeProvider>
      </AuthProvider>
    </Router>
  );
};

export default App;
