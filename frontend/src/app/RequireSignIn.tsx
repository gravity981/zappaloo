// Everything except the allowed pages needs a signed-in user (ACS-09): login, password reset,
// invitation redemption and the other public pages sit outside this guard. The server enforces
// the same rule for the API; this only sends visitors to the login page and back.
import { Navigate, Outlet, useLocation } from "react-router";
import { useSession } from "./session.ts";

export default function RequireSignIn() {
  const session = useSession();
  const location = useLocation();
  if (!session.ready) return null;
  if (!session.user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}
