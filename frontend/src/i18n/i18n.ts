// i18n framework (LANG-01): all UI strings come from the message files in
// ./locales. German is the default and, for now, the only UI language.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import deCommon from "./locales/de/common.json";

export const defaultNS = "common";
export const resources = {
  de: { common: deCommon },
} as const;

export const SUPPORTED_LANGUAGES = ["de"] as const;
export const DEFAULT_LANGUAGE = "de";

export async function initI18n(): Promise<typeof i18n> {
  i18n.on("languageChanged", (lng) => {
    document.documentElement.lang = lng;
  });
  await i18n.use(initReactI18next).init({
    lng: DEFAULT_LANGUAGE,
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS,
    ns: [defaultNS],
    resources,
    // React escapes values itself.
    interpolation: { escapeValue: false },
    returnNull: false,
  });
  return i18n;
}
