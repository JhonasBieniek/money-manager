import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GuestGuard } from "./components/AuthGuard";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { EditTagPage } from "./pages/EditTagPage";
import { EditExpensePage } from "./pages/EditExpensePage";
import { EditIncomePage } from "./pages/EditIncomePage";
import { ExpensesPage } from "./pages/ExpensesPage";
import { GoalsPage } from "./pages/GoalsPage";
import { IncomesPage } from "./pages/IncomesPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { NewExpensePage } from "./pages/NewExpensePage";
import { NewIncomePage } from "./pages/NewIncomePage";
import { NewSubTagPage } from "./pages/NewSubTagPage";
import { NewTagPage } from "./pages/NewTagPage";
import { RegisterPage } from "./pages/RegisterPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TagsPage } from "./pages/TagsPage";

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route
          path="/login"
          element={
            <GuestGuard>
              <LoginPage />
            </GuestGuard>
          }
        />
        <Route
          path="/register"
          element={
            <GuestGuard>
              <RegisterPage />
            </GuestGuard>
          }
        />
        <Route path="/dashboard" element={<DashboardLayout />}>
          <Route index element={<DashboardPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="goals" element={<GoalsPage />} />
          <Route path="expenses" element={<ExpensesPage />} />
          <Route path="expenses/new" element={<NewExpensePage />} />
          <Route path="expenses/:id/edit" element={<EditExpensePage />} />
          <Route path="incomes" element={<IncomesPage />} />
          <Route path="incomes/new" element={<NewIncomePage />} />
          <Route path="incomes/:id/edit" element={<EditIncomePage />} />
          <Route path="tags" element={<TagsPage />} />
          <Route path="tags/new" element={<NewTagPage />} />
          <Route path="tags/:parentId/sub/new" element={<NewSubTagPage />} />
          <Route path="tags/:id/edit" element={<EditTagPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
