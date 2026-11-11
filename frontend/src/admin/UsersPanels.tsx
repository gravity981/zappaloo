// The panels of Konten & Rollen (sw-architecture.md 8.3): one account (roles, staff
// capabilities, groups, reset link), a new account with its setup link, and one guest group.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  CAPABILITIES,
  createUserResponseSchema,
  resetLinkResponseSchema,
  ROLES,
  rsvpConfigSchema,
} from "@zappaloo/shared";
import type { AdminUser, Capability, Group, Role } from "@zappaloo/shared";
import { useAdminCall, useAdminData } from "./data.ts";
import { HandOverLink, Panel, ToggleChip } from "./ui.tsx";
import { useToggleRole, useUsersErrorText } from "./users.ts";

function Alert({ text }: { text: string | undefined }) {
  return text ? (
    <p role="alert" className="error">
      {text}
    </p>
  ) : null;
}

/** One account: roles, staff capabilities, groups and a reset link (ROLE-01, ROLE-06, GRP-01, ACC-10). */
export function AccountPanel({
  user,
  groups,
  error,
  onChanged,
  onClose,
}: {
  user: AdminUser;
  groups: Group[];
  error: string | undefined;
  onChanged: (error: string | undefined) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useUsersErrorText();
  const toggleRole = useToggleRole(onChanged);
  const [link, setLink] = useState<{ url: string; expiresAt: string }>();
  const { data: rsvpConfig } = useAdminData("/api/admin/rsvp/config", rsvpConfigSchema);
  const isStaff = user.roles.includes("staff");
  const isVip = user.roles.includes("vip");
  const inGroup = (group: Group) => user.groups.some((g) => g.id === group.id);

  async function toggleCapability(capability: Capability) {
    const capabilities = user.capabilities.includes(capability)
      ? user.capabilities.filter((current) => current !== capability)
      : [...user.capabilities, capability];
    const result = await call("PUT", `/api/admin/users/${String(user.id)}/capabilities`, {
      capabilities,
    });
    onChanged(result.ok ? undefined : errorText(result.errorCode));
  }

  async function toggleGroup(group: Group) {
    const path = `/api/admin/groups/${String(group.id)}/members/${String(user.id)}`;
    const result = await call(inGroup(group) ? "DELETE" : "PUT", path);
    onChanged(result.ok ? undefined : errorText(result.errorCode));
  }

  async function toggleInvitedPart(partId: number) {
    const partIds = user.invitedPartIds.includes(partId)
      ? user.invitedPartIds.filter((id) => id !== partId)
      : [...user.invitedPartIds, partId].sort((a, b) => a - b);
    const result = await call("PUT", `/api/admin/users/${String(user.id)}/parts`, { partIds });
    onChanged(result.ok ? undefined : errorText(result.errorCode));
  }

  async function createResetLink() {
    const result = await call("POST", `/api/admin/users/${String(user.id)}/reset-link`);
    const parsed = resetLinkResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setLink({ url: parsed.data.resetUrl, expiresAt: parsed.data.expiresAt });
      onChanged(undefined);
    } else {
      onChanged(errorText(result.errorCode));
    }
  }

  return (
    <Panel title={user.displayName} onClose={onClose}>
      <p className="hint">
        {user.username}
        {user.email && ` · ${user.email} (${t(`admin.users.emailStatus.${user.emailStatus}`)})`}
      </p>
      <Alert text={error} />

      <section className="stack" aria-labelledby="account-roles">
        <b id="account-roles">{t("admin.users.roles")}</b>
        <div className="chips">
          {ROLES.map((role) => (
            <ToggleChip
              key={role}
              pressed={user.roles.includes(role)}
              onToggle={() => void toggleRole(user, role)}
            >
              {t(`admin.roles.${role}`)}
            </ToggleChip>
          ))}
        </div>
        {user.vipAssignment && (
          <span className="hint">{t(`admin.users.vipAssignment.${user.vipAssignment}`)}</span>
        )}
      </section>

      <section className="stack" aria-labelledby="account-capabilities">
        <b id="account-capabilities">{t("admin.users.capabilities")}</b>
        <div className="chips">
          {CAPABILITIES.map((capability) => (
            <ToggleChip
              key={capability}
              pressed={user.capabilities.includes(capability)}
              disabled={!isStaff}
              onToggle={() => void toggleCapability(capability)}
            >
              {t(`admin.capabilities.${capability}`)}
            </ToggleChip>
          ))}
        </div>
        {!isStaff && <span className="hint">{t("admin.users.capabilitiesOnlyStaff")}</span>}
      </section>

      <section className="stack" aria-labelledby="account-groups">
        <b id="account-groups">{t("admin.groups.title")}</b>
        {groups.length === 0 ? (
          <span className="hint">{t("admin.groups.none")}</span>
        ) : (
          <div className="chips">
            {groups.map((group) => (
              <ToggleChip
                key={group.id}
                pressed={inGroup(group)}
                onToggle={() => void toggleGroup(group)}
              >
                {group.name}
              </ToggleChip>
            ))}
          </div>
        )}
      </section>

      {isVip && (
        <section className="stack" aria-labelledby="account-parts">
          <b id="account-parts">{t("admin.users.invitedTo")}</b>
          {rsvpConfig?.parts.length === 0 ? (
            <span className="hint">{t("admin.users.invitedNone")}</span>
          ) : (
            <div className="chips">
              {(rsvpConfig?.parts ?? []).map((part) => (
                <ToggleChip
                  key={part.id}
                  pressed={user.invitedPartIds.includes(part.id)}
                  disabled={user.vipAssignment === "invitation_code"}
                  onToggle={() => void toggleInvitedPart(part.id)}
                >
                  {part.name}
                </ToggleChip>
              ))}
            </div>
          )}
          <span className="hint">
            {user.vipAssignment === "invitation_code"
              ? t("admin.users.invitedHintInvitation")
              : t("admin.users.invitedHintPromotion")}
          </span>
        </section>
      )}

      <section className="stack" aria-labelledby="account-password">
        <b id="account-password">{t("admin.users.password")}</b>
        <span className="hint">{t("admin.users.resetHint")}</span>
        {link ? (
          <HandOverLink
            url={link.url}
            expiresAt={link.expiresAt}
            label={t("admin.users.resetLink")}
          />
        ) : (
          <button type="button" className="btn soft sm" onClick={() => void createResetLink()}>
            {t("admin.users.createResetLink")}
          </button>
        )}
      </section>
    </Panel>
  );
}

