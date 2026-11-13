// Route table. Paths are placeholders until the website pages (stage 4) and the
// game world (stage 5) define the real structure.
import type { RouteObject } from "react-router";
import AdminHomePage from "../admin/AdminHomePage.tsx";
import AdminInvitationsPage from "../admin/AdminInvitationsPage.tsx";
import AdminLayout from "../admin/AdminLayout.tsx";
import AdminContentPage from "../admin/AdminContentPage.tsx";
import ContentPageEditor from "../admin/ContentPageEditor.tsx";
import ContentPlaceEditor from "../admin/ContentPlaceEditor.tsx";
import AdminRsvpGuestPage from "../admin/AdminRsvpGuestPage.tsx";
import AdminRsvpPage from "../admin/AdminRsvpPage.tsx";
import AdminSettingsPage from "../admin/AdminSettingsPage.tsx";
import AdminUsersPage from "../admin/AdminUsersPage.tsx";
import ForgotPasswordPage from "../pages/ForgotPasswordPage.tsx";
import GamePage from "../pages/GamePage.tsx";
import HomePage from "../pages/HomePage.tsx";
import InstallPage from "../pages/InstallPage.tsx";
import InvitePage from "../pages/InvitePage.tsx";
import LicensePage from "../pages/LicensePage.tsx";
import LoginPage from "../pages/LoginPage.tsx";
import NotFoundPage from "../pages/NotFoundPage.tsx";
import PrivacyPage from "../pages/PrivacyPage.tsx";
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
        children: [
          // Reachable without sign-in (ACS-09), each page in the frame of the mock (the bare
          // frame). Upload-link pages and the event screen join this list with their features.
          { path: "login", element: <LoginPage /> },
          { path: "forgot-password", element: <ForgotPasswordPage /> },
          { path: "set-password/:token", element: <SetPasswordPage /> },
          { path: "verify-email/:token", element: <VerifyEmailPage /> },
          { path: "datenschutz", element: <PrivacyPage /> },
          { path: "license", element: <LicensePage /> },
          { path: "invite", element: <InvitePage /> },
          { path: "invite/:code", element: <InvitePage /> },
          {
            // Everything else needs a signed-in user, also paths that do not exist.
            element: <RequireSignIn />,
            children: [
              // The RSVP is a flow of its own, without the page header.
              { path: "rsvp", element: <RsvpPage /> },
              // Add to the home screen: a flow of its own, like the RSVP (PWA-05).
              { path: "install", element: <InstallPage /> },
              {
                element: <Layout />,
                children: [
                  { index: true, element: <HomePage /> },
                  {
                    // Pages of the open platform; guests wait at the front door until it opens.
                    element: <RequireOpen />,
                    children: [{ path: "game", element: <GamePage /> }],
                  },
                  { path: "profile", element: <ProfilePage /> },
                  { path: "*", element: <NotFoundPage /> },
                ],
              },
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
              {
                // Inhalte: the list, and the editors of a page and of a place (UX mock admin-content).
                path: "content",
                children: [
                  { index: true, element: <AdminContentPage /> },
                  { path: "pages/:id", element: <ContentPageEditor /> },
                  { path: "places/:id", element: <ContentPlaceEditor /> },
                ],
              },
              { path: "settings", element: <AdminSettingsPage /> },
              { path: "*", element: <NotFoundPage /> },
            ],
          },
        ],
      },
    ],
  },
];
