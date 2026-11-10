// Shows its children only if the feature is enabled for the event (CFG-03).
import type { ReactNode } from "react";
import type { FeatureName } from "@zappaloo/shared";
import { useFeature } from "./event.ts";

export function FeatureGate({
  feature,
  children,
  fallback = null,
}: {
  feature: FeatureName;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  return useFeature(feature) ? children : fallback;
}
