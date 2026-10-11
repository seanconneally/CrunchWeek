import { expect, test } from "@playwright/test";

for (const configured of [true, false]) {
  test(`Foundry upload consent and configuration (${configured})`, async ({
    page,
  }) => {
    await page.route("**/api/config", (route) =>
      route.fulfill({
        json: {
          ai_configured: configured,
          ai_provider_name: "Azure AI Foundry",
          ai_error: configured
            ? null
            : "Set AZURE_OPENAI_API_KEY in the backend .env file, then restart the server.",
          model: "gpt-5.6-luna",
          notion_configured: false,
          parent_configured: false,
        },
      }),
    );
    await page.goto("/");
    await page
      .getByRole("button", { name: "Upload handbooks", exact: true })
      .click();
    await page.getByLabel("Choose module handbooks").setInputFiles({
      name: "synthetic.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("Synthetic assessment"),
    });
    const submit = page.getByRole("button", {
      name: "Extract assessments",
      exact: true,
    });
    await expect(submit).toBeDisabled();
    await page
      .getByLabel(
        "I agree to send these documents' text to Azure AI Foundry for extraction.",
      )
      .check();
    if (configured) {
      await expect(submit).toBeEnabled();
    } else {
      await expect(submit).toBeDisabled();
      await expect(
        page.getByText("Set AZURE_OPENAI_API_KEY", { exact: false }),
      ).toBeVisible();
    }
  });
}
