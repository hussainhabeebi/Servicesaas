import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { App } from "./App";
import { LoginPage } from "./pages/Login";
import { TodayPage } from "./pages/Today";
import { LeadsPage } from "./pages/Leads";
import { CustomersPage } from "./pages/Customers";
import { BookingsPage } from "./pages/Bookings";
import { InvoicesPage } from "./pages/Invoices";
import { ServicesPage } from "./pages/Services";
import { WebsitePage } from "./pages/Website";
import { DomainPage } from "./pages/Domain";
import { StaffPage } from "./pages/Staff";
import { TeamPage } from "./pages/Team";
import { ConnectWhatsAppPage } from "./pages/ConnectWhatsApp";
import { TasksPage } from "./pages/Tasks";
import { ReportsPage } from "./pages/Reports";
import { BroadcastsPage } from "./pages/Broadcasts";
import { VendorBillsPage } from "./pages/VendorBills";
import { BillingPage } from "./pages/Billing";
import { MyJobsPage } from "./pages/MyJobs";
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
      <Routes>
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
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
