import { createElement } from "react";
import type { RouteObject } from "react-router";

/** A page that fails on purpose, to see the error screen in the end-to-end test (WEB-13). */
function FailingPage(): never {
  throw new Error("Test error: this page fails on purpose");
}

/** Routes that exist on the development server and in test builds (`VITE_TEST_HOOKS=true`), never in production. */
export const testRoutes: RouteObject[] =
  import.meta.env.DEV || import.meta.env.VITE_TEST_HOOKS === "true"
    ? [{ path: "test-error", element: createElement(FailingPage) }]
    : [];
