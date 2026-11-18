// Konten & Rollen (sw-architecture.md 8.3): the accounts of the event with their roles and
// capabilities, and the guest groups (ACC-08, ACC-10, ROLE-01, ROLE-06, ROLE-09, GRP-01).
// Accounts and groups open a panel for everything that does not fit into the table.
import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { adminUserListSchema, groupListSchema, groupSchema, ROLES } from "@zappaloo/shared";
import type { UserStatus } from "@zappaloo/shared";
import { AccountPanel, CreateAccountPanel, GroupPanel } from "./UsersPanels.tsx";
import { useAdminCall, useAdminData, useErrorText } from "./data.ts";
import { ShortForms } from "./ui.tsx";

/** The tag of a state in the table. */
const STATUS_TAG: Record<UserStatus, string> = {
  active: "tag ok",
  inactive: "tag",
  blocked: "tag bad",
};
const FILTERS: (UserStatus | undefined)[] = [undefined, "active", "inactive", "blocked"];

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
  /** The status filter of the table (undefined: all) and the search over name and username. */
  const [filter, setFilter] = useState<UserStatus>();
  const [search, setSearch] = useState("");

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

  const userList = useMemo(() => users.data?.users ?? [], [users.data]);
  const countOf = (status?: UserStatus) =>
    status === undefined ? userList.length : userList.filter((u) => u.status === status).length;
  const needle = search.trim().toLowerCase();
  const shown = userList.filter(
    (u) =>
      (filter === undefined || u.status === filter) &&
      (needle === "" ||
        u.displayName.toLowerCase().includes(needle) ||
        (u.username ?? "").includes(needle)),
  );
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
          <div className="row tight-head">
            <div className="chips" role="group" aria-label={t("admin.users.filter")}>
              {FILTERS.map((status) => (
                <button
                  key={status ?? "all"}
                  type="button"
                  className="chip"
                  aria-pressed={filter === status}
                  onClick={() => {
                    setFilter(status);
                  }}
                >
                  {status === undefined ? t("admin.users.all") : t(`admin.users.filters.${status}`)}{" "}
                  {countOf(status)}
                </button>
              ))}
            </div>
            <input
              className="input grow"
              type="search"
              aria-label={t("admin.users.search")}
              placeholder={t("admin.users.search")}
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
          <div className="scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t("admin.users.username")}</th>
                  <th>{t("admin.users.name")}</th>
                  <th>{t("admin.users.statusColumn")}</th>
                  <th>{t("admin.users.roles")}</th>
                  <th>{t("admin.users.capabilities")}</th>
                  <th>
                    <span className="visually-hidden">{t("admin.users.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((user) => (
                  <tr key={user.id}>
                    <td className="sm">{user.username ?? "–"}</td>
                    <td>{user.displayName}</td>
                    <td>
                      <span className={STATUS_TAG[user.status]}>
                        {t(`admin.users.status.${user.status}`)}
                      </span>
                    </td>
                    {/* One letter per role and capability, read only (ROLE-11): roles are changed in the panel. */}
                    <td>
                      <ShortForms
                        entries={ROLES.filter((role) => user.roles.includes(role)).map((role) => ({
                          code: role.charAt(0).toUpperCase(),
                          name: t(`admin.roles.${role}`),
                        }))}
                      />
                    </td>
                    <td className="sm muted">
                      <ShortForms
                        entries={user.capabilities.map((c) => ({
                          code: t(`admin.capabilities.${c}`).charAt(0).toUpperCase(),
                          name: t(`admin.capabilities.${c}`),
                        }))}
                      />
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
