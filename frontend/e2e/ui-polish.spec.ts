import { expect, test } from "@playwright/test";

test("assessment filters explain empty results and recover without losing work", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  await expect(page.locator("#today-title")).toBeVisible();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  const rows = page.locator(".assessment-table tbody tr");
  const total = await rows.count();
  expect(total).toBeGreaterThan(0);
  await page.getByLabel("Search assessments").fill("no-such-assessment");
  await page.getByLabel("Assessment status").selectOption("submitted");
  await expect(
    page.getByRole("heading", { name: "No matching assessments" }),
  ).toBeVisible();
  await expect(
    page.getByRole("status").filter({ hasText: /0 of .* assessments match/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Show all assessments" }).click();
  await expect(rows).toHaveCount(total);
  await expect(page.getByLabel("Assessment status")).toHaveValue("all");
  await page.getByLabel("Search assessments").fill(" AI prototype ");
  await expect(rows).toHaveCount(1);
  await page
    .getByRole("button", { name: "Clear filters", exact: true })
    .click();
  await expect(rows).toHaveCount(total);
});

test("keyboard users can skip navigation", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Your study day" }),
  ).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
});

for (const colorScheme of ["light", "dark"] as const) {
  test(`responsive navigation, focus action and editing in ${colorScheme} mode`, async ({
    page,
  }, testInfo) => {
    await page.emulateMedia({ colorScheme });
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Switch to dark theme" }),
    ).toBeVisible();
    if (colorScheme === "dark")
      await page.getByRole("button", { name: "Switch to dark theme" }).click();
    await page
      .getByRole("button", { name: "Explore the demo", exact: true })
      .click();
    await expect(page.locator("#today-title")).toBeVisible();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    for (const width of [360, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const name of ["Semester", "Study plan", "Exports"]) {
        await page.getByRole("button", { name, exact: true }).click();
        if (width === 1440 || width === 390) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.screenshot({
            path: testInfo.outputPath(
              `${name.replaceAll(" ", "-")}-${width}-${colorScheme}.png`,
            ),
            animations: "disabled",
          });
        }
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        ).toBe(true);
      }
      await page.getByRole("button", { name: "Today", exact: true }).click();
      await expect(page.getByText("Up next", { exact: true })).toBeVisible();
      await expect(
        page.getByRole("button", { name: "Semesters", exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Start next session", exact: true })
        .click();
      await expect(
        page.getByRole("button", { name: "Pause", exact: true }),
      ).toBeVisible();
      await page
        .getByRole("button", { name: "End focus timer", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Assessments", exact: true })
        .click();
      await page
        .getByRole("button", { name: "Edit AI prototype", exact: true })
        .click();
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();
      await expect(page.getByLabel("Assessment name")).toBeVisible();
      await expect(dialog).toHaveCSS("opacity", "1");
      await page.waitForFunction(() =>
        document
          .getAnimations()
          .every(
            (a) =>
              a.playState !== "running" ||
              a.effect?.getTiming().iterations === Infinity,
          ),
      );
      if (width === 1440 || width === 390)
        await page.screenshot({
          path: testInfo.outputPath(`editor-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
      expect(
        await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth),
      ).toBe(true);
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      if (width === 1440 || width === 390) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await page.screenshot({
          path: testInfo.outputPath(`assessments-${width}-${colorScheme}.png`),
          animations: "disabled",
        });
      }
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= window.innerWidth,
        ),
      ).toBe(true);
    }
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`today-${colorScheme}.png`),
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      animations: "disabled",
      path: testInfo.outputPath(`today-mobile-${colorScheme}.png`),
    });
    expect(errors).toEqual([]);
  });
}

test("appearance can be changed and survives reopening without changing the semester", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Explore the demo", exact: true })
    .click();
  await expect(page.locator("#today-title")).toBeVisible();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await expect(page.locator("#today-title")).toBeVisible();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Switch to dark theme" }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator("#today-title")).toBeVisible();
});
