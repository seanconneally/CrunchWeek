import { expect, test } from "@playwright/test";

test("focus survives pause, navigation, reload and semester switching", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: /^Focus:/ })
    .first()
    .click();
  const timer = page.getByRole("complementary", { name: "Focus timer" });
  await expect(timer).toBeVisible();
  await timer.getByRole("button", { name: "Pause", exact: true }).click();
  const paused = await timer.getByLabel("Time remaining").textContent();
  await page.getByRole("button", { name: "Semester", exact: true }).click();
  await expect(timer.getByLabel("Time remaining")).toHaveText(paused!);
  await page.reload();
  await expect(
    timer.getByRole("button", { name: "Resume", exact: true }),
  ).toBeVisible();
  await expect(timer.getByLabel("Time remaining")).toHaveText(paused!);
  await page
    .getByRole("button", { name: "Start my semester", exact: true })
    .click();
  await expect(
    timer.getByRole("button", { name: "Open its semester", exact: true }),
  ).toBeVisible();
  await timer
    .getByRole("button", { name: "Open its semester", exact: true })
    .click();
  await expect(
    timer.getByRole("button", { name: /^Log \d+ min$/ }),
  ).toBeDisabled();
  await page.clock.install();
  await timer.getByRole("button", { name: "Resume", exact: true }).click();
  await page.clock.fastForward("02:00:00");
  await expect(timer.getByLabel("Time remaining")).toHaveText("00:00");
  await expect(
    page.getByText("0 completed sessions", { exact: true }),
  ).toBeVisible();
  await timer.getByRole("button", { name: /^Log \d+ min$/ }).click();
  await expect(timer).not.toBeVisible();
  await expect(
    page.getByText("1 completed session", { exact: true }),
  ).toBeVisible();
});

test("checklist steps persist without changing reviewed deadlines or study hours", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  const firstTitle = await page
    .locator(".session-card h3")
    .first()
    .textContent();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await page
    .getByRole("button", { name: `Edit ${firstTitle}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use a starter checklist", exact: true })
    .click();
  await page.getByLabel("New checklist step").fill("Check library sources");
  await page.getByLabel("New checklist step").press("Enter");
  await expect(
    page.getByLabel(
      "I checked the date, time and weighting against the source.",
    ),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByLabel("Read the brief and marking criteria", { exact: true })
    .first()
    .check();
  await expect(
    page.getByText("1/5 steps complete", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("0 completed sessions", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(
    page.getByText("1/5 steps complete", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await page
    .getByRole("button", { name: `Edit ${firstTitle}`, exact: true })
    .click();
  await expect(
    page.getByLabel("Read the brief and marking criteria", { exact: true }),
  ).toBeChecked();
  await expect(
    page.getByLabel("Check library sources", { exact: true }),
  ).not.toBeChecked();
});

test("custom weekday hours and weekly goal persist and drive the plan", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Semester & availability", exact: true })
    .click();
  await page
    .getByLabel("Use different hours for each weekday", { exact: true })
    .check();
  for (const day of ["Tuesday", "Wednesday", "Thursday", "Friday"])
    await page.getByLabel(`${day} available`, { exact: true }).uncheck();
  await page.getByLabel("Monday study start", { exact: true }).fill("09:00");
  await page.getByLabel("Monday study hours", { exact: true }).fill("1");
  await page.getByLabel("Weekly study goal (hours)", { exact: true }).fill("2");
  await page
    .getByRole("button", { name: "Save & rebuild plan", exact: true })
    .click();
  await expect(page.getByText("0 / 2 hours", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Study plan", exact: true }).click();
  await expect(page.getByText(/1 hour across your custom week/)).toBeVisible();
  const times = await page.locator(".time-range").allTextContents();
  expect(times.length).toBeGreaterThan(0);
  expect(times.every((value) => value.includes("09:00–10:00"))).toBe(true);
  await page.reload();
  await page
    .getByRole("button", { name: "Semester & availability", exact: true })
    .click();
  await expect(
    page.getByLabel("Monday study hours", { exact: true }),
  ).toHaveValue("1");
  await expect(
    page.getByLabel("Tuesday available", { exact: true }),
  ).not.toBeChecked();
});

test("failed checklist saves restore the previous state", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  const title = await page.locator(".session-card h3").first().textContent();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await page
    .getByRole("button", { name: `Edit ${title}`, exact: true })
    .click();
  await page
    .getByRole("button", { name: "Use a starter checklist", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page.route("**/api/project/validate", (route) =>
    route.fulfill({
      status: 503,
      json: { detail: "Save temporarily unavailable" },
    }),
  );
  await page
    .getByLabel("Read the brief and marking criteria", { exact: true })
    .first()
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "Save temporarily unavailable",
  );
  await expect(
    page
      .getByLabel("Read the brief and marking criteria", { exact: true })
      .first(),
  ).not.toBeChecked();
  await page.unroute("**/api/project/validate");
  await page.reload();
  await expect(
    page
      .getByLabel("Read the brief and marking criteria", { exact: true })
      .first(),
  ).not.toBeChecked();
});
