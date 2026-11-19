import { lazy, Suspense, useEffect } from "react";
import { Outlet, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/Layout";
import { PageLoader } from "./components/ui";
import HomePage from "./pages/HomePage";
import PricingPage from "./pages/PricingPage";
import SubscribePage from "./pages/SubscribePage";
import RequestStatusPage, { RequestLookupPage } from "./pages/RequestStatusPage";
import LoginPage from "./pages/LoginPage";
import DashboardPage from "./pages/DashboardPage";
import NotFoundPage from "./pages/NotFoundPage";

// The PDF converter (pdf.js) and the admin panel are only downloaded when used.
const CreatePage = lazy(() => import("./pages/CreatePage"));
const AdminApp = lazy(() => import("./admin/AdminApp"));

function ScrollToTop() {
  const { pathname } = useLocation();
  // Block body on purpose: newer browsers make scrollTo() return a Promise,
  // which React would otherwise treat as the effect's clean-up function.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function SiteLayout() {
  return (
    <Layout>
      <Suspense fallback={<PageLoader />}>
        <Outlet />
      </Suspense>
    </Layout>
  );
}

/** Share links and one-time downloads are pages served by the server itself. */
function ServerPage() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.location.replace(pathname);
  }, [pathname]);
  return <PageLoader />;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route
          path="/admin/*"
          element={
            <Suspense fallback={<PageLoader />}>
              <AdminApp />
            </Suspense>
          }
        />
        <Route path="/v/*" element={<ServerPage />} />
        <Route path="/d/*" element={<ServerPage />} />
        <Route element={<SiteLayout />}>
          <Route index element={<HomePage />} />
          <Route path="create" element={<CreatePage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="subscribe/:planCode" element={<SubscribePage />} />
          <Route path="request" element={<RequestLookupPage />} />
          <Route path="request/:code" element={<RequestStatusPage />} />
          <Route path="login" element={<LoginPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </>
  );
}
