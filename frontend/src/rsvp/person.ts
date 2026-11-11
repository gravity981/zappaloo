// The answer of one person (guest or companion) while the wizard edits it.
import type { Companion, EventPart, MenuOption } from "@zappaloo/shared";

/** What the wizard holds for one person while it is edited. */
export interface PersonValue {
  attendance: Record<number, boolean>;
  menuId: number | null;
  allergies: string;
}

/** The value of a companion as the server has it. */
export function personOf(companion: Companion, parts: EventPart[]): PersonValue {
  return {
    attendance: Object.fromEntries(
      parts.map((part) => [part.id, companion.attendingPartIds.includes(part.id)]),
    ),
    menuId: companion.menuId,
    allergies: companion.allergies ?? "",
  };
}

/** The part with the meal, if the person attends it and menus exist: the menu is then needed. */
export function needsMenu(value: PersonValue, parts: EventPart[], menus: MenuOption[]): boolean {
  const meal = parts.find((part) => part.hasMeal);
  return meal !== undefined && value.attendance[meal.id] === true && menus.length > 0;
}

export function attendsAny(value: PersonValue): boolean {
  return Object.values(value.attendance).some(Boolean);
}

/** The request body of one person's answer. */
export function answerOf(value: PersonValue, parts: EventPart[], menus: MenuOption[]) {
  const attending = attendsAny(value);
  return {
    attendance: parts.map((part) => ({
      partId: part.id,
      attending: value.attendance[part.id] === true,
    })),
    ...(attending
      ? {
          ...(needsMenu(value, parts, menus) && value.menuId !== null
            ? { menuId: value.menuId }
            : {}),
          allergies: value.allergies.trim() === "" ? null : value.allergies.trim(),
        }
      : {}),
  };
}
