"""Bounded document ingestion. PDFs are parsed in a time-limited child process."""

from __future__ import annotations

import hashlib
import io
import json
import re
import subprocess
import sys
import zipfile
from dataclasses import dataclass
from pathlib import Path

MAX_BYTES = 25 * 1024 * 1024
MAX_PAGES = 50
MAX_CHARS = 120_000


class DocumentError(ValueError):
    pass


@dataclass(frozen=True)
class Document:
    name: str
    digest: str
    pages: tuple[str, ...]

    @property
    def text(self) -> str:
        return "\n\n".join(f"[PAGE {n}]\n{text}" for n, text in enumerate(self.pages, 1))


def _pdf_pages(data: bytes) -> list[str]:
    from pypdf import PdfReader

    try:
        reader = PdfReader(io.BytesIO(data), strict=False)
        if reader.is_encrypted:
            raise DocumentError("Password-protected PDFs are not supported. Export an unlocked copy.")
        if len(reader.pages) > MAX_PAGES:
            raise DocumentError(f"PDFs must have at most {MAX_PAGES} pages. Upload the assessment section.")
        pages = []
        total = 0
        for page in reader.pages:
            content = page.get_contents()
            if content is not None and len(content.get_data()) > 8 * 1024 * 1024:
                raise DocumentError("A PDF page is too complex. Export a simpler text PDF.")
            text = page.extract_text() or ""
            total += len(text)
            if total > MAX_CHARS:
                raise DocumentError("Document is too long. Upload the assessment section only.")
            pages.append(text)
        if not any(text.strip() for text in pages):
            raise DocumentError("No readable text found. OCR scanned PDFs first, or paste the assessment text.")
        # Never silently miss a scanned page among text pages.
        if any(not text.strip() for text in pages):
            raise DocumentError(
                "At least one page has no readable text. Remove blank pages or OCR the whole PDF first."
            )
        return pages
    except DocumentError:
        raise
    except Exception as exc:
        raise DocumentError("This PDF could not be read. Export a fresh, text-based PDF.") from exc


_W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
_A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"
MAX_UNZIPPED = 60 * 1024 * 1024


def _open_office_zip(data: bytes, kind: str) -> zipfile.ZipFile:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise DocumentError(f"This {kind} file could not be opened. Re-save it and try again.") from exc
    if sum(info.file_size for info in archive.infolist()) > MAX_UNZIPPED:
        raise DocumentError(f"This {kind} file is too large once unpacked.")
    return archive


def _parse_xml(archive: zipfile.ZipFile, member: str):
    from xml.etree import ElementTree

    try:
        return ElementTree.fromstring(archive.read(member))
    except (KeyError, ElementTree.ParseError) as exc:
        raise DocumentError("This Office file is damaged or not a real Word/PowerPoint file.") from exc


def _docx_pages(data: bytes) -> list[str]:
    archive = _open_office_zip(data, "Word")
    root = _parse_xml(archive, "word/document.xml")
    body = root.find(f"{_W}body")
    if body is None:
        raise DocumentError("This Word file has no readable body.")
    lines: list[str] = []
    for block in body:
        if block.tag == f"{_W}p":
            text = "".join(t.text or "" for t in block.iter(f"{_W}t")).strip()
            if text:
                lines.append(text)
        elif block.tag == f"{_W}tbl":
            # Keep table rows on one line so assessment/weight/date stay together.
            for row in block.iter(f"{_W}tr"):
                cells = [
                    " ".join("".join(t.text or "" for t in p.iter(f"{_W}t")) for p in cell.iter(f"{_W}p")).strip()
                    for cell in row.iter(f"{_W}tc")
                ]
                if any(cells):
                    lines.append(" | ".join(cells))
    # Word has no fixed pages; group into ~3,000 character sections for source references.
    return _group_lines(lines)


def _pptx_pages(data: bytes) -> list[str]:
    archive = _open_office_zip(data, "PowerPoint")
    slides = sorted(
        (n for n in archive.namelist() if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)),
        key=lambda n: int(re.findall(r"\d+", n)[-1]),
    )
    if len(slides) > MAX_PAGES:
        raise DocumentError(f"Presentations must have at most {MAX_PAGES} slides.")
    pages = []
    for name in slides:
        root = _parse_xml(archive, name)
        paras = ["".join(t.text or "" for t in p.iter(f"{_A}t")).strip() for p in root.iter(f"{_A}p")]
        pages.append("\n".join(p for p in paras if p))
    return [p for p in pages if p.strip()]


