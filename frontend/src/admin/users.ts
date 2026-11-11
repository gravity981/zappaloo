// Account changes shared by the Konten & Rollen page and its panels.
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import type { AdminUser, Role } from "@zappaloo/shared";
import { useAdminCall, useErrorText } from "./data.ts";

/** Errors of the account pages, with `last_admin` worded for role changes. */
export function useUsersErrorText() {
  const { t } = useTranslation();
  return useErrorText({ last_admin: t("admin.users.lastAdmin") });
}

/** Switches one role of a user on or off; the API takes the complete set (ROLE-01, ROLE-09). */
export function useToggleRole(onDone: (error: string | undefined) => void) {
  const call = useAdminCall();
  const errorText = useUsersErrorText();
  return useCallback(
    async (user: AdminUser, role: Role) => {
      const roles = user.roles.includes(role)
        ? user.roles.filter((current) => current !== role)
        : [...user.roles, role];
      const result = await call("PUT", `/api/admin/users/${String(user.id)}/roles`, { roles });
      onDone(result.ok ? undefined : errorText(result.errorCode));
    },
    [call, errorText, onDone],
  );
}
