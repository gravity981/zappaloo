// The avatar of a person (sw-architecture.md 7.3, AVA-01, AVA-02): which figures a person may choose, the figure
// that applies, and the choice. The figure's tier decides who may choose it: tier1 for vip, tier2 for staff, tier3
// for admin; exact, and the union for several roles. Accompanying persons always choose from tier1. The server
// checks the choice, not only the editor.
import { and, eq, inArray } from "drizzle-orm";
import { WORLD_ROLE_TIERS } from "@zappaloo/shared";
import type {
  AvatarFigure,
  AvatarResponse,
  GuestFigure,
  Role,
  WorldFigure,
  WorldFigureTier,
} from "@zappaloo/shared";
import {
  companionAttendance,
  companions,
  memberships,
  rsvpAttendance,
  users,
} from "../database/schema.ts";
import type { Database } from "../database/database.ts";
import type { EventService } from "../event/service.ts";
import type { WorldService } from "./service.ts";

/** Why a choice was refused. */
export class AvatarError extends Error {
  readonly code: "no_world" | "person_not_found" | "figure_not_found" | "figure_not_allowed";

  constructor(code: AvatarError["code"], message: string) {
    super(message);
    this.name = "AvatarError";
    this.code = code;
  }
}

/** The signed-in user as the avatar needs them. */
export interface AvatarUser {
  id: number;
  displayName: string;
  roles: readonly Role[];
}

/** The tiers a user's roles allow: the union of one tier per role. */
export function tiersOf(roles: readonly Role[]): Set<WorldFigureTier> {
  return new Set(roles.map((role) => WORLD_ROLE_TIERS[role]));
}

const toFigure = (figure: WorldFigure): AvatarFigure => ({
  id: figure.id,
  ...(figure.label === undefined ? {} : { label: figure.label }),
  type: figure.type,
});

export class AvatarService {
  readonly #database: Database;
  readonly #event: EventService;
  readonly #world: WorldService;

  constructor(database: Database, event: EventService, world: WorldService) {
    this.#database = database;
    this.#event = event;
    this.#world = world;
  }

  /** The figures of the active world that the tiers allow, in the order of the package. */
  #allowed(tiers: ReadonlySet<WorldFigureTier>): WorldFigure[] {
    return (this.#world.active()?.figures ?? []).filter((figure) => tiers.has(figure.tier));
  }