def _decode_text(data: bytes, *, lenient: bool = False) -> str:
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        if not lenient:
            raise DocumentError("Text files must use UTF-8 encoding.") from exc
        text = data.decode("cp1252", errors="replace")  # Excel's default CSV export
    if "\x00" in text:
        raise DocumentError("This text file contains binary data.")
    return text


def _xlsx_pages(data: bytes) -> list[str]:
    import datetime as dt

    archive = _open_office_zip(data, "Excel")
    ns = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
    shared: list[str] = []
    if "xl/sharedStrings.xml" in archive.namelist():
        root = _parse_xml(archive, "xl/sharedStrings.xml")
        shared = ["".join(t.text or "" for t in si.iter(f"{ns}t")) for si in root.iter(f"{ns}si")]
    # Deadlines are often real Excel dates, stored as day numbers. Find which styles are dates.
    date_styles: set[int] = set()
    percent_styles: set[int] = set()
    if "xl/styles.xml" in archive.namelist():
        styles = _parse_xml(archive, "xl/styles.xml")
        custom = {int(f.get("numFmtId", "0")): (f.get("formatCode") or "") for f in styles.iter(f"{ns}numFmt")}
        xfs = styles.find(f"{ns}cellXfs")
        for index, xf in enumerate(xfs if xfs is not None else []):
            fmt = int(xf.get("numFmtId", "0"))
            code = re.sub(r'"[^"]*"|\[[^\]]*\]', "", custom.get(fmt, "")).casefold()
            if fmt in (9, 10) or "%" in code:
                percent_styles.add(index)
            elif 14 <= fmt <= 22 or 45 <= fmt <= 47 or any(c in code for c in "dy") or "mmm" in code:
                date_styles.add(index)
    sheets = sorted(
        (n for n in archive.namelist() if re.fullmatch(r"xl/worksheets/sheet\d+\.xml", n)),
        key=lambda n: int(re.findall(r"\d+", n)[-1]),
    )
    pages = []
    for name in sheets[:MAX_PAGES]:
        rows = []
        for row in _parse_xml(archive, name).iter(f"{ns}row"):
            cells = []
            for cell in row.iter(f"{ns}c"):
                kind = cell.get("t")
                value = cell.find(f"{ns}v")
                raw = value.text if value is not None and value.text else ""
                if kind == "s" and raw.isdigit() and int(raw) < len(shared):
                    raw = shared[int(raw)]
                elif kind == "inlineStr":
                    raw = "".join(t.text or "" for t in cell.iter(f"{ns}t"))
                elif kind in (None, "n") and raw:
                    style = int(cell.get("s", "0"))
                    try:
                        number = float(raw)
                        if style in date_styles:
                            moment = dt.datetime(1899, 12, 30) + dt.timedelta(minutes=round(number * 1440))
                            raw = moment.strftime("%Y-%m-%d %H:%M" if number % 1 else "%Y-%m-%d")
                        elif style in percent_styles:
                            raw = f"{number * 100:g}%"
                    except (ValueError, OverflowError):
                        pass
                cells.append(raw.strip())
            if any(cells):
                rows.append(" | ".join(cells))
        if rows:
            pages.append("\n".join(rows))
    return pages


def _opendocument_pages(data: bytes) -> list[str]:
    archive = _open_office_zip(data, "OpenDocument")
    root = _parse_xml(archive, "content.xml")
    text_ns = "{urn:oasis:names:tc:opendocument:xmlns:text:1.0}"
    table_ns = "{urn:oasis:names:tc:opendocument:xmlns:table:1.0}"
    in_tables = {id(p) for cell in root.iter(f"{table_ns}table-cell") for p in cell.iter()}
    lines = []
    for element in root.iter():
        if element.tag == f"{table_ns}table-row":
            cells = [
                " ".join("".join(p.itertext()) for p in c.iter(f"{text_ns}p")).strip()
                for c in element.iter(f"{table_ns}table-cell")
            ]
            if any(cells):
                lines.append(" | ".join(cells))
        elif element.tag in (f"{text_ns}p", f"{text_ns}h") and id(element) not in in_tables:
            text = "".join(element.itertext()).strip()
            if text:
                lines.append(text)
    return _group_lines(lines)


def _html_pages(data: bytes) -> list[str]:
    from html.parser import HTMLParser

    class Collector(HTMLParser):
        blocks = {"p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "section"}

        def __init__(self) -> None:
            super().__init__()
            self.parts: list[str] = []
            self.skip = 0

        def handle_starttag(self, tag, attrs):
            if tag in ("script", "style", "noscript"):
                self.skip += 1
            elif tag in ("td", "th"):
                self.parts.append(" | ")
            elif tag in self.blocks:
                self.parts.append("\n")

        def handle_endtag(self, tag):
            if tag in ("script", "style", "noscript") and self.skip:
                self.skip -= 1
            elif tag in self.blocks:
                self.parts.append("\n")

        def handle_data(self, text):
            if not self.skip:
                self.parts.append(text)

    collector = Collector()
    collector.feed(_decode_text(data, lenient=True))
    text = "".join(collector.parts)
    lines = [re.sub(r"[ \t\xa0]+", " ", line).strip(" |") for line in text.splitlines()]
    return _group_lines([line for line in lines if line])


def _rtf_pages(data: bytes) -> list[str]:
    text = data.decode("latin-1")
    text = re.sub(r"\\'([0-9a-fA-F]{2})", lambda m: bytes.fromhex(m.group(1)).decode("cp1252"), text)
    text = re.sub(r"\\(par|line|row|cell)\b ?", "\n", text)
    text = re.sub(r"\{\\(\*|fonttbl|colortbl|stylesheet|info)[^{}]*(\{[^{}]*\}[^{}]*)*\}", "", text)
    text = re.sub(r"\\[a-zA-Z]+-?\d* ?", "", text)
    text = re.sub(r"[{}]", "", text)
    return _group_lines([line.strip() for line in text.splitlines() if line.strip()])


def _group_lines(lines: list[str], size: int = 3000) -> list[str]:
    pages: list[str] = []
    current = ""
    for line in lines:
        if current and len(current) + len(line) > size:
            pages.append(current)
            current = ""
        current += line + "\n"
    if current:
        pages.append(current)
    return pages


def _pdf_pages_isolated(data: bytes) -> list[str]:
    if not data.lstrip().startswith(b"%PDF-"):
        raise DocumentError("This file does not have a valid PDF header.")
    try:
        result = subprocess.run(
            [sys.executable, "-m", "crunch_week.documents"],
            input=data,
            capture_output=True,
            timeout=25,
            check=False,
            cwd=Path(__file__).resolve().parent.parent,
        )
    except subprocess.TimeoutExpired as exc:
        raise DocumentError("PDF parsing timed out. Upload a simpler PDF or a text file.") from exc
    try:
        payload = json.loads(result.stdout)
    except (ValueError, UnicodeError) as exc:
        raise DocumentError("PDF parser stopped unexpectedly. Try a simpler PDF.") from exc
    if result.returncode or "error" in payload:
        raise DocumentError(payload.get("error", "PDF could not be read."))
    return payload["pages"]


IMAGE_TYPES = {".png", ".jpg", ".jpeg", ".heic", ".gif", ".webp", ".tif", ".tiff", ".bmp"}
LEGACY_TYPES = {".doc": "Word", ".ppt": "PowerPoint", ".xls": "Excel", ".pages": "Pages", ".key": "Keynote"}
SUPPORTED = (
    ".pdf .docx .docm .dotx .pptx .pptm .xlsx .xlsm .odt .odp .ods .html .htm .rtf .txt .md .csv .tsv .zip"
).split()


def _pages_for(name: str, data: bytes) -> list[str]:
    suffix = Path(name).suffix.casefold()
    if suffix == ".pdf":
        return _pdf_pages_isolated(data)
    if suffix in (".docx", ".docm", ".dotx"):
        return _docx_pages(data)
    if suffix in (".pptx", ".pptm"):
        return _pptx_pages(data)
    if suffix in (".xlsx", ".xlsm"):
        return _xlsx_pages(data)
    if suffix in (".odt", ".odp", ".ods"):
        return _opendocument_pages(data)
    if suffix in (".html", ".htm"):
        return _html_pages(data)
    if suffix == ".rtf":
        return _rtf_pages(data)
    if suffix in (".txt", ".md"):
        return [_decode_text(data)]
    if suffix in (".csv", ".tsv"):
        text = _decode_text(data, lenient=True)
        return _group_lines([line.replace("\t", " | ") for line in text.splitlines() if line.strip()])
    if suffix in IMAGE_TYPES:
        raise DocumentError("Images and screenshots can't be read yet. Upload the handbook as a PDF or Word file.")
    if suffix in LEGACY_TYPES:
        raise DocumentError(f"Old or Apple {LEGACY_TYPES[suffix]} files aren't supported. Export as PDF first.")
    raise DocumentError("Supported files: PDF, Word, PowerPoint, Excel, OpenDocument, HTML, RTF, text, CSV and ZIP.")


def _zip_pages(data: bytes) -> list[str]:
    archive = _open_office_zip(data, "ZIP")
    pages: list[str] = []
    errors: list[str] = []
    for info in archive.infolist():
        member = info.filename.replace("\\", "/")
        base = member.rsplit("/", 1)[-1]
        if info.is_dir() or member.startswith("__MACOSX/") or base.startswith((".", "~$")):
            continue
        suffix = Path(base).suffix.casefold()
        if suffix not in SUPPORTED or suffix == ".zip":
            continue
        try:
            member_pages = _pages_for(base, archive.read(info))
        except DocumentError as error:
            errors.append(f"{base}: {error}")
            continue
        pages.extend(f"[FILE {base}]\n{page}" for page in member_pages if page.strip())
        if len(pages) > MAX_ZIP_PAGES:
            raise DocumentError(f"This ZIP has more than {MAX_ZIP_PAGES} pages of content. Upload fewer files.")
    if not pages:
        detail = f" {errors[0]}" if errors else ""
        raise DocumentError(f"No readable handbooks found in this ZIP.{detail}")
    return pages


MAX_ZIP_PAGES = 150


def read_document(name: str, data: bytes) -> Document:
    safe_name = name.replace("\\", "/").rsplit("/", 1)[-1][:255]
    if not data or len(data) > MAX_BYTES:
        raise DocumentError(f"Each file must be nonempty and no larger than {MAX_BYTES // (1024 * 1024)} MB.")
    suffix = Path(safe_name).suffix.casefold()
    pages = _zip_pages(data) if suffix == ".zip" else _pages_for(safe_name, data)
    pages = [page for page in pages if page.strip()] if suffix != ".pdf" else pages
    if not pages:
        raise DocumentError("No readable text found in this file.")
    if suffix in (".txt", ".md") and len(pages[0]) > MAX_CHARS:
        raise DocumentError("Upload readable text of 1–120,000 characters.")
    if sum(len(page) for page in pages) > MAX_CHARS:
        raise DocumentError("Document is too long. Upload the assessment section only.")
    return Document(safe_name, hashlib.sha256(data).hexdigest(), tuple(pages))


def chunks(document: Document, size: int = 18_000, overlap: int = 800) -> list[str]:
    """Keep page markers and overlap long pages to protect split table rows."""
    if size < 1000 or not 0 <= overlap < size:
        raise ValueError("Invalid chunk size/overlap")
    parts: list[str] = []
    current = ""
    for number, page in enumerate(document.pages, 1):
        for start in range(0, max(len(page), 1), size - overlap):
            piece = f"[PAGE {number}]\n{page[start : start + size]}\n"
            if current and len(current) + len(piece) > size:
                parts.append(current)
                current = ""
            current += piece
            if start + size >= len(page):
                break
    if current:
        parts.append(current)
    return parts


if __name__ == "__main__":
    # Linux/Docker: contain decompression bombs. Windows still has a wall-time limit.
    if sys.platform != "win32":
        import resource

        try:
            resource.setrlimit(resource.RLIMIT_AS, (768 * 1024 * 1024, 768 * 1024 * 1024))
        except (ValueError, OSError):
            pass  # macOS does not support this limit
    try:
        print(json.dumps({"pages": _pdf_pages(sys.stdin.buffer.read(MAX_BYTES + 1))}))
    except DocumentError as error:
        print(json.dumps({"error": str(error)}))
        sys.exit(1)
