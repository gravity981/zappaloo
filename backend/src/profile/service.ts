// Profiles (sw-architecture.md 3.6; PRES-09, PRES-13 – PRES-15): the photo, greeting and "How I know the couple" of
// a guest and each approved companion, the admin's relation list, and the admin's removal of a photo or a line
// (PRES-14). Every change and its audit entry (ids only, SEC-04) run in one transaction.
import { and, asc, eq, isNull } from "drizzle-orm";
import { DEFAULT_RELATIONS } from "@zappaloo/shared";
import type {
  ProfilePerson,
  ProfileRemovable,
  ProfileRequest,
  RelationOption,
} from "@zappaloo/shared";
import { companions, profiles, relationOptions, users } from "../database/schema.ts";
import type { Database } from "../database/database.ts";
import type { Actor, EventService } from "../event/service.ts";
import { processPhoto } from "./photo.ts";

export class ProfileError extends Error {
  readonly code: "person_not_found" | "relation_not_found" | "relation_duplicate" | "no_photo";

  constructor(code: ProfileError["code"], message: string) {
    super(message);
    this.name = "ProfileError";
    this.code = code;
  }
}

/** The user as the profile needs them. */
export interface ProfileUser {
  id: number;
  displayName: string;
}

/** A person's key in the game's guest list: `u<user id>` or `c<companion id>`. */
export const personKey = (companionId: number | null, userId: number): string =>
  companionId === null ? `u${String(userId)}` : `c${String(companionId)}`;

/** What the speech bubble of a guest shows besides the name (PRES-10). */
export interface ProfileCard {
  greeting: string | null;
  badge: string | null;
  line: string | null;
  photo: number | null;
}

export class ProfileService {
  readonly #database: Database;
  readonly #event: EventService;

  constructor(database: Database, event: EventService) {
    this.#database = database;
    this.#event = event;
  }

  /** The relation list; the six wedding defaults are stored the first time it is read or changed. */
  relations(): RelationOption[] {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const read = () =>
      db
        .select({ id: relationOptions.id, name: relationOptions.name })
        .from(relationOptions)
        .where(eq(relationOptions.eventId, eventId))
        .orderBy(asc(relationOptions.position), asc(relationOptions.id))
        .all();
    const rows = read();
    // The list is never empty once edited (at least one option), so an empty table means it was never edited.
    if (rows.length > 0) return rows;
    db.transaction((tx) => {
      DEFAULT_RELATIONS.forEach((name, position) => {
        tx.insert(relationOptions).values({ eventId, name, position, createdAt: new Date() }).run();
      });
    });
    return read();
  }

  /**
   * Replaces the list (PRES-15): an entry with an id keeps it (and the choices of the guests), one without gets a
   * new id, and an option that is no longer in the list goes (guests who chose it have none then).
   */
  setRelations(
    entries: { id?: number | undefined; name: string }[],
    actor: Actor,
  ): RelationOption[] {
    const { db } = this.#database;
    const eventId = this.#event.eventId;
    const names = entries.map((entry) => entry.name.toLocaleLowerCase());
    if (new Set(names).size !== names.length) {
      throw new ProfileError("relation_duplicate", "an option appears twice");
    }
    this.relations();
    db.transaction((tx) => {
      const existing = new Set(
        tx
          .select({ id: relationOptions.id })
          .from(relationOptions)
          .where(eq(relationOptions.eventId, eventId))
          .all()
          .map((row) => row.id),
      );
      const keep = new Set<number>();
      entries.forEach((entry, position) => {
        if (entry.id !== undefined && existing.has(entry.id)) {
          keep.add(entry.id);
          tx.update(relationOptions)
            .set({ name: entry.name, position })
            .where(eq(relationOptions.id, entry.id))
            .run();
        } else {
          const created = tx
            .insert(relationOptions)
            .values({ eventId, name: entry.name, position, createdAt: new Date() })
            .returning({ id: relationOptions.id })
            .get();
          keep.add(created.id);
        }
      });
      for (const id of existing) {
        if (!keep.has(id)) tx.delete(relationOptions).where(eq(relationOptions.id, id)).run();
      }
      this.#event.audit(actor, "profile.relations", { count: entries.length }, tx);
    });
    return this.relations();
  }

  /** The speech-bubble data of everyone who has a profile, by person key (`u<id>`, `c<id>`). */
  cards(): Map<string, ProfileCard> {
    const options = new Map(this.relations().map((option) => [option.id, option.name]));
    const rows = this.#database.db
      .select()
      .from(profiles)
      .where(eq(profiles.eventId, this.#event.eventId))
      .all();
    return new Map(
      rows.map((row) => [
        personKey(row.companionId, row.userId),
        {
          greeting: row.greeting,
          badge: row.relationId === null ? null : (options.get(row.relationId) ?? null),
          line: row.relationLine,
          photo: row.photo === null ? null : row.updatedAt.getTime(),
        },
      ]),
    );
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

  #row(userId: number, companionId: number | null) {
    const eventId = this.#event.eventId;
    const { db } = this.#database;
    return companionId === null
      ? db
          .select()
          .from(profiles)
          .where(
            and(
              eq(profiles.eventId, eventId),
              eq(profiles.userId, userId),
              isNull(profiles.companionId),
            ),
          )
          .get()
      : db.select().from(profiles).where(eq(profiles.companionId, companionId)).get();
  }

  #person(
    id: string,
    name: string,
    userId: number,
    companionId: number | null,
    known: ReadonlySet<number>,
  ): ProfilePerson {
    const row = this.#row(userId, companionId);
    return {
      id,
      key: personKey(companionId, userId),
      name,
      greeting: row?.greeting ?? null,
      relation: row?.relationId != null && known.has(row.relationId) ? row.relationId : null,
      relationLine: row?.relationLine ?? null,
      photo: row?.photo != null ? row.updatedAt.getTime() : null,
    };
  }

  /** A guest's profile and those of their approved companions. */
  persons(user: ProfileUser): ProfilePerson[] {
    const known = new Set(this.relations().map((option) => option.id));
    return [
      this.#person("me", user.displayName, user.id, null, known),
      ...this.#companions(user.id).map((companion) =>
        this.#person(String(companion.id), companion.name, user.id, companion.id, known),
      ),
    ];
  }

