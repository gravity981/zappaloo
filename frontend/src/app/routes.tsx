// Route table. Paths are placeholders until the website pages (stage 4) and the
// game world (stage 5) define the real structure.
import type { RouteObject } from "react-router";
import AdminHomePage from "../admin/AdminHomePage.tsx";
import AdminInvitationsPage from "../admin/AdminInvitationsPage.tsx";
import AdminLayout from "../admin/AdminLayout.tsx";
import AdminRsvpGuestPage from "../admin/AdminRsvpGuestPage.tsx";
import AdminRsvpPage from "../admin/AdminRsvpPage.tsx";
import AdminSettingsPage from "../admin/AdminSettingsPage.tsx";
import AdminUsersPage from "../admin/AdminUsersPage.tsx";
import ForgotPasswordPage from "../pages/ForgotPasswordPage.tsx";
import GamePage from "../pages/GamePage.tsx";
import HomePage from "../pages/HomePage.tsx";
import InvitePage from "../pages/InvitePage.tsx";
import LoginPage from "../pages/LoginPage.tsx";
import NotFoundPage from "../pages/NotFoundPage.tsx";
import ProfilePage from "../pages/ProfilePage.tsx";
import RsvpPage from "../pages/RsvpPage.tsx";
import SetPasswordPage from "../pages/SetPasswordPage.tsx";
import VerifyEmailPage from "../pages/VerifyEmailPage.tsx";
import Layout from "./Layout.tsx";
import RequireOpen from "./RequireOpen.tsx";
import RequireSignIn from "./RequireSignIn.tsx";
import Root from "./Root.tsx";

export const routes: RouteObject[] = [
  {
    element: <Root />,
    children: [
      {
        element: <Layout />,
        children: [
          // Reachable without sign-in (ACS-09). The privacy notice, upload-link pages and the
          // event screen join this list with their features.
          { path: "login", element: <LoginPage /> },
          { path: "forgot-password", element: <ForgotPasswordPage /> },
          { path: "set-password/:token", element: <SetPasswordPage /> },
          { path: "verify-email/:token", element: <VerifyEmailPage /> },
          { path: "invite", element: <InvitePage /> },
          { path: "invite/:code", element: <InvitePage /> },
          {
            // Everything else needs a signed-in user, also paths that do not exist.
            element: <RequireSignIn />,
            children: [
              { index: true, element: <HomePage /> },
              {
                // Pages of the open platform; guests wait at the front door until it opens.
                element: <RequireOpen />,
                children: [{ path: "game", element: <GamePage /> }],
              },
              { path: "profile", element: <ProfilePage /> },
              { path: "rsvp", element: <RsvpPage /> },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
      {
        // The admin area has its own shell (sw-architecture.md 8.3); each later step adds its page.
        element: <RequireSignIn />,
        children: [
          {
            path: "admin",
            element: <AdminLayout />,
            children: [
              { index: true, element: <AdminHomePage /> },
              { path: "invitations", element: <AdminInvitationsPage /> },
              { path: "rsvp", element: <AdminRsvpPage /> },
              { path: "rsvp/guests/:id", element: <AdminRsvpGuestPage /> },
              { path: "users", element: <AdminUsersPage /> },
              { path: "settings", element: <AdminSettingsPage /> },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
