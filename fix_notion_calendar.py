from pathlib import Path
from datetime import datetime
import ast
import os
import re
import shutil
import subprocess

root = Path.cwd()
paths = [
    root / "crunch_week/notion.py",
    root / "crunch_week/models.py",
    root / "frontend/src/types.ts",
    root / "frontend/src/components/NotionPanel.tsx",
]
if not all(p.is_file() for p in paths):
    raise SystemExit("Run from the Hackathon-Notion folder.")
original = {p: p.read_text(encoding="utf-8") for p in paths}


def once(text, old, new):
    if text.count(old) != 1:
        raise SystemExit("Unexpected source version. No files changed.")
    return text.replace(old, new, 1)


notion, models, types, panel = (original[p] for p in paths)
if "syncCalendar" in panel:
    raise SystemExit("Patch already installed.")

if "calendar_view_id: str | None = None" not in notion:
    notion = once(
        notion,
        "    error: str | None = None",
        "    error: str | None = None\n    calendar_view_id: str | None = None",
    )

start = notion.index("    def ensure_views(")
end = notion.index("\n    def sync(", start)
notion = notion[:start] + '''    def ensure_views(self, target: NotionTarget) -> str:
        metadata = self.request("GET", f"data_sources/{target.data_source_id}", safe_retry=True)
        props = metadata.get("properties", {})
        if "When" not in props:
            raise NotionError("Missing When date property.")
        views = []
        for ref in self.list_all("views", params={"database_id": str(target.database_id)}):
            try:
                view_id = str(UUID(ref["id"]))
            except (KeyError, ValueError, TypeError) as exc:
                raise NotionError("Invalid view ID. Retry sync.") from exc
            views.append(self.request("GET", f"views/{view_id}", safe_retry=True))
        calendar_id = None
        active = {"property": "Lifecycle", "select": {"equals": "Active"}}
        for name, kind in [("Semester calendar", None), ("Deadlines", "Deadline"), ("Study plan", "Study")]:
            layout = "calendar" if kind is None else "table"
            view = next((v for v in views if v.get("name") == name
                         and v.get("type") == layout
                         and v.get("data_source_id") == str(target.data_source_id)), None)
            if view is None:
                filters = [active] + ([{"property": "Kind", "select": {"equals": kind}}] if kind else [])
                payload = {
                    "database_id": str(target.database_id),
                    "data_source_id": str(target.data_source_id),
                    "name": name, "type": layout,
                    "filter": {"and": filters},
                    "sorts": [{"property": "When", "direction": "ascending"}],
                }
                if kind is None:
                    payload["position"] = {"type": "start"}
                    payload["configuration"] = {
                        "type": "calendar",
                        "date_property_id": props["When"]["id"],
                        "view_range": "month",
                        "show_weekends": True,
                    }
                view = self.request("POST", "views", payload=payload)
            if kind is None:
                try:
                    calendar_id = str(UUID(view["id"]))
                except (KeyError, ValueError, TypeError) as exc:
                    raise NotionError("Missing calendar ID. Retry sync.") from exc
        if calendar_id is None:
            raise NotionError("Calendar setup incomplete. Retry sync.")
        return calendar_id
''' + notion[end:]

notion = once(
    notion,
    "                self.ensure_views(target)",
    "                result.calendar_view_id = self.ensure_views(target)",
)
models = once(
    models,
    "class NotionTarget(Model):\n    database_id: UUID\n    data_source_id: UUID",
    "class NotionTarget(Model):\n    database_id: UUID\n    data_source_id: UUID\n    calendar_view_id: UUID | None = None",
)
types = once(
    types,
    "  data_source_id: string;",
    "  data_source_id: string;\n  calendar_view_id?: string | null;",
)

start = panel.index("                  run(async () => {")
end = panel.index("                  })", start) + len("                  })")
if '"/notion/sync"' not in panel[start:end]:
    raise SystemExit("Unexpected sync handler. No files changed.")
panel = (
    panel[:start]
    + "                  run(() => syncCalendar(project.notion!))"
    + panel[end:]
)

helper = '''  async function syncCalendar(target: NotionTarget) {
    const result = await request<{
      created: number; updated: number; superseded: number;
      warnings: string[]; error: string | null; calendar_view_id: string | null;
    }>("/notion/sync", { ...project, notion: target });
    const counts = `${result.created} added · ${result.updated} updated · ${result.superseded} superseded.`;
    if (result.error || !result.calendar_view_id) {
      setError(`${counts} ${result.error || "Calendar setup needs a retry."} ${result.warnings.join(" ")} Click Update Notion calendar to retry.`);
      return;
    }
    save({ ...target, calendar_view_id: result.calendar_view_id }, project.id);
    setStatus(`Calendar ready. ${counts} ${result.warnings.join(" ")}`);
  }
'''
panel = once(
    panel,
    "  async function run(action: () => Promise<void>) {",
    helper + "  async function run(action: () => Promise<void>) {",
)
panel = once(
    panel,
    '''                    setStatus(
                      "Database created. Sync when your assessments are reviewed.",
                    );''',
    "                    await syncCalendar(target);",
)
panel = once(
    panel,
    "(!parent && !config.parent_configured)",
    "(!parent.trim() && !config.parent_configured) || !ready",
)
panel = panel.replace('"Create semester database"', '"Generate Notion calendar"')
panel = panel.replace('"Sync to Notion"', '"Update Notion calendar"')
panel = panel.replace('"Connecting…"', '"Generating…"')

anchor = re.compile(
    r'              <a\s+className="icon-button"[\s\S]*?'
    r'aria-label="Open Notion database"[\s\S]*?</a>'
)
replacement = '''              {project.notion.calendar_view_id && (
                <a className="button secondary"
                  href={`https://www.notion.so/${project.notion.database_id.replaceAll("-", "")}?v=${project.notion.calendar_view_id.replaceAll("-", "")}`}
                  target="_blank" rel="noreferrer">
                  Open your calendar <ArrowUpRight size={18} aria-hidden="true" />
                </a>
              )}'''
panel, count = anchor.subn(lambda m: replacement, panel)
if count != 1:
    raise SystemExit("Unexpected calendar link. No files changed.")

marker = "        {project.notion ? ("
panel = once(
    panel,
    marker,
    '''        {!project.notion && !ready && (
          <p className="small muted">Review every assessment before generating your calendar.</p>
        )}
''' + marker,
)

changed = dict(zip(paths, (notion, models, types, panel)))
for path, text in changed.items():
    if path.suffix == ".py":
        ast.parse(text, filename=str(path))

backup = root / (
    "notion-fix-backup-" + datetime.now().strftime("%Y%m%d-%H%M%S")
)
for path in paths:
    saved = backup / path.relative_to(root)
    saved.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, saved)

try:
    for path, text in changed.items():
        path.write_text(text, encoding="utf-8")
    subprocess.run(
        ["npm.cmd" if os.name == "nt" else "npm", "run", "build"],
        cwd=root / "frontend",
        check=True,
    )
except Exception:
    for path, text in original.items():
        path.write_text(text, encoding="utf-8")
    raise SystemExit("Build failed; changes restored. See the error above.")

print("Patched and built. Restart the backend.")
print("Backups:", backup)