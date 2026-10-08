import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";
import { expect, it } from "vitest";

it("keeps the companion self-contained and uses only public SDK and declared public dependencies", () => {
  const result = experimental_scanPublicSdkOnly(import.meta.dirname, {
    allow: [
      /^typebox(?:\/.*)?$/u,
      /^zod$/u,
      /^vitest(?:\/.*)?$/u,
      /^react(?:\/.*)?$/u,
      /^react-dom(?:\/.*)?$/u,
      /^@testing-library\/(?:react|user-event)$/u,
      /^@radix-ui\/react-slot$/u,
      /^@tanstack\/react-query$/u,
      /^class-variance-authority$/u,
      /^clsx$/u,
      /^tailwind-merge$/u,
    ],
  });
  expect(result.files).toContain("server.ts");
  expect(result.files).toContain("bridge/bb-watch-client.ts");
  expect(result.privateDependencies).toEqual([]);
  expect(result.violations).toEqual([]);
});
