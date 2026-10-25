import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
const LoginPage = lazy(() => import("./pages/Login").then(m => ({ default: m.LoginPage })));
const TodayPage = lazy(() => import("./pages/Today").then(m => ({ default: m.TodayPage })));
const LeadsPage = lazy(() => import("./pages/Leads").then(m => ({ default: m.LeadsPage })));
const CustomersPage = lazy(() => import("./pages/Customers").then(m => ({ default: m.CustomersPage })));
const BookingsPage = lazy(() => import("./pages/Bookings").then(m => ({ default: m.BookingsPage })));
const InvoicesPage = lazy(() => import("./pages/Invoices").then(m => ({ default: m.InvoicesPage })));
const ServicesPage = lazy(() => import("./pages/Services").then(m => ({ default: m.ServicesPage })));
const WebsitePage = lazy(() => import("./pages/Website").then(m => ({ default: m.WebsitePage })));
const DomainPage = lazy(() => import("./pages/Domain").then(m => ({ default: m.DomainPage })));
const StaffPage = lazy(() => import("./pages/Staff").then(m => ({ default: m.StaffPage })));
const TeamPage = lazy(() => import("./pages/Team").then(m => ({ default: m.TeamPage })));
const ConnectWhatsAppPage = lazy(() => import("./pages/ConnectWhatsApp").then(m => ({ default: m.ConnectWhatsAppPage })));
const TasksPage = lazy(() => import("./pages/Tasks").then(m => ({ default: m.TasksPage })));
const ReportsPage = lazy(() => import("./pages/Reports").then(m => ({ default: m.ReportsPage })));
const BroadcastsPage = lazy(() => import("./pages/Broadcasts").then(m => ({ default: m.BroadcastsPage })));
const VendorBillsPage = lazy(() => import("./pages/VendorBills").then(m => ({ default: m.VendorBillsPage })));
const BillingPage = lazy(() => import("./pages/Billing").then(m => ({ default: m.BillingPage })));
const MyJobsPage = lazy(() => import("./pages/MyJobs").then(m => ({ default: m.MyJobsPage })));
import { setToken } from "./api";

// Landing page hands off a fresh JWT via ?token=... after signup/login,
// since localStorage doesn't cross the servbazaar.com -> app.servbazaar.com
// origin boundary. Adopt it once, then scrub it from the URL.
const handoffToken = new URLSearchParams(window.location.search).get("token");
if (handoffToken) {
  setToken(handoffToken);
  window.history.replaceState({}, "", window.location.pathname);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Suspense fallback={<p role="status" style={{ padding: 24 }}>Loading…</p>}><Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<App />}>
          <Route index element={<TodayPage />} />
          <Route path="leads" element={<LeadsPage />} />
          <Route path="customers" element={<CustomersPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="invoices" element={<InvoicesPage />} />
          <Route path="services" element={<ServicesPage />} />
          <Route path="website" element={<WebsitePage />} />
          <Route path="domain" element={<DomainPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="team" element={<TeamPage />} />
          <Route path="whatsapp" element={<ConnectWhatsAppPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="broadcasts" element={<BroadcastsPage />} />
          <Route path="vendor-bills" element={<VendorBillsPage />} />
          <Route path="billing" element={<BillingPage />} />
          <Route path="my-jobs" element={<MyJobsPage />} />
        </Route>
      </Routes></Suspense>
    </BrowserRouter>
  </React.StrictMode>
);
