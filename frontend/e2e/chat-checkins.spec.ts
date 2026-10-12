import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { createHash, randomUUID } from "node:crypto";
import type { ChatProposal, Project } from "../src/types";
const headers = { "X-Crunch-Week": "1" };
async function seed(page: Page) {
  page.on("dialog", (dialog) => dialog.accept());
  await page.goto("/");
  const project: Project = await (
    await page.request.get("/api/project/new")
  ).json();
  const date = new Date(`${project.settings.plan_from}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  project.settings.plan_from = date.toISOString().slice(0, 10);
  date.setUTCDate(date.getUTCDate() + 6);
  project.settings.weekdays = [0, 1, 2, 3, 4, 5, 6];
  project.settings.daily_minutes = 180;
  project.assessments = [
    {
      id: randomUUID(),
      module: "CS",
      title: "Research report",
      kind: "Assignment",
      due_date: date.toISOString().slice(0, 10),
      due_time: null,
      weight_percent: 40,
      effort_minutes: 240,
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
  await expect(page.locator("#today-title")).toBeVisible();
  return project;
}
async function saved(page: Page): Promise<Project> {
  return page.evaluate(() => {
    const lib = JSON.parse(localStorage.getItem("crunch-week-library-v1")!);
    return lib.projects[lib.active];
  });
}
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, val]) => `${JSON.stringify(key)}:${stable(val)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
async function proposal(page: Page, project: Project): Promise<ChatProposal> {
  const keys = [
    "id",
    "module",
    "title",
    "kind",
    "due_date",
    "due_time",
    "weight_percent",
    "reviewed",
    "completed",
    "effort_minutes",
  ];
  const signature = createHash("sha256")
    .update(
      stable({
        id: project.id,
        settings: project.settings,
        assessments: project.assessments.map((item) =>
          Object.fromEntries(
            keys.map((key) => [key, item[key as keyof typeof item]]),
          ),
        ),
        history: project.study_history,
      }).replace(/("weight_percent":)(-?\d+)(?=[,}])/g, "$1$2.0"),
    )
    .digest("hex");
  const impact = {
    remaining_minutes: 0,
    scheduled_minutes: 0,
    unscheduled_minutes: 0,
    next_week_available_minutes: 0,
  };
  const input: ChatProposal = {
    project_id: project.id,
    base_signature: signature,
    review_signature: "0".repeat(64),
    created_at: new Date().toISOString(),
    message: "Review the shift and extra two hours.",
    questions: [],
    commitment_changes: [
      {
        before: null,
        after: {
          id: randomUUID(),
          title: "Work shift",
          date: project.settings.plan_from,
          weekday: 0,
          start: "17:00:00",
          end: "19:00:00",
        },
      },
    ],
    effort_changes: [
      {
        assessment_id: project.assessments[0].id,
        before_minutes: project.assessments[0].effort_minutes,
        after_minutes: project.assessments[0].effort_minutes + 120,
      },
    ],
    before: impact,
    after: impact,
    warnings: [],
  };
  const response = await page.request.post("/api/assistant/review", {
    headers,
    data: { project, proposal: input },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
test("chat clarification, editable preview and confirmed replanning", async ({
  page,
}) => {
  const project = await seed(page);
  let calls = 0;
  let history: unknown[] = [];
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        ai_configured: true,
        ai_provider_name: "Test provider",
        ai_error: null,
        notion_configured: false,
        parent_configured: false,
        model: "test",
      },
    }),
  );
  await page.reload();
  const prepared = await proposal(page, await saved(page));
  await page.route("**/api/assistant/propose", async (route) => {
    calls++;
    history = route.request().postDataJSON().messages;
    await route.fulfill({
      json:
        calls === 1
          ? {
              ...prepared,
              message: "What hours do you mean by Friday evening?",
              questions: ["What hours do you mean by Friday evening?"],
              commitment_changes: [],
              effort_changes: [],
              after: prepared.before,
            }
          : prepared,
    });
  });
  await page.getByRole("button", { name: "Planner chat", exact: true }).click();
  const chat = page.getByRole("complementary", { name: "Planner chat" });
  await chat
    .getByLabel("Message your planner")
    .fill("I work Friday evening, and the report needs another two hours.");
  await expect(
    chat.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await chat.getByRole("checkbox").check();
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    chat.getByText("What hours do you mean by Friday evening?", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    chat.getByRole("button", { name: "Confirm changes & replan" }),
  ).not.toBeVisible();
  expect((await saved(page)).assessments[0].effort_minutes).toBe(240);
  await chat
    .getByLabel("Message your planner")
    .fill("17:00 to 19:00 on the plan's first day.");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(
    chat.getByRole("heading", { name: "Review proposed changes" }),
  ).toBeVisible();
  expect(history).toHaveLength(3);
  expect((await saved(page)).settings.commitments).toHaveLength(0);
  await chat.getByLabel("Proposed remaining work (hours)").fill("7");
  await expect(
    chat.getByRole("button", { name: "Confirm changes & replan" }),
  ).not.toBeVisible();
  await chat
    .getByRole("button", { name: "Update preview", exact: true })
    .click();
  await expect(
    chat.getByRole("button", { name: "Confirm changes & replan" }),
  ).toBeVisible();
  await expect(chat.locator(".chat-impact")).toContainText("4 → 7 h");
  await chat.getByRole("button", { name: "Confirm changes & replan" }).click();
  await expect(chat.getByText(/Confirmed. Your study plan/)).toBeVisible();
  const updated = await saved(page);
  expect(updated.assessments[0].effort_minutes).toBe(420);
  expect(updated.assessments[0].reviewed).toBe(true);
  expect(updated.settings.commitments[0].title).toBe("Work shift");
  await page.reload();
  expect((await saved(page)).assessments[0].effort_minutes).toBe(420);
  expect(updated.id).toBe(project.id);
});
test("direct app edits win over a pending chat response", async ({ page }) => {
  await seed(page);
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        ai_configured: true,
        ai_provider_name: "Test provider",
        ai_error: null,
        notion_configured: false,
        parent_configured: false,
        model: "test",
      },
    }),
  );
  await page.reload();
  const prepared = await proposal(page, await saved(page));
  let release!: () => void;
  const hold = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/api/assistant/propose", async (route) => {
    await hold;
    await route.fulfill({ json: prepared });
  });
  await page.getByRole("button", { name: "Planner chat", exact: true }).click();
  const chat = page.getByRole("complementary", { name: "Planner chat" });
  await chat.getByRole("checkbox").check();
  await chat
    .getByLabel("Message your planner")
    .fill("Add two hours to my report");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await chat.getByRole("button", { name: "Close planner chat" }).click();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Research report", exact: true })
    .click();
  await page.getByLabel("Remaining work (hours)").fill("3");
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  release();
  await page.getByRole("button", { name: "Planner chat", exact: true }).click();
  await expect(chat.getByText(/App edits have been kept/)).toBeVisible();
  await expect(
    chat.getByRole("button", { name: "Confirm changes & replan" }),
  ).toBeDisabled();
  expect((await saved(page)).assessments[0].effort_minutes).toBe(180);
  expect((await saved(page)).settings.commitments).toHaveLength(0);
});
test("session check-ins preserve study logs, remaining-work edits and submission status", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "Study plan", exact: true }).click();
  await page
    .getByRole("button", { name: /^Done:/ })
    .first()
    .click();
  const check = page.getByRole("region", { name: "How did that session go?" });
  await expect(check).toBeVisible();
  const baseline = (await saved(page)).assessments[0].effort_minutes;
  await check
    .getByRole("button", { name: "Need more time", exact: true })
    .click();
  await check.getByRole("button", { name: "+2 h", exact: true }).click();
  expect((await saved(page)).assessments[0].effort_minutes).toBe(baseline);
  await check.getByRole("button", { name: "Confirm remaining hours" }).click();
  await expect(check).not.toBeVisible();
  expect((await saved(page)).assessments[0].effort_minutes).toBe(
    baseline + 120,
  );
  await page
    .getByRole("button", { name: /^Done:/ })
    .first()
    .click();
  await expect(check).toBeVisible();
  await check.getByRole("button", { name: "Finished", exact: true }).click();
  await check
    .getByRole("button", { name: "Confirm study work finished" })
    .click();
  await expect(check).not.toBeVisible();
  const finished = await saved(page);
  expect(finished.assessments[0].effort_minutes).toBe(0);
  expect(finished.assessments[0].completed).toBe(false);
  expect(finished.assessments[0].reviewed).toBe(true);
  expect(finished.study_history).toHaveLength(2);
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: /^Undo / })
    .first()
    .click();
  await expect
    .poll(async () => (await saved(page)).assessments[0].effort_minutes)
    .toBe(baseline + 120);
  await page.getByRole("button", { name: "Study plan", exact: true }).click();
  await page
    .getByRole("button", { name: /^Done:/ })
    .first()
    .click();
  await check.getByRole("button", { name: "Skip progress check" }).click();
  await page.getByRole("button", { name: "Today", exact: true }).click();
  await page
    .getByRole("button", { name: /^Check progress:/ })
    .first()
    .click();
  await check.getByRole("button", { name: "On track", exact: true }).click();
  await expect(check).not.toBeVisible();
  await page.reload();
  expect((await saved(page)).study_history.at(-1)?.feedback).toBe("on_track");
});
test("personal suggestions remain opt-in and editable", async ({ page }) => {
  const project = await seed(page);
  const existing = project.assessments[0];
  for (let i = 0; i < 3; i++) {
    const id = randomUUID();
    project.assessments.push({
      ...existing,
      id,
      title: `Finished ${i}`,
      effort_minutes: 0,
      completed: true,
    });
    const date = new Date(`${project.settings.semester_start}T10:00:00Z`);
    date.setUTCDate(date.getUTCDate() + i);
    const start = date.toISOString();
    date.setUTCMinutes(date.getUTCMinutes() + 60);
    project.study_history.push({
      id: randomUUID(),
      assessment_id: id,
      module: "CS",
      title: `Finished ${i}`,
      start,
      end: date.toISOString(),
      minutes: 60,
      state: "done",
      logged_at: date.toISOString(),
      remaining_before: 60,
      feedback: "finished",
      feedback_previous_remaining: 0,
      reported_remaining: 0,
    });
  }
  await page.getByLabel("Project backup file", { exact: true }).setInputFiles({
    name: "history.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(project)),
  });
  await expect.poll(async () => (await saved(page)).assessments.length).toBe(4);
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Research report", exact: true })
    .click();
  await expect(
    page.getByText("Your logged work suggests 1 h total.", { exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel("Remaining work (hours)")).toHaveValue("4");
  await page
    .getByRole("button", { name: "Use suggested remaining hours" })
    .click();
  await expect(page.getByLabel("Remaining work (hours)")).toHaveValue("1");
  await page.getByLabel("Remaining work (hours)").fill("2.5");
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await expect(page.getByRole("dialog")).not.toBeVisible();
  expect((await saved(page)).assessments[0].effort_minutes).toBe(150);
  expect((await saved(page)).assessments[0].reviewed).toBe(true);
});

test("direct remaining-work edits invalidate an open session check-in", async ({
  page,
}) => {
  await seed(page);
  await page.getByRole("button", { name: "Study plan", exact: true }).click();
  await page
    .getByRole("button", { name: /^Done:/ })
    .first()
    .click();
  const check = page.getByRole("region", { name: "How did that session go?" });
  await check
    .getByRole("button", { name: "Need more time", exact: true })
    .click();
  await page.getByRole("button", { name: "Assessments", exact: true }).click();
  await page
    .getByRole("button", { name: "Edit Research report", exact: true })
    .click();
  await page.getByRole("dialog").getByLabel("Remaining work (hours)").fill("2");
  await page
    .getByRole("button", { name: "Save assessment", exact: true })
    .click();
  await expect(
    check.getByText(
      "Your estimate changed in the app. That edit has been kept.",
    ),
  ).toBeVisible();
  await expect(
    check.getByRole("button", { name: "Confirm remaining hours" }),
  ).toBeDisabled();
  expect((await saved(page)).assessments[0].effort_minutes).toBe(120);
  await check.getByRole("button", { name: "Use latest estimate" }).click();
  await check.getByRole("button", { name: "On track", exact: true }).click();
  await expect(check).not.toBeVisible();
  expect((await saved(page)).assessments[0].effort_minutes).toBe(120);
});

test("built-in app help works without an AI account or consent", async ({
  page,
}) => {
  await seed(page);
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        ai_configured: false,
        ai_provider_name: "OpenAI",
        ai_error: null,
        notion_configured: false,
        parent_configured: false,
        model: "test",
      },
    }),
  );
  await page.reload();
  await page.getByRole("button", { name: "Planner chat", exact: true }).click();
  const chat = page.getByRole("complementary", { name: "Planner chat" });
  await expect(chat.getByRole("checkbox")).not.toBeChecked();
  await chat
    .getByLabel("Message your planner")
    .fill("Where do I set my free hours?");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.locator(".chat-message.is-assistant")).toContainText(
    "Your week, your hours",
  );
  await expect(
    chat.getByRole("button", { name: "Confirm changes & replan" }),
  ).not.toBeVisible();
  expect((await saved(page)).settings.commitments).toHaveLength(0);
});

test("daily limit blocks chat but leaves reviewed confirmation available", async ({
  page,
}) => {
  await seed(page);
  let left = 1;
  await page.route("**/api/assistant/usage", (route) =>
    route.fulfill({
      json: {
        limit: 25,
        used: 25 - left,
        remaining: left,
        reset_at: new Date(Date.now() + 86400000).toISOString(),
        timezone: "Europe/Dublin",
      },
    }),
  );
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        ai_configured: true,
        ai_provider_name: "Test provider",
        ai_error: null,
        notion_configured: false,
        parent_configured: false,
        model: "test",
      },
    }),
  );
  await page.reload();
  const prepared = await proposal(page, await saved(page));
  await page.route("**/api/assistant/propose", (route) => {
    left = 0;
    return route.fulfill({
      json: {
        ...prepared,
        usage: {
          limit: 25,
          used: 25,
          remaining: 0,
          reset_at: new Date(Date.now() + 86400000).toISOString(),
          timezone: "Europe/Dublin",
        },
      },
    });
  });
  await page.getByRole("button", { name: "Planner chat", exact: true }).click();
  const chat = page.getByRole("complementary", { name: "Planner chat" });
  await expect(chat.getByText(/1 \/ 25 messages left today/)).toBeVisible();
  await chat.getByRole("checkbox").check();
  await chat.getByLabel("Message your planner").fill("Add a work shift");
  await chat.getByRole("button", { name: "Send", exact: true }).click();
  await expect(chat.getByText(/0 \/ 25 messages left today/)).toBeVisible();
  await chat.getByLabel("Message your planner").fill("Add another shift");
  await expect(
    chat.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await chat.getByRole("button", { name: "Confirm changes & replan" }).click();
  await expect(chat.getByText(/Confirmed. Your study plan/)).toBeVisible();
  expect((await saved(page)).settings.commitments).toHaveLength(1);
  await page.reload();
  await page.getByRole("button", { name: "Planner chat", exact: true }).click();
  await expect(chat.getByText(/0 \/ 25 messages left today/)).toBeVisible();
});

