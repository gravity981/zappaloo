// Route table. Paths are placeholders until the website pages (stage 4) and the
// game world (stage 5) define the real structure.
import type { RouteObject } from "react-router";
import AdminInvitationsPage from "../pages/AdminInvitationsPage.tsx";
import ForgotPasswordPage from "../pages/ForgotPasswordPage.tsx";
import GamePage from "../pages/GamePage.tsx";
import HomePage from "../pages/HomePage.tsx";
import InvitePage from "../pages/InvitePage.tsx";
import LoginPage from "../pages/LoginPage.tsx";
import NotFoundPage from "../pages/NotFoundPage.tsx";
import ProfilePage from "../pages/ProfilePage.tsx";
import SetPasswordPage from "../pages/SetPasswordPage.tsx";
import VerifyEmailPage from "../pages/VerifyEmailPage.tsx";
import Layout from "./Layout.tsx";
import RequireSignIn from "./RequireSignIn.tsx";

export const routes: RouteObject[] = [
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
          { path: "game", element: <GamePage /> },
          { path: "admin/invitations", element: <AdminInvitationsPage /> },
          { path: "profile", element: <ProfilePage /> },
          { path: "*", element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
