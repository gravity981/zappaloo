// The providers every page needs: the signed-in user and the event. The site layout and the
// admin area (sw-architecture.md 8.3) sit below it, each with its own shell.
import { Outlet } from "react-router";
import { EventProvider } from "./EventProvider.tsx";
import { SessionProvider } from "./SessionProvider.tsx";

export default function Root() {
  return (
    <SessionProvider>
      <EventProvider>
        <Outlet />
      </EventProvider>
    </SessionProvider>
  );
}
