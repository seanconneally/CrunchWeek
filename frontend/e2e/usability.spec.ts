import { expect, test } from "@playwright/test";
import type { Project } from "../src/types";
import { dateLabel } from "../src/utils";

test("first usable plan works without AI and confirms real hours before trusting defaults", async ({
  page,
}, testInfo) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        ai_configured: false,
        ai_provider_name: "AI",
        ai_error: "No provider configured",
        model: null,
        notion_configured: false,
        parent_configured: false,
      },
    }),
  );
  await page.goto("/");
  const initial = (await (
    await page.request.get("/api/project/new")
  ).json()) as Project;
  const due = new Date(`${initial.settings.plan_from}T12:00:00Z`);
  due.setUTCDate(due.getUTCDate() + 7);
  await page
    .getByRole("button", { name: "Upload handbooks", exact: true })
    .click();
  await expect(
    page.getByText(/Document extraction is unavailable/),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Add an assessment manually", exact: true })
    .click();
  await page.getByLabel("Module", { exact: true }).fill("Biology");
  await page.getByLabel("Assessment name").fill("Lab report");
  await page
    .getByLabel("Deadline date", { exact: true })
    .fill(due.toISOString().slice(0, 10));
  await page.getByLabel("Remaining work (hours)").fill("1");
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Make this plan yours" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 of 3 steps complete", { exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("setup-mobile.png"),
    fullPage: true,
    animations: "disabled",
  });
  await page.getByRole("button", { name: /Check deadlines/ }).click();
  await page
    .getByLabel("I checked the date, time and weighting against the source.")
    .check();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await expect(
    page.getByText("2 of 3 steps complete", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm study hours", exact: true })
    .click();
  await page.getByLabel("Available hours each day").fill("1");
  const tomorrow = new Date(`${initial.settings.plan_from}T12:00:00Z`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  await page
    .getByLabel("Plan from", { exact: true })
    .fill(tomorrow.toISOString().slice(0, 10));
  await page
    .getByRole("button", { name: "Save & rebuild plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Make this plan yours" }),
  ).not.toBeVisible();
  await expect(page.locator("#today-title")).toContainText("Lab report");
  await expect(page.locator(".today-hero")).toContainText("60 minutes");
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Make this plan yours" }),
  ).not.toBeVisible();
  await expect(page.locator(".today-hero")).toContainText(
    `Scheduled ${dateLabel(tomorrow.toISOString())}`,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("ready-desktop.png"),
    animations: "disabled",
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: testInfo.outputPath("ready-mobile.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Start next session", exact: true })
    .click();
  await expect(
    page.getByRole("complementary", { name: "Focus timer" }),
  ).toBeVisible();
  await expect(
    page.getByText("0 completed sessions", { exact: true }),
  ).toBeVisible();
});

test("Today prioritises work that cannot fit over starting another session", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  const project = (await (
    await page.request.get("/api/project/new")
  ).json()) as Project;
  const start = new Date(`${project.settings.plan_from}T12:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  project.settings.plan_from = start.toISOString().slice(0, 10);
  start.setUTCDate(start.getUTCDate() + 2);
  project.settings.availability_confirmed = true;
  project.settings.weekdays = [0, 1, 2, 3, 4, 5, 6];
  project.settings.daily_minutes = 60;
  project.assessments = [
    {
      id: crypto.randomUUID(),
      module: "History",
      title: "Research report",
      kind: "Assignment",
      due_date: start.toISOString().slice(0, 10),
      due_time: null,
      weight_percent: 40,
      effort_minutes: 300,
      source_file: "Manual entry",
      source_page: null,
      evidence: "",
      notes: "",
      reviewed: true,
      completed: false,
      tasks: [],
    },
  ];
  await page.getByLabel("Project backup file", { exact: true }).setInputFiles({
    name: "semester.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect(page.locator("#today-title")).toContainText(
    "will not fit before the deadlines",
  );
  await expect(
    page.getByRole("button", { name: "Start next session", exact: true }),
  ).not.toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: testInfo.outputPath("shortfall-desktop.png"),
    animations: "disabled",
  });
  await page
    .getByRole("button", { name: "Fix the study plan", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText(/currently unscheduled/)).toBeVisible();
});
