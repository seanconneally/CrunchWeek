import { expect, test } from "@playwright/test";

test("demo, review, constrained planning, calendar download and backup restore", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(page.getByText("Week 10 needs a head start.")).toBeVisible();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit AI prototype", exact: true })
    .click();
  await page.getByLabel("Assessment name").fill("AI prototype updated");
  await expect(
    page.getByLabel(
      "I checked the date, time and weighting against the source.",
    ),
  ).not.toBeChecked();
  await page
    .getByLabel("I checked the date, time and weighting against the source.")
    .check();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "AI prototype updated", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Semester & availability", exact: true })
    .click();
  await page.getByLabel("Available hours each day").fill("0.5");
  await page
    .getByRole("button", { name: "Save & rebuild plan", exact: true })
    .click();
  await page.getByRole("button", { name: "Study plan", exact: true }).click();
  await expect(page.getByText("Some work still needs room.")).toBeVisible();
  await page
    .getByRole("button", { name: "Notion & exports", exact: true })
    .click();
  const calendarPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Calendar \(\.ics\)/ }).click();
  expect((await calendarPromise).suggestedFilename()).toBe("crunch-week.ics");
  const backupPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download project backup", exact: true })
    .click();
  const backup = await backupPromise;
  const path = await backup.path();
  expect(path).toBeTruthy();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Start my semester", exact: true })
    .click();
  await expect(page.getByText("Three handbooks.")).toBeVisible();
  await page
    .getByLabel("Project backup file", { exact: true })
    .setInputFiles(path!);
  await expect(page.getByText("Week 10 needs a head start.")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "AI prototype updated", exact: true }),
  ).toBeVisible();
});

test("manual entry stays out of planning until reviewed; unknown dates stay visible", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Or add an assessment manually" })
    .click();
  await page.getByLabel("Module", { exact: true }).fill("TEST101");
  await page.getByLabel("Assessment name").fill("Date not announced");
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await page
    .getByRole("button", { name: /Assessments/ })
    .first()
    .click();
  await expect(
    page.getByRole("cell", {
      name: "Date to confirm Check source",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Edit Date not announced" }).click();
  await page
    .getByLabel("I checked the date, time and weighting against the source.")
    .check();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await page.getByRole("button", { name: "Study plan", exact: true }).click();
  await expect(
    page.getByText("Deadline unknown; add a confirmed date."),
  ).toBeVisible();
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore the demo" }).click();
  await expect(page.getByText("Your semester, at a glance.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
