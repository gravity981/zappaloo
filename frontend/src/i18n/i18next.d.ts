// Type-checked translation keys: t("home.title") compiles, t("home.typo") does not.
import type { defaultNS, resources } from "./i18n.ts";

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: typeof defaultNS;
    resources: (typeof resources)["de"];
  }
}
