// Pages of the open platform (the game world, later the website): while the platform is closed,
// guests are sent to the waiting page (ACS-10).
import { Navigate, Outlet } from "react-router";
import { useRestricted } from "./restricted.ts";

export default function RequireOpen() {
  const restricted = useRestricted();
  return restricted ? <Navigate to="/" replace /> : <Outlet />;
}
