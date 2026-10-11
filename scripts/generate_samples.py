"""Regenerate openly synthetic one-page module handbooks for the hackathon demo."""

from datetime import date, timedelta
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from crunch_week.demo import DEMO_ITEMS

ROOT = Path(__file__).resolve().parent.parent
START = date(2026, 9, 7)
styles = getSampleStyleSheet()
styles.add(
    ParagraphStyle(
        name="SmallBody",
        fontName="Helvetica",
        fontSize=10,
        leading=15,
        textColor=colors.HexColor("#3e5342"),
        alignment=TA_LEFT,
    )
)


def generate() -> None:
    for code in ("CS401", "PS402", "BS403"):
        items = [item for item in DEMO_ITEMS if item[0].startswith(code)]
        module = items[0][0].replace(" · ", " - ")
        destination = ROOT / "sample_data" / f"{code}_synthetic_demo.pdf"
        document = SimpleDocTemplate(
            str(destination),
            pagesize=(210 * mm, 297 * mm),
            leftMargin=22 * mm,
            rightMargin=22 * mm,
            topMargin=24 * mm,
            bottomMargin=20 * mm,
        )
        story = [
            Paragraph("CRUNCH WEEK / SYNTHETIC DEMO", styles["Heading3"]),
            Spacer(1, 8 * mm),
            Paragraph(module, styles["Title"]),
            Spacer(1, 4 * mm),
            Paragraph("Module assessment outline", styles["Heading2"]),
            Paragraph(
                "This is fictional sample data created for software testing. It is not a university handbook and must not be used as an official assessment schedule.",
                styles["SmallBody"],
            ),
            Spacer(1, 7 * mm),
            Paragraph(
                f"Semester: {START.isoformat()} to {(START + timedelta(weeks=12)).isoformat()}. Week 1 begins on {START.isoformat()}. All deadlines use Europe/Dublin local time.",
                styles["SmallBody"],
            ),
            Spacer(1, 8 * mm),
        ]
        rows = [["Assessment", "Deadline", "Weight"]]
        lines = [
            module,
            "SYNTHETIC DEMO — not official university information.",
            f"Semester starts {START.isoformat()}.",
        ]
        for _, title, _, offset, weight, _ in items:
            due = START + timedelta(days=offset)
            rows.append([Paragraph(title, styles["SmallBody"]), f"{due.isoformat()} 17:00", f"{weight}%"])
            lines.append(f"{title}: due {due.isoformat()} at 17:00; weighting {weight}% of this module.")
        table = Table(rows, colWidths=[82 * mm, 57 * mm, 25 * mm])
        table.setStyle(
            TableStyle(
                [
                    ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#293f32")),
                    ("TEXTCOLOR", (0, 0), (-1, 0), colors.white),
                    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
                    ("FONTSIZE", (0, 0), (-1, -1), 10),
                    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
                    ("BOTTOMPADDING", (0, 0), (-1, -1), 13),
                    ("TOPPADDING", (0, 0), (-1, -1), 13),
                    ("LINEBELOW", (0, 1), (-1, -1), 0.5, colors.HexColor("#d9e2d1")),
                ]
            )
        )
        story += [table, Spacer(1, 10 * mm), Paragraph("Assessment details", styles["Heading2"])]
        story += [Paragraph(line, styles["SmallBody"]) for line in lines[3:]]
        story += [
            Spacer(1, 10 * mm),
            Paragraph(
                "Weights are percentages of this module only. Estimated study effort is not specified: students should enter their own remaining-work estimates after extraction.",
                styles["SmallBody"],
            ),
            Spacer(1, 6 * mm),
            Paragraph(
                "Demo note: the app's one-click demo moves dates relative to today. These PDF fixtures keep the fixed 2026 dates printed above. Set Week 1 to 2026-09-07 when testing these files.",
                styles["SmallBody"],
            ),
        ]
        document.build(story)
        destination.with_suffix(".txt").write_text("\n\n".join(lines) + "\n", encoding="utf-8")
        print(destination.name)


if __name__ == "__main__":
    generate()
