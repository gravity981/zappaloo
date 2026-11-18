// The name of a table as the pages say it: a plain number is "Tisch 1", a name stays as it is (PRES-06).
import { useTranslation } from "react-i18next";

export function useTableName(): (name: string) => string {
  const { t } = useTranslation();
  return (name) => (/^\d+$/.test(name) ? t("seating.tableNumber", { name }) : name);
}
