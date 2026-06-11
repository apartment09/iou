import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import './index.css';
import { RequireAuth } from './components/Layout.js';
import { LoginPage } from './pages/Login.js';
import { RegisterPage } from './pages/Register.js';
import { InviteAcceptPage } from './pages/InviteAccept.js';
import { DashboardPage } from './pages/Dashboard.js';
import { NewGroupPage } from './pages/NewGroup.js';
import { GroupPage } from './pages/Group.js';
import { ExpenseFormPage } from './pages/ExpenseForm.js';
import { SettleUpPage } from './pages/SettleUp.js';
import { GroupSettingsPage } from './pages/GroupSettings.js';
import { AdminUsersPage } from './pages/AdminUsers.js';
import { AccountPage } from './pages/Account.js';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10_000, // refetch-on-focus keeps balances fresh without spamming
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/invite/:token" element={<InviteAcceptPage />} />
          <Route
            path="/"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin/users"
            element={
              <RequireAuth>
                <AdminUsersPage />
              </RequireAuth>
            }
          />
          <Route
            path="/account"
            element={
              <RequireAuth>
                <AccountPage />
              </RequireAuth>
            }
          />
          <Route
            path="/groups/new"
            element={
              <RequireAuth>
                <NewGroupPage />
              </RequireAuth>
            }
          />
          <Route
            path="/groups/:groupId"
            element={
              <RequireAuth>
                <GroupPage />
              </RequireAuth>
            }
          />
          <Route
            path="/groups/:groupId/settings"
            element={
              <RequireAuth>
                <GroupSettingsPage />
              </RequireAuth>
            }
          />
          <Route
            path="/groups/:groupId/expenses/new"
            element={
              <RequireAuth>
                <ExpenseFormPage mode="new" />
              </RequireAuth>
            }
          />
          <Route
            path="/groups/:groupId/expenses/:expenseId/edit"
            element={
              <RequireAuth>
                <ExpenseFormPage mode="edit" />
              </RequireAuth>
            }
          />
          <Route
            path="/groups/:groupId/settle"
            element={
              <RequireAuth>
                <SettleUpPage />
              </RequireAuth>
            }
          />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
