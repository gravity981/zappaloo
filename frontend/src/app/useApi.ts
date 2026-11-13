// Reads one API resource for a page: loads `path`, parses it with `schema`, and gives `undefined`
// while it loads, when there is no path (a call that is not made), or when the answer does not fit.
import { useEffect, useState } from "react";
import { apiRequest } from "./api.ts";

interface Parser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export function useApiData<T>(path: string | undefined, schema: Parser<T>): T | undefined {
  const [data, setData] = useState<T>();
  useEffect(() => {
    if (path === undefined) return;
    let cancelled = false;
    void apiRequest("GET", path).then((result) => {
      if (cancelled) return;
      const parsed = schema.safeParse(result.body);
      setData(result.ok && parsed.success ? parsed.data : undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [path, schema]);
  return data;
}
