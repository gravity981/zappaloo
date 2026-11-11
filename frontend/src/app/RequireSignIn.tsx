// Everything except the allowed pages needs a signed-in user (ACS-09): login, password reset,
// invitation redemption and the other public pages sit outside this guard. The server enforces
// the same rule for the API; this only sends visitors to the login page and back.
//
// Until the admin has set the event up (CFG-02), an admin is sent to the setup in the admin
// area and everyone else sees the "not set up yet" page.
import { Navigate, Outlet, useLocation } from "react-router";
import NotSetUpPage from "../pages/NotSetUpPage.tsx";
import { useEvent } from "./event.ts";
import { useSession } from "./session.ts";

export default function RequireSignIn() {
  const session = useSession();
  const event = useEvent();
  const location = useLocation();
  if (!session.ready) return null;
  if (!session.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (event && !event.setupComplete) {
    if (!session.user.roles.includes("admin")) return <NotSetUpPage />;
    if (!location.pathname.startsWith("/admin")) return <Navigate to="/admin" replace />;
  }
  return <Outlet />;
}