  /**
   * The tiers of a user's own figure. A user whose roles give no figure of the world (a staff member in a world
   * without tier2 figures) chooses from tier1, so every user has a figure to choose (decision 2 of 5l).
   */
  #ownTiers(user: AvatarUser): ReadonlySet<WorldFigureTier> {
    const tiers = tiersOf(user.roles);
    const figures = this.#world.active()?.figures ?? [];
    return figures.some((figure) => tiers.has(figure.tier))
      ? tiers
      : new Set<WorldFigureTier>(["tier1"]);
  }

  #companions(userId: number) {
    return this.#database.db
      .select()
      .from(companions)
      .where(
        and(
          eq(companions.eventId, this.#event.eventId),
          eq(companions.hostUserId, userId),
          eq(companions.status, "approved"),
        ),
      )
      .orderBy(companions.id)
      .all();
  }

  #ownFigure(userId: number): string | null {
    return (
      this.#database.db
        .select({ figure: memberships.avatarFigure })
        .from(memberships)
        .where(and(eq(memberships.eventId, this.#event.eventId), eq(memberships.userId, userId)))
        .get()?.figure ?? null
    );
  }

  /** The figure that applies: the chosen one if it is still allowed, otherwise the first allowed one. */
  #effective(chosen: string | null, allowed: WorldFigure[]): string | null {
    return allowed.find((figure) => figure.id === chosen)?.id ?? allowed[0]?.id ?? null;
  }

  /** The user and the approved companions with their figures (`GET /api/avatar`). */
  persons(user: AvatarUser): AvatarResponse {
    const own = this.#allowed(this.#ownTiers(user));
    const guest = this.#allowed(new Set<WorldFigureTier>(["tier1"]));
    const ownChoice = this.#ownFigure(user.id);
    return {
      persons: [
        {
          id: "me",
          name: user.displayName,
          figure: this.#effective(ownChoice, own),
          chosen: own.some((figure) => figure.id === ownChoice),
          figures: own.map(toFigure),
        },
        ...this.#companions(user.id).map((companion) => ({
          id: String(companion.id),
          name: companion.name,
          figure: this.#effective(companion.avatarFigure, guest),
          chosen: guest.some((figure) => figure.id === companion.avatarFigure),
          figures: guest.map(toFigure),
        })),
      ],
    };
  }

  /**
   * The figures of the attending guests (PRES-01): every person with an active account, and every approved
   * companion, who answered yes for at least one program item and chose a figure that the active world still has.
   * The signed-in user's own figure is left out (they see their avatar); their companions stay.
   */
  guests(user: AvatarUser): GuestFigure[] {
    const known = new Set((this.#world.active()?.figures ?? []).map((figure) => figure.id));
    const eventId = this.#event.eventId;
    const { db } = this.#database;
    const userIds = [
      ...new Set(
        db
          .select({ id: rsvpAttendance.userId })
          .from(rsvpAttendance)
          .where(and(eq(rsvpAttendance.eventId, eventId), eq(rsvpAttendance.attending, true)))
          .all()
          .map((row) => row.id),
      ),
    ].filter((id) => id !== user.id);
    const guests: GuestFigure[] =
      userIds.length === 0
        ? []
        : db
            .select({ id: users.id, name: users.displayName, figure: memberships.avatarFigure })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(
              and(
                eq(memberships.eventId, eventId),
                inArray(memberships.userId, userIds),
                eq(users.status, "active"),
              ),
            )
            .orderBy(users.id)
            .all()
            .flatMap((row) =>
              row.figure !== null && known.has(row.figure)
                ? [{ id: `u${String(row.id)}`, name: row.name, figure: row.figure }]
                : [],
            );
    const companionIds = [
      ...new Set(
        db
          .select({ id: companionAttendance.companionId })
          .from(companionAttendance)
          .where(
            and(eq(companionAttendance.eventId, eventId), eq(companionAttendance.attending, true)),
          )
          .all()
          .map((row) => row.id),
      ),
    ];
    if (companionIds.length === 0) return guests;
    const rows = db
      .select()
      .from(companions)
      .where(
        and(
          eq(companions.eventId, eventId),
          eq(companions.status, "approved"),
          inArray(companions.id, companionIds),
        ),
      )
      .orderBy(companions.id)
      .all();
    for (const row of rows) {
      if (row.avatarFigure !== null && known.has(row.avatarFigure)) {
        guests.push({ id: `c${String(row.id)}`, name: row.name, figure: row.avatarFigure });
      }
    }
    return guests;
  }

  /** Stores the choice for the user (`me`) or one of their approved companions. */
  choose(user: AvatarUser, person: string, figureId: string): void {
    const world = this.#world.active();
    if (world === undefined) throw new AvatarError("no_world", "no world is imported");
    const exists = world.figures.some((figure) => figure.id === figureId);
    if (!exists) throw new AvatarError("figure_not_found", `the world has no figure ${figureId}`);
    const companion =
      person === "me"
        ? undefined
        : this.#companions(user.id).find((item) => String(item.id) === person);
    if (person !== "me" && companion === undefined) {
      throw new AvatarError("person_not_found", "there is no such person");
    }
    const tiers = person === "me" ? this.#ownTiers(user) : new Set<WorldFigureTier>(["tier1"]);
    if (!this.#allowed(tiers).some((figure) => figure.id === figureId)) {
      throw new AvatarError("figure_not_allowed", "this person may not choose that figure");
    }
    if (companion === undefined) {
      this.#database.db
        .update(memberships)
        .set({ avatarFigure: figureId })
        .where(and(eq(memberships.eventId, this.#event.eventId), eq(memberships.userId, user.id)))
        .run();
    } else {
      this.#database.db
        .update(companions)
        .set({ avatarFigure: figureId })
        .where(eq(companions.id, companion.id))
        .run();
    }
  }
}
