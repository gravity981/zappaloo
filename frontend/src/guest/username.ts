// A username suggested from the guest's name on the invitation (UX mock `invite-register`):
// "Erika Huber" becomes "erika.huber". The guest can change it; it must fit the rules of a username.
const FOLD: Record<string, string> = {
  ä: "ae",
  ö: "oe",
  ü: "ue",
  ß: "ss",
  æ: "ae",
  ø: "o",
  å: "a",
};

export function suggestUsername(guestName: string): string {
  const folded = guestName
    .toLowerCase()
    .replace(/[äöüßæøå]/g, (char) => FOLD[char] ?? char)
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
  const slug = folded
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 32)
    .replace(/\.+$/g, "");
  return slug.length >= 3 ? slug : "";
}
