import { lazy, Suspense, useEffect, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router';
import { ApiError } from './lib/api';
import { useMe } from './lib/data';
import { redirectToZamilLogin } from './lib/zamil-login';
import { AppShell } from './components/shell';
import { Spinner, StartupLoading } from './components/ui';
import { ChangePasswordPage, LoginPage } from './pages/auth';

const Dashboard = lazy(() => import('./pages/dashboard'));
const Catalog = lazy(() => import('./pages/catalog'));
const Calendar = lazy(() => import('./pages/calendar'));
const NewRequest = lazy(() => import('./pages/new-request'));
const MyRequests = lazy(() => import('./pages/requests'));
const RequestDetail = lazy(() => import('./pages/request-detail'));
const MySkills = lazy(() => import('./pages/skills'));
const Assessments = lazy(() => import('./pages/assessments'));
const Approvals = lazy(() => import('./pages/approvals'));
const Team = lazy(() => import('./pages/team'));
const Jsm = lazy(() => import('./pages/jsm'));
const Attendance = lazy(() => import('./pages/attendance'));
const Exams = lazy(() => import('./pages/exams'));
const Sessions = lazy(() => import('./pages/sessions'));
const Setup = lazy(() => import('./pages/setup'));
const Reports = lazy(() => import('./pages/reports'));
const Audit = lazy(() => import('./pages/audit'));

export function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const backgroundLocation = (location.state as { backgroundLocation?: typeof location } | null)
    ?.backgroundLocation;
  const me = useMe();

  const wasSignedIn = useRef(false);
  useEffect(() => {
    if (me.data) wasSignedIn.current = true;
  }, [me.data]);

  const sessionExpired =
    wasSignedIn.current && me.isError && me.error instanceof ApiError && me.error.status === 401;
  useEffect(() => {
    if (sessionExpired) redirectToZamilLogin();
  }, [sessionExpired]);

  if (sessionExpired) return <StartupLoading />;
  if (me.isPending) return <StartupLoading />;
  if (me.error) {
    if (me.error instanceof ApiError && me.error.status === 401) return <LoginPage />;
    return <LoginPage notice={me.error.message} />;
  }
  if (me.data.mustChangePassword) return <ChangePasswordPage forced />;
  return (
    <AppShell me={me.data}>
      <Suspense fallback={<Spinner />}>
        <Routes location={backgroundLocation || location}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/catalog" element={<Catalog />} />
          <Route path="/calendar" element={<Calendar />} />
          <Route path="/new" element={<NewRequest />} />
          <Route path="/requests" element={<MyRequests />} />
          <Route path="/requests/:id" element={<RequestDetail />} />
          <Route path="/skills" element={<MySkills />} />
          <Route path="/assessments" element={<Assessments />} />
          <Route path="/approvals" element={<Approvals />} />
          <Route path="/team" element={<Team />} />
          <Route path="/jsm" element={<Jsm />} />
          <Route path="/attendance" element={<Attendance />} />
          <Route path="/exams" element={<Exams />} />
          <Route path="/sessions" element={<Sessions />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/reports" element={<Reports />} />
          <Route path="/audit" element={<Audit />} />
          <Route path="/password" element={<ChangePasswordPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        {backgroundLocation && (
          <Routes>
            <Route path="/requests/:id" element={<RequestDetail drawer onClose={() => navigate(-1)} />} />
          </Routes>
        )}
      </Suspense>
    </AppShell>
  );
}
