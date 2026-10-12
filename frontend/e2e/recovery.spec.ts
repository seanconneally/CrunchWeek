import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import type { Project } from "../src/types";

async function seed(page: Page, overloaded = false) {
  await page.goto("/");
  const project = (await (
    await page.request.get("/api/project/new")
  ).json()) as Project;
  // Future dates keep tests independent of the current hour and semester demo.
  const next = new Date(`${project.settings.plan_from}T12:00:00Z`);
  next.setUTCDate(next.getUTCDate() + 1);
  const start = next.toISOString().slice(0, 10);
  next.setUTCDate(next.getUTCDate() + 4);
  const due = next.toISOString().slice(0, 10);
  project.settings.plan_from = start;
  project.settings.weekdays = [0, 1, 2, 3, 4, 5, 6];
  project.settings.daily_minutes = 60;
  project.assessments = [
    {
      id: crypto.randomUUID(),
      module: "Student test",
      title: "Research assignment",
      kind: "Assignment",
      due_date: due,
      due_time: null,
      weight_percent: 40,
      effort_minutes: overloaded ? 420 : 240,
      source_file: "Manual entry",
      source_page: null,
      evidence: "",
      notes: "",
      reviewed: true,
      completed: false,
      tasks: [],
    },
  ];
  const validated = (await (
    await page.request.post("/api/project/validate", {
      data: project,
      headers: { "X-Crunch-Week": "1" },
    })
  ).json()) as Project;
  await page.getByLabel("Project backup file", { exact: true }).setInputFiles({
    name: "test.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(validated)),
  });
  await expect(page.locator("#today-title")).toBeVisible();
  return validated;
}

test("weekly training protects study time and survives reload", async ({
  page,
}) => {
  const project = await seed(page);
  const weekday =
    (new Date(`${project.settings.plan_from}T12:00:00Z`).getUTCDay() + 6) % 7;
  await page
    .getByRole("button", { name: "Add work or training", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add work, training or a class", exact: true })
    .click();
  await page
    .getByLabel("Commitment 1 name", { exact: true })
    .fill("Football training");
  await page
    .getByLabel("Commitment 1 day", { exact: true })
    .selectOption(String(weekday));
  await page.getByLabel("Commitment 1 start", { exact: true }).fill("17:15");
  await page.getByLabel("Commitment 1 end", { exact: true }).fill("18:15");
  await page
    .getByRole("button", { name: "Save commitments & rebuild", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Study plan", exact: true }).click();
  await expect(
    page.getByText("Some work still needs room.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await page
    .getByRole("button", { name: "Add work or training", exact: true })
    .click();
  await expect(
    page.getByLabel("Commitment 1 name", { exact: true }),
  ).toHaveValue("Football training");
  await expect(
    page.getByLabel("Commitment 1 start", { exact: true }),
  ).toHaveValue("17:15");
});

test("one-off work shift protects only its selected date", async ({ page }) => {
  const project = await seed(page);
  await page
    .getByRole("button", { name: "Add work or training", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add work, training or a class", exact: true })
    .click();
  await page
    .getByLabel("Commitment 1 name", { exact: true })
    .fill("Saturday shift");
  await page
    .getByLabel("Commitment 1 repeat", { exact: true })
    .selectOption("once");
  await expect(
    page.getByLabel("Commitment 1 date", { exact: true }),
  ).toHaveValue(project.settings.plan_from);
  await page.getByLabel("Commitment 1 date", { exact: true }).fill("");
  await expect(
    page.getByLabel("Commitment 1 repeat", { exact: true }),
  ).toHaveValue("once");
  await expect(
    page.getByLabel("Commitment 1 date", { exact: true }),
  ).toBeVisible();
  await page
    .getByLabel("Commitment 1 date", { exact: true })
    .fill(project.settings.plan_from);
  await page.getByLabel("Commitment 1 start", { exact: true }).fill("17:00");
  await page.getByLabel("Commitment 1 end", { exact: true }).fill("18:00");
  await page
    .getByRole("button", { name: "Save commitments & rebuild", exact: true })
    .click();
  const response = await page.request.post("/api/plan", {
    data: {
      ...project,
      settings: {
        ...project.settings,
        commitments: [
          {
            id: crypto.randomUUID(),
            title: "Shift",
            date: project.settings.plan_from,
            weekday: 0,
            start: "17:00",
            end: "18:00",
          },
        ],
      },
    },
    headers: { "X-Crunch-Week": "1" },
  });
  const result = await response.json();
  expect(
    result.plan.blocks.every(
      (row: { start: string }) =>
        !row.start.startsWith(project.settings.plan_from),
    ),
  ).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Add work or training", exact: true })
    .click();
  await expect(
    page.getByLabel("Commitment 1 repeat", { exact: true }),
  ).toHaveValue("once");
});

test("recovery compares exact sessions, applies and can undo after progress", async ({
  page,
}) => {
  await seed(page, true);
  await page.getByRole("button", { name: "Make room", exact: true }).click();
  await expect(
    page.getByText("3 hours currently unscheduled", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Only these extra sessions are added:", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".recovery-dates li")).toHaveCount(4);
  await page
    .getByRole("button", {
      name: "Apply: Add small sessions for the next 14 days",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await expect(
    page.getByText("1 hour still needs room.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Done:/ })
    .first()
    .click();
  await expect(
    page.getByText("1 completed session", { exact: true }),
  ).toBeVisible();
  let finishUndo!: () => void;
  const undoGate = new Promise<void>((resolve) => {
    finishUndo = resolve;
  });
  await page.route("**/api/project/validate", async (route) => {
    await undoGate;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Undo availability change", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Semester & availability", exact: true }),
  ).toBeDisabled();
  finishUndo();
  await expect(
    page.getByText("1 completed session", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Semester & availability", exact: true })
    .click();
  await expect(page.getByLabel(/^Extra session \d+ date$/)).toHaveCount(0);
});

test("failed recovery changes do not update the semester", async ({ page }) => {
  await seed(page, true);
  await page.getByRole("button", { name: "Make room", exact: true }).click();
  await expect(page.locator(".recovery-dates li")).toHaveCount(4);
  await page.route("**/api/recovery/apply", (route) =>
    route.fulfill({
      status: 409,
      json: { detail: "Available time changed. Compare again." },
    }),
  );
  await page.getByRole("button", { name: /^Apply:/ }).click();
  await expect(page.getByRole("alert")).toContainText("Available time changed");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(
    page.getByText("3 hours still need room.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Undo availability change", exact: true }),
  ).toHaveCount(0);
});

test("loading a semester keeps the tab selected while waiting", async ({
  page,
}) => {
  await page.goto("/");
  let release!: () => void;
  const loading = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/demo", async (route) => {
    await loading;
    await route.continue();
  });
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  await page.getByRole("button", { name: "Semester", exact: true }).click();
  release();
  await expect(
    page.getByText("Week 10 needs a head start.", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Semester", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});