  /** The profiles of a user by the admin (PRES-14); undefined when there is no such user. */
  personsOf(userId: number): ProfilePerson[] | undefined {
    const user = this.#database.db
      .select({ id: users.id, displayName: users.displayName })
      .from(users)
      .where(eq(users.id, userId))
      .get();
    return user === undefined ? undefined : this.persons(user);
  }

  /** The companion id a `person` stands for (`me`: none), or throws when the person is not the user's. */
  #companionOf(userId: number, person: string): number | null {
    if (person === "me") return null;
    const companion = this.#companions(userId).find((item) => String(item.id) === person);
    if (companion === undefined)
      throw new ProfileError("person_not_found", "there is no such person");
    return companion.id;
  }

  /** Makes sure the person has a row and returns it. */
  #ensure(userId: number, companionId: number | null) {
    const existing = this.#row(userId, companionId);
    if (existing !== undefined) return existing;
    return this.#database.db
      .insert(profiles)
      .values({ eventId: this.#event.eventId, userId, companionId, updatedAt: new Date() })
      .returning()
      .get();
  }

  /** Stores the three text parts of a person (PRES-09, PRES-13, PRES-15). */
  save(user: ProfileUser, person: string, request: ProfileRequest): void {
    const companionId = this.#companionOf(user.id, person);
    if (request.relation !== null && !this.relations().some((o) => o.id === request.relation)) {
      throw new ProfileError("relation_not_found", "there is no such option");
    }
    this.#database.db.transaction(() => {
      const row = this.#ensure(user.id, companionId);
      this.#database.db
        .update(profiles)
        .set({
          greeting: request.greeting,
          relationId: request.relation,
          relationLine: request.relationLine,
          updatedAt: new Date(),
        })
        .where(eq(profiles.id, row.id))
        .run();
    });
  }

  /** Stores the processed photo of a person; throws `PhotoError` for a file that is not a usable image. */
  async savePhoto(user: ProfileUser, person: string, upload: Uint8Array): Promise<void> {
    const companionId = this.#companionOf(user.id, person);
    const photo = await processPhoto(upload);
    this.#database.db.transaction(() => {
      const row = this.#ensure(user.id, companionId);
      this.#database.db
        .update(profiles)
        .set({ photo: photo.bytes, photoMime: photo.mime, updatedAt: new Date() })
        .where(eq(profiles.id, row.id))
        .run();
    });
  }

  /** Deletes the photo of a person. */
  deletePhoto(user: ProfileUser, person: string): void {
    const companionId = this.#companionOf(user.id, person);
    const row = this.#row(user.id, companionId);
    if (row === undefined) return;
    this.#database.db
      .update(profiles)
      .set({ photo: null, photoMime: null, updatedAt: new Date() })
      .where(eq(profiles.id, row.id))
      .run();
  }

  /** The photo of a person of the user, or undefined. */
  photo(user: ProfileUser, person: string): { bytes: Buffer; mime: string } | undefined {
    const row = this.#row(user.id, this.#companionOf(user.id, person));
    return row?.photo != null && row.photoMime !== null
      ? { bytes: row.photo, mime: row.photoMime }
      : undefined;
  }

  /** The photo of any person by its key (`u<id>`, `c<id>`), for the admin; undefined without one. */
  photoByKey(key: string): { bytes: Buffer; mime: string } | undefined {
    const row = this.#rowByKey(key);
    return row?.photo != null && row.photoMime !== null
      ? { bytes: row.photo, mime: row.photoMime }
      : undefined;
  }

  #rowByKey(key: string) {
    const match = /^([uc])(\d{1,9})$/.exec(key);
    if (match === null) return undefined;
    const id = Number(match[2]);
    const { db } = this.#database;
    return match[1] === "c"
      ? db.select().from(profiles).where(eq(profiles.companionId, id)).get()
      : this.#row(id, null);
  }

  /** The admin removes a photo or a line of a person (PRES-14), audited with the key and the part only. */
  remove(key: string, part: ProfileRemovable, actor: Actor): void {
    const row = this.#rowByKey(key);
    if (row === undefined) throw new ProfileError("person_not_found", "there is no such profile");
    const cleared =
      part === "photo"
        ? { photo: null, photoMime: null }
        : part === "greeting"
          ? { greeting: null }
          : { relationLine: null };
    this.#database.db.transaction((tx) => {
      tx.update(profiles)
        .set({ ...cleared, updatedAt: new Date() })
        .where(eq(profiles.id, row.id))
        .run();
      this.#event.audit(actor, "profile.remove", { person: key, part }, tx);
    });
  }
}
