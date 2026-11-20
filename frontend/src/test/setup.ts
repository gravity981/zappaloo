// Setup for frontend component tests (jsdom).
import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";

// `findBy*` and `waitFor` give up after one second by default. A full run has 160 test files at once on the machine,
// and a rendering that takes a second there made the same few tests fail now and then (spec/test-strategy.md 8.8).
// The limit only decides how long a test that really fails waits; a passing one does not wait for it.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
});
