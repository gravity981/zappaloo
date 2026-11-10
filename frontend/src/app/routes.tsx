// Route table. Paths are placeholders until the website pages (stage 4) and the
// game world (stage 5) define the real structure.
import type { RouteObject } from "react-router";
import GamePage from "../pages/GamePage.tsx";
import HomePage from "../pages/HomePage.tsx";
import LoginPage from "../pages/LoginPage.tsx";
import NotFoundPage from "../pages/NotFoundPage.tsx";
import ProfilePage from "../pages/ProfilePage.tsx";
import SetPasswordPage from "../pages/SetPasswordPage.tsx";
import Layout from "./Layout.tsx";

export const routes: RouteObject[] = [
  {
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "game", element: <GamePage /> },
      { path: "login", element: <LoginPage /> },
      { path: "set-password/:token", element: <SetPasswordPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];