/** A new account and its setup link to hand over (ACC-08). */
export function CreateAccountPanel({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useUsersErrorText();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [roles, setRoles] = useState<Role[]>([]);
  const [error, setError] = useState<string>();
  const [created, setCreated] = useState<{ name: string; url: string; expiresAt: string }>();

  async function create() {
    const result = await call("POST", "/api/admin/users", {
      username,
      ...(displayName.trim() === "" ? {} : { displayName }),
      roles,
    });
    const parsed = createUserResponseSchema.safeParse(result.body);
    if (result.ok && parsed.success) {
      setCreated({
        name: parsed.data.user.displayName,
        url: parsed.data.setupUrl,
        expiresAt: parsed.data.expiresAt,
      });
      setError(undefined);
      onCreated();
    } else {
      setError(errorText(result.errorCode));
    }
  }

  if (created) {
    return (
      <Panel title={t("admin.users.createdTitle", { name: created.name })} onClose={onClose}>
        <HandOverLink
          url={created.url}
          expiresAt={created.expiresAt}
          label={t("admin.users.setupLink")}
        />
        <button type="button" className="btn" onClick={onClose}>
          {t("admin.invitations.done")}
        </button>
      </Panel>
    );
  }

  return (
    <Panel title={t("admin.users.createTitle")} onClose={onClose}>
      <form
        className="stack"
        onSubmit={(event) => {
          event.preventDefault();
          void create();
        }}
      >
        <div className="field">
          <label className="field">
            <span>{t("admin.users.username")}</span>
            <input
              className="input"
              required
              autoComplete="off"
              aria-describedby="create-username-hint"
              value={username}
              onChange={(event) => {
                setUsername(event.target.value);
              }}
            />
          </label>
          <span id="create-username-hint" className="hint">
            {t("admin.users.usernameHint")}
          </span>
        </div>
        <label className="field">
          <span>{t("admin.users.displayName")}</span>
          <input
            className="input"
            maxLength={100}
            value={displayName}
            onChange={(event) => {
              setDisplayName(event.target.value);
            }}
          />
        </label>
        <div className="stack" role="group" aria-labelledby="create-roles">
          <b id="create-roles" className="sm">
            {t("admin.users.roles")}
          </b>
          <div className="chips">
            {ROLES.map((role) => (
              <ToggleChip
                key={role}
                pressed={roles.includes(role)}
                onToggle={() => {
                  setRoles((current) =>
                    current.includes(role) ? current.filter((r) => r !== role) : [...current, role],
                  );
                }}
              >
                {t(`admin.roles.${role}`)}
              </ToggleChip>
            ))}
          </div>
        </div>
        <Alert text={error} />
        <button type="submit" className="btn">
          {t("admin.users.createSubmit")}
        </button>
      </form>
    </Panel>
  );
}

/** One guest group: rename, delete, members (GRP-01). */
export function GroupPanel({
  group,
  users,
  error,
  onChanged,
  onDeleted,
  onClose,
}: {
  group: Group;
  users: AdminUser[];
  error: string | undefined;
  onChanged: (error: string | undefined) => void;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const call = useAdminCall();
  const errorText = useUsersErrorText();
  const [name, setName] = useState(group.name);
  const [candidate, setCandidate] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const base = `/api/admin/groups/${String(group.id)}`;
  const members = users.filter((user) => group.memberIds.includes(user.id));
  const others = users.filter((user) => !group.memberIds.includes(user.id));

  async function run(method: "PATCH" | "PUT" | "DELETE", path: string, body?: unknown) {
    const result = await call(method, path, body);
    onChanged(result.ok ? undefined : errorText(result.errorCode));
    return result.ok;
  }

  return (
    <Panel title={group.name} onClose={onClose}>
      <Alert text={error} />
      <form
        className="row"
        onSubmit={(event) => {
          event.preventDefault();
          void run("PATCH", base, { name });
        }}
      >
        <label className="field grow">
          <span>{t("admin.groups.name")}</span>
          <input
            className="input"
            required
            maxLength={60}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </label>
        <button type="submit" className="btn soft sm" disabled={name.trim() === group.name}>
          {t("admin.groups.rename")}
        </button>
      </form>

      <section className="stack" aria-labelledby="group-members">
        <b id="group-members">{t("admin.groups.members", { count: members.length })}</b>
        {members.length > 0 && (
          <ul className="list">
            {members.map((user) => (
              <li key={user.id} className="li">
                <span className="grow">
                  <b>{user.displayName}</b>
                  <span className="hint">{user.username}</span>
                </span>
                <button
                  type="button"
                  className="btn ghost sm"
                  aria-label={t("admin.groups.removeMember", { name: user.displayName })}
                  onClick={() => void run("DELETE", `${base}/members/${String(user.id)}`)}
                >
                  {t("admin.groups.remove")}
                </button>
              </li>
            ))}
          </ul>
        )}
        {others.length > 0 && (
          <form
            className="row"
            onSubmit={(event) => {
              event.preventDefault();
              if (candidate === "") return;
              void run("PUT", `${base}/members/${candidate}`).then((ok) => {
                if (ok) setCandidate("");
              });
            }}
          >
            <label className="field grow">
              <span>{t("admin.groups.addMember")}</span>
              <select
                className="input"
                value={candidate}
                onChange={(event) => {
                  setCandidate(event.target.value);
                }}
              >
                <option value="">{t("admin.groups.choose")}</option>
                {others.map((user) => (
                  <option key={user.id} value={String(user.id)}>
                    {user.displayName} ({user.username})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="btn soft sm" disabled={candidate === ""}>
              {t("admin.groups.add")}
            </button>
          </form>
        )}
      </section>

      <section className="stack">
        {confirmDelete ? (
          <div className="card flat">
            <span>{t("admin.groups.deleteConfirm", { name: group.name })}</span>
            <div className="row">
              <button
                type="button"
                className="btn danger sm"
                onClick={() =>
                  void run("DELETE", base).then((ok) => {
                    if (ok) onDeleted();
                  })
                }
              >
                {t("admin.groups.deleteFinal")}
              </button>
              <button
                type="button"
                className="btn ghost sm"
                onClick={() => {
                  setConfirmDelete(false);
                }}
              >
                {t("admin.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn danger sm"
            onClick={() => {
              setConfirmDelete(true);
            }}
          >
            {t("admin.groups.delete")}
          </button>
        )}
      </section>
    </Panel>
  );
}
