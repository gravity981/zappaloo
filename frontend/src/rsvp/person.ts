// The answer of one person (guest or companion) while the wizard edits it.
import { menuRequired } from "@zappaloo/shared";
import type { EventPart, MenuOption } from "@zappaloo/shared";

/** What the wizard holds for one person while it is edited; a part without a value is open. */
export interface PersonValue {
  attendance: Record<number, boolean>;
  menuId: number | null;
  allergies: string;
}

/**
 * Yes or no per part as the server has it. A part in neither list was added to the invitation
 * after the answer: it stays open, so the wizard asks for it (7.4.1).
 */
export function attendanceOf(
  answer: { attendingPartIds: number[]; declinedPartIds: number[] },
  parts: EventPart[],
): Record<number, boolean> {
  const attendance: Record<number, boolean> = {};
  for (const part of parts) {
    if (answer.attendingPartIds.includes(part.id)) attendance[part.id] = true;
    else if (answer.declinedPartIds.includes(part.id)) attendance[part.id] = false;
  }
  return attendance;
}

/** The value of a companion as the server has it. */
export function personOf(
  companion: {
    attendingPartIds: number[];
    declinedPartIds: number[];
    menuId: number | null;
    allergies: string | null;
  },
  parts: EventPart[],
): PersonValue {
  return {
    attendance: attendanceOf(companion, parts),
    menuId: companion.menuId,
    allergies: companion.allergies ?? "",
  };
}

/** True once every part has a yes or a no. */
export function answeredAll(value: PersonValue, parts: EventPart[]): boolean {
  return parts.every((part) => value.attendance[part.id] !== undefined);
}

/** The person attends the part with the meal and menus exist: the menu is then needed. */
export function needsMenu(value: PersonValue, parts: EventPart[], menus: MenuOption[]): boolean {
  const attending = parts.filter((part) => value.attendance[part.id] === true).map((p) => p.id);
  return menuRequired(parts, menus.length, attending);
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
