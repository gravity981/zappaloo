// Konten & Rollen (sw-architecture.md 8.3): the accounts of the event with their roles and
// capabilities, and the guest groups (ACC-08, ACC-10, ROLE-01, ROLE-06, ROLE-09, GRP-01).
// Accounts and groups open a panel for everything that does not fit into the table.
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminUserListSchema, groupListSchema, groupSchema, ROLES } from "@zappaloo/shared";
import { AccountPanel, CreateAccountPanel, GroupPanel } from "./UsersPanels.tsx";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { ToggleChip } from "./ui.tsx";
import { useToggleRole } from "./users.ts";

type Open = { kind: "account"; id: number } | { kind: "group"; id: number } | { kind: "create" };

export default function AdminUsersPage() {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useErrorText();
  const users = useAdminData("/api/admin/users", adminUserListSchema);
  const groups = useAdminData("/api/admin/groups", groupListSchema);
  const [open, setOpen] = useState<Open>();
  const [error, setError] = useState<string>();
  const [groupName, setGroupName] = useState<string>();

  const reloadUsers = users.reload;
  const reloadGroups = groups.reload;
  const reload = useCallback(() => {
    reloadUsers();
    reloadGroups();
  }, [reloadUsers, reloadGroups]);
  const changed = useCallback(
    (failed: string | undefined) => {
      setError(failed);
      reload();
    },
    [reload],
  );
  const toggleRole = useToggleRole(changed);
  const close = useCallback(() => {
    setOpen(undefined);
  }, []);

  async function createGroup(name: string) {
    const result = await call("POST", "/api/admin/groups", { name });
    const parsed = groupSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setGroupName(undefined);
      setError(undefined);
      reload();
    } else {
      setError(errorText(result.errorCode));
    }
  }

  const userList = users.data?.users ?? [];
  const groupList = groups.data?.groups ?? [];
  const account = open?.kind === "account" ? userList.find((u) => u.id === open.id) : undefined;
  const group = open?.kind === "group" ? groupList.find((g) => g.id === open.id) : undefined;

  return (
    <>
      <div className="sethead">
        <h1 className="h1 grow">{t("admin.users.title")}</h1>
        <button
          type="button"
          className="btn sm"
          onClick={() => {
            setOpen({ kind: "create" });
          }}
        >
          {t("admin.users.create")}
        </button>
      </div>
      {error && !open && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <div className="grid-2">
        <div className="card tight">
          <div className="scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("admin.users.name")}</th>
                  <th>{t("admin.users.roles")}</th>
                  <th>{t("admin.users.capabilities")}</th>
                  <th>
                    <span className="visually-hidden">{t("admin.users.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {userList.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <b>{user.displayName}</b>
                      <br />
                      <span className="hint">{user.username}</span>
                    </td>
                    <td>
                      <div className="chips">
                        {ROLES.map((role) => (
                          <ToggleChip
                            key={role}
                            small
                            pressed={user.roles.includes(role)}
                            label={t("admin.users.roleOf", {
                              role: t(`admin.roles.${role}`),
                              name: user.displayName,
                            })}
                            onToggle={() => void toggleRole(user, role)}
                          >
                            {t(`admin.roles.${role}`)}
                          </ToggleChip>
                        ))}
                      </div>
                    </td>
                    <td className="sm muted">
                      {user.capabilities.length === 0
                        ? "–"
                        : user.capabilities.map((c) => t(`admin.capabilities.${c}`)).join(", ")}
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="btn soft sm"
                        aria-label={t("admin.users.edit", { name: user.displayName })}
                        onClick={() => {
                          setError(undefined);
                          setOpen({ kind: "account", id: user.id });
                        }}
                      >
                        …
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <section className="card" aria-labelledby="groups-title">
          <div className="row">
            <b id="groups-title" className="grow">
              {t("admin.groups.title")}
            </b>
            <button
              type="button"
              className="btn soft sm"
              onClick={() => {
                setGroupName("");
              }}
            >
              {t("admin.groups.new")}
            </button>
          </div>
          {groupName !== undefined && (
            <form
              className="row"
              onSubmit={(event) => {
                event.preventDefault();
                void createGroup(groupName);
              }}
            >
              <label className="field grow">
                <span>{t("admin.groups.name")}</span>
                <input
                  className="input"
                  required
                  maxLength={60}
                  value={groupName}
                  onChange={(event) => {
                    setGroupName(event.target.value);
                  }}
                />
              </label>
              <button type="submit" className="btn sm">
                {t("admin.groups.add")}
              </button>
            </form>
          )}
          {groupList.length === 0 ? (
            <p className="hint">{t("admin.groups.none")}</p>
          ) : (
            <ul className="list">
              {groupList.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    className="li"
                    onClick={() => {
                      setError(undefined);
                      setOpen({ kind: "group", id: g.id });
                    }}
                  >
                    <span className="grow">
                      <b>{g.name}</b>
                    </span>
                    <span className="hint">
                      {t("admin.groups.members", { count: g.memberIds.length })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {open?.kind === "create" && <CreateAccountPanel onClose={close} onCreated={reload} />}
      {account && (
        <AccountPanel
          key={account.id}
          user={account}
          groups={groupList}
          error={error}
          onChanged={changed}
          onClose={close}
        />
      )}
      {group && (
        <GroupPanel
          key={group.id}
          group={group}
          users={userList}
          error={error}
          onChanged={changed}
          onDeleted={() => {
            close();
            reload();
          }}
          onClose={close}
        />
      )}
    </>
  );
}
