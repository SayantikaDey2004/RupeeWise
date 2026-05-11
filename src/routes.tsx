import Dashboard from './pages/Dashboard';
import Chat from './pages/Chat';
import IncomeSetup from './pages/IncomeSetup';
import BudgetSetup from './pages/BudgetSetup';
import DocumentUpload from './pages/DocumentUpload';
import Transactions from './pages/Transactions';
import Settings from './pages/Settings';
import Login from './pages/Login';
import PaymentApp from './pages/PaymentApp';
import Landing from './pages/Landing';
import type { ReactNode } from 'react';

interface RouteConfig {
  name: string;
  path: string;
  element: ReactNode;
  visible?: boolean;
}

const routes: RouteConfig[] = [
  {
    name: 'Landing',
    path: '/',
    element: <Landing />,
    visible: false
  },
  {
    name: 'Dashboard',
    path: '/dashboard',
    element: <Dashboard />
  },
  {
    name: 'Chat',
    path: '/chat',
    element: <Chat />
  },
  {
    name: 'Income Setup',
    path: '/income',
    element: <IncomeSetup />
  },
  {
    name: 'Budget Setup',
    path: '/budget',
    element: <BudgetSetup />
  },
  {
    name: 'Document Upload',
    path: '/documents',
    element: <DocumentUpload />
  },
  {
    name: 'Transactions',
    path: '/transactions',
    element: <Transactions />
  },
  {
    name: 'Payment App',
    path: '/payment',
    element: <PaymentApp />,
    visible: false
  },
  {
    name: 'Settings',
    path: '/settings',
    element: <Settings />
  },
  {
    name: 'Login',
    path: '/login',
    element: <Login />,
    visible: false
  }
];

export default routes;
