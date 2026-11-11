// Account changes shared by the Konten & Rollen page and its panels.
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import type { AdminUser, Role } from "@zappaloo/shared";
import { useAdminCall, useErrorText } from "./data.ts";

/** Errors of the account pages, with `last_admin` worded for role changes. */
export function useUsersErrorText() {
  const { t } = useTranslation();
  return useErrorText({ last_admin: t("admin.users.lastAdmin") });
}

/**
 * Switches one role of a user on or off; the API takes the complete set (ROLE-01, ROLE-09).
 * Revoking `vip` deletes the guest's RSVP with allergies and companions (7.4.1), so it waits
 * for a second click: `revoking` names the account until `confirmRevoke` or `cancelRevoke`.
 */
export function useToggleRole(onDone: (error: string | undefined) => void) {
  const call = useAdminCall();
  const errorText = useUsersErrorText();
  const [revoking, setRevoking] = useState<AdminUser>();
  const setRoles = useCallback(
    async (user: AdminUser, roles: Role[]) => {
      const result = await call("PUT", `/api/admin/users/${String(user.id)}/roles`, { roles });
      onDone(result.ok ? undefined : errorText(result.errorCode));
    },
    [call, errorText, onDone],
  );
  const toggleRole = useCallback(
    async (user: AdminUser, role: Role) => {
      if (role === "vip" && user.roles.includes("vip")) {
        setRevoking(user);
        return;
      }
      const roles = user.roles.includes(role)
        ? user.roles.filter((current) => current !== role)
        : [...user.roles, role];
      await setRoles(user, roles);
    },
    [setRoles],
  );
  const confirmRevoke = useCallback(async () => {
    if (!revoking) return;
    setRevoking(undefined);
    await setRoles(
      revoking,
      revoking.roles.filter((role) => role !== "vip"),
    );
  }, [revoking, setRoles]);
  const cancelRevoke = useCallback(() => {
    setRevoking(undefined);
  }, []);
  return { toggleRole, revoking, confirmRevoke, cancelRevoke };
}
