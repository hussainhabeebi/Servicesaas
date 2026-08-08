import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { LoginPage } from "./pages/Login";
import { TenantsPage } from "./pages/Tenants";
import { TenantDetailPage } from "./pages/TenantDetail";
import { StatsPage } from "./pages/Stats";
import { AdminsPage } from "./pages/Admins";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<App />}>
          <Route index element={<StatsPage />} />
          <Route path="tenants" element={<TenantsPage />} />
          <Route path="tenants/:id" element={<TenantDetailPage />} />
          <Route path="admins" element={<AdminsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
