// The avatar of a person (sw-architecture.md 7.3, AVA-01, AVA-02): which figures a person may choose, the figure
// that applies, and the choice. The figure's tier decides who may choose it: tier1 for vip, tier2 for staff, tier3
// for admin; exact, and the union for several roles. Accompanying persons always choose from tier1. The server
// checks the choice, not only the editor.
import { and, eq } from "drizzle-orm";
import { WORLD_ROLE_TIERS } from "@zappaloo/shared";
import type {
  AvatarFigure,
  AvatarResponse,
  Role,
  WorldFigure,
  WorldFigureTier,
} from "@zappaloo/shared";
import { companions, memberships } from "../database/schema.ts";
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

  /** The figure that applies to the user in the game (AVA-04); null without a world. */
  figureOf(user: AvatarUser): string | null {
    return this.#effective(this.#ownFigure(user.id), this.#allowed(tiersOf(user.roles)));
  }

  /** The user and the approved companions with their figures (`GET /api/avatar`). */
  persons(user: AvatarUser): AvatarResponse {
    const own = this.#allowed(tiersOf(user.roles));
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
    const tiers = person === "me" ? tiersOf(user.roles) : new Set<WorldFigureTier>(["tier1"]);
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
