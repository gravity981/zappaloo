// The answer of one person (guest or companion) while the wizard edits it.
import { menuRequired } from "@zappaloo/shared";
import type { ProgramItem, MenuOption } from "@zappaloo/shared";

/** What the wizard holds for one person while it is edited; a program item without a value is open. */
export interface PersonValue {
  attendance: Record<number, boolean>;
  menuId: number | null;
  allergies: string;
}

/**
 * Yes or no per program item as the server has it. A program item in neither list was added to the invitation
 * after the answer: it stays open, so the wizard asks for it (7.4.1).
 */
export function attendanceOf(
  answer: { attendingItemIds: number[]; declinedItemIds: number[] },
  programItems: ProgramItem[],
  perItem: boolean,
): Record<number, boolean> {
  const attendance: Record<number, boolean> = {};
  // One answer per person (RSVP-11): a yes for any program item is a yes for all of them.
  const answered = programItems.some(
    (programItem) =>
      answer.attendingItemIds.includes(programItem.id) ||
      answer.declinedItemIds.includes(programItem.id),
  );
  if (!perItem && answered) {
    const yes = programItems.some((programItem) =>
      answer.attendingItemIds.includes(programItem.id),
    );
    for (const programItem of programItems) attendance[programItem.id] = yes;
    return attendance;
  }
  for (const programItem of programItems) {
    if (answer.attendingItemIds.includes(programItem.id)) attendance[programItem.id] = true;
    else if (answer.declinedItemIds.includes(programItem.id)) attendance[programItem.id] = false;
  }
  return attendance;
}

/** The value of a companion as the server has it. */
export function personOf(
  companion: {
    attendingItemIds: number[];
    declinedItemIds: number[];
    menuId: number | null;
    allergies: string | null;
  },
  programItems: ProgramItem[],
  perItem: boolean,
): PersonValue {
  return {
    attendance: attendanceOf(companion, programItems, perItem),
    menuId: companion.menuId,
    allergies: companion.allergies ?? "",
  };
}

/** True once every program item has a yes or a no. */
export function answeredAll(value: PersonValue, programItems: ProgramItem[]): boolean {
  return programItems.every((programItem) => value.attendance[programItem.id] !== undefined);
}

/** The person attends the program item with the meal and menus exist: the menu is then needed. */
export function needsMenu(
  value: PersonValue,
  programItems: ProgramItem[],
  menus: MenuOption[],
): boolean {
  const attending = programItems
    .filter((programItem) => value.attendance[programItem.id] === true)
    .map((p) => p.id);
  return menuRequired(programItems, menus.length, attending);
}

export function attendsAny(value: PersonValue): boolean {
  return Object.values(value.attendance).some(Boolean);
}

/** The request body of one person's answer. */
export function answerOf(value: PersonValue, programItems: ProgramItem[], menus: MenuOption[]) {
  const attending = attendsAny(value);
  return {
    attendance: programItems.map((programItem) => ({
      programItemId: programItem.id,
      attending: value.attendance[programItem.id] === true,
    })),
    ...(attending
      ? {
          ...(needsMenu(value, programItems, menus) && value.menuId !== null
            ? { menuId: value.menuId }
            : {}),
          allergies: value.allergies.trim() === "" ? null : value.allergies.trim(),
        }
      : {}),
  };
}