test("training chat is discoverable on a phone and local provider is independent of document AI", async ({
  page,
}, testInfo) => {
  await page.route("**/api/config", (route) =>
    route.fulfill({
      json: {
        ai_configured: false,
        ai_provider_name: "Document AI",
        ai_error: null,
        model: "",
        chat_configured: true,
        chat_provider_name: "Ollama (on this computer)",
        chat_local: true,
        chat_model: "qwen2.5:1.5b",
        chat_error: null,
        notion_configured: false,
        parent_configured: false,
      },
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Add training with chat", exact: true })
    .click();
  const chat = page.getByRole("complementary", { name: "Planner chat" });
  await expect(chat).toBeVisible();
  await expect(chat.getByLabel("Message your planner")).toBeFocused();
  await expect(chat.getByText(/no paid API calls/)).toBeVisible();
  await chat
    .getByRole("button", { name: /Example: training Tuesdays/ })
    .click();
  await expect(chat.getByLabel("Message your planner")).toHaveValue(
    "I have training every Tuesday and Thursday from 18:00 to 20:00.",
  );
  await expect(
    chat.getByRole("button", { name: "Send", exact: true }),
  ).toBeDisabled();
  await chat.getByRole("checkbox").check();
  await expect(
    chat.getByRole("button", { name: "Send", exact: true }),
  ).toBeEnabled();
  expect((await saved(page)).settings.commitments).toHaveLength(0);
  await chat.getByRole("button", { name: "Close planner chat" }).click();
  await page.getByRole("button", { name: "Planner chat", exact: true }).click();
  await expect(chat.getByLabel("Message your planner")).toHaveValue(
    "I have training every Tuesday and Thursday from 18:00 to 20:00.",
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: testInfo.outputPath("local-training-chat-mobile.png"),
    animations: "disabled",
  });
});


test("cloud training chat names the remote provider and sends only after consent", async ({ page }) => {
  await page.route("**/api/config", route => route.fulfill({json: {
    ai_configured: false, ai_provider_name: "Document AI", ai_error: null, model: "",
    chat_configured: true, chat_provider: "ollama_cloud", chat_provider_name: "Ollama Cloud",
    chat_local: false, chat_model: "gemma4:31b", chat_error: null,
    notion_configured: false, parent_configured: false,
  }}));
  await page.route("**/api/assistant/usage", route => route.fulfill({json: {
    limit: 25, used: 0, remaining: 25, reset_at: new Date(Date.now()+86400000).toISOString(), timezone: "Europe/Dublin",
  }}));
  let calls = 0;
  await page.route("**/api/assistant/propose", route => {
    calls++;
    expect(route.request().postDataJSON().expected_provider).toBe("ollama_cloud");
    return route.fulfill({status: 400, json: {detail: "Mock cloud unavailable. Your plan has not changed."}});
  });
  await page.goto("/");
  await page.getByRole("button", {name: "Add training with chat", exact: true}).click();
  const chat = page.getByRole("complementary", {name: "Planner chat"});
  await expect(chat.getByText(/commitments to Ollama Cloud/)).toBeVisible();
  await expect(chat.getByText(/no paid API calls/)).toHaveCount(0);
  await chat.getByRole("button", {name: /Example: training Tuesdays/}).click();
  await expect(chat.getByRole("button", {name: "Send", exact: true})).toBeDisabled();
  expect(calls).toBe(0);
  await chat.getByRole("checkbox").check();
  await chat.getByRole("button", {name: "Send", exact: true}).click();
  await expect(chat.getByText(/Mock cloud unavailable/)).toBeVisible();
  expect(calls).toBe(1);
  expect((await saved(page)).settings.commitments).toHaveLength(0);
});
