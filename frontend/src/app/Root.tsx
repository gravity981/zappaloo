// The providers every page needs: the signed-in user and the event. The site layout and the
// admin area (sw-architecture.md 8.3) sit below it, each with its own shell.
import { Outlet } from "react-router";
import { AppTitle } from "./AppTitle.tsx";
import { EventProvider } from "./EventProvider.tsx";
import { SessionProvider } from "./SessionProvider.tsx";
import { UpdateWatcher } from "./UpdateWatcher.tsx";

export default function Root() {
  return (
    <SessionProvider>
      <EventProvider>
        <AppTitle />
        <UpdateWatcher />
        <Outlet />
      </EventProvider>
    </SessionProvider>
  );
}
