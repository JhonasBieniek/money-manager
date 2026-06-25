import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { GuestGuard } from "./components/AuthGuard";
import { DashboardLayout } from "./layouts/DashboardLayout";
import { DashboardPage } from "./pages/DashboardPage";
import { EditTagPage } from "./pages/EditTagPage";
import { GoalsPage } from "./pages/GoalsPage";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
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
