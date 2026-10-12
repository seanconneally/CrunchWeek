import { expect, test } from "@playwright/test";

test("daily progress, undo, moved sessions and durable semester switching", async ({
  page,
  browser,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  await expect(page.locator("#today-title")).toBeVisible();
  await page
    .getByRole("button", { name: /^Done:/ })
    .first()
    .click();
  await expect(
    page.getByText("1 completed session", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Undo / })
    .first()
    .click();
  await expect(
    page.getByText("0 completed sessions", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: /^Move:/ })
    .first()
    .click();
  await expect(page.getByText(/Session moved ·/)).toBeVisible();
  await page
    .getByRole("button", { name: /^Done:/ })
    .first()
    .click();
  await expect(
    page.getByText("1 completed session", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Semesters", exact: true }).click();
  await page
    .getByRole("button", { name: "New semester", exact: true })
    .last()
    .click();
  await expect(
    page.getByRole("heading", { name: /Your deadlines/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Semesters", exact: true }).click();
  await page.getByRole("button", { name: /Autumn semester · demo/ }).click();
  await expect(
    page.getByText("1 completed session", { exact: true }),
  ).toBeVisible();
  // A fresh browser session restores localStorage, even without sessionStorage.
  const state = await page.context().storageState();
  const fresh = await browser.newContext({ storageState: state });
  const reopened = await fresh.newPage();
  await reopened.goto("/");
  await expect(
    reopened.getByText("1 completed session", { exact: true }),
  ).toBeVisible();
  await fresh.close();
});

test("submitted assessments leave the plan and can be reopened", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Or add an assessment manually" })
    .click();
  await page.getByLabel("Module", { exact: true }).fill("TEST");
  await page.getByLabel("Assessment name").fill("Tomorrow essay");
  const tomorrow = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Dublin",
    }).format(d);
  });
  await page.getByLabel("Deadline date", { exact: true }).fill(tomorrow);
  await page
    .getByLabel("I checked the date, time and weighting against the source.")
    .check();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  page.on("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: "Mark submitted", exact: true })
    .click();
  await expect(
    page.getByText("Assessments submitted", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Tomorrow essay", exact: true }),
  ).not.toBeVisible();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Tomorrow essay", exact: true })
    .click();
  await page.getByLabel("Submitted / finished assessment").uncheck();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Tomorrow essay", exact: true }),
  ).toBeVisible();
});
