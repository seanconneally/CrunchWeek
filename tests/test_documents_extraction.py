import io
from types import SimpleNamespace

import pytest
from pypdf import PdfWriter
from reportlab.pdfgen import canvas

from crunch_week.documents import Document, DocumentError, chunks, read_document
from crunch_week.extraction import (
    ExtractedItem,
    ExtractionError,
    ExtractionResult,
    convert_item,
    extract_document,
    merge_assessments,
)


def pdf_bytes(text="Assessment: due 2026-10-09, weighting 40%."):
    stream = io.BytesIO()
    page = canvas.Canvas(stream)
    page.drawString(50, 750, text)
    page.save()
    return stream.getvalue()


def raw_item(**changes):
    return ExtractedItem(
        **{
            "module": "CS401",
            "title": "AI project",
            "kind": "Project",
            "due_date": "2026-10-09",
            "due_time": "17:00",
            "weight_percent": 40,
            "source_page": 1,
            "evidence": "Assessment: due 2026-10-09, weighting 40%.",
            "notes": "",
            **changes,
        }
    )


def test_pdf_text_extracted_in_worker():
    document = read_document("../../module.pdf", pdf_bytes())
    assert document.name == "module.pdf"
    assert "2026-10-09" in document.pages[0]
    assert "[PAGE 1]" in document.text


@pytest.mark.parametrize(
    "name,data",
    [("evil.pdf", b"not pdf"), ("blank.txt", b""), ("binary.txt", b"\xff"), ("file.exe", b"x"), ("nul.txt", b"a\x00b")],
)
def test_bad_uploads_rejected(name, data):
    with pytest.raises(DocumentError):
        read_document(name, data)


def test_scanned_and_encrypted_pdf_rejected():
    writer = PdfWriter()
    writer.add_blank_page(100, 100)
    output = io.BytesIO()
    writer.write(output)
    with pytest.raises(DocumentError, match="OCR"):
        read_document("scan.pdf", output.getvalue())
    writer.encrypt("secret")
    output = io.BytesIO()
    writer.write(output)
    with pytest.raises(DocumentError, match="Password"):
        read_document("locked.pdf", output.getvalue())


def test_page_and_size_limits():
    with pytest.raises(DocumentError, match="25 MB"):
        read_document("large.txt", b"x" * (25 * 1024 * 1024 + 1))
    writer = PdfWriter()
    for _ in range(51):
        writer.add_blank_page(100, 100)
    output = io.BytesIO()
    writer.write(output)
    with pytest.raises(DocumentError, match="50 pages"):
        read_document("long.pdf", output.getvalue())


def test_chunks_keep_page_markers_and_overlap():
    document = Document("x.txt", "digest", ("a" * 3000, "b" * 1200))
    pieces = chunks(document, size=1500, overlap=200)
    assert len(pieces) >= 3
    assert all("[PAGE" in piece for piece in pieces)
    assert any("[PAGE 2]" in piece for piece in pieces)


def test_quote_verification_clears_unsubstantiated_dates():
    document = Document("test.txt", "digest", ("Other text",))
    item = convert_item(raw_item(), document)
    assert not item.reviewed
    assert item.due_date is None and item.due_time is None
    assert "could not be matched" in item.notes


def test_bad_date_and_weight_do_not_become_silent_defaults():
    document = Document("test.txt", "digest", (raw_item().evidence,))
    item = convert_item(raw_item(due_date="2026-02-31", weight_percent=115), document)
    assert item.due_date is None and item.weight_percent is None


def test_reupload_preserves_user_edits_and_reports_conflicts():
    document = Document("test.txt", "digest", (raw_item().evidence,))
    first = convert_item(raw_item(), document)
    changed = first.model_copy(update={"weight_percent": 30, "reviewed": True})
    result, warnings = merge_assessments([changed], [first])
    assert result == [changed]
    assert warnings


def test_real_sdk_parse_request_contract_is_used(monkeypatch, project):
    calls = []

    class FakeOpenAI:
        def __init__(self, **kwargs):
            self.responses = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def parse(self, **kwargs):
            calls.append(kwargs)
            return SimpleNamespace(
                status="completed", output_parsed=ExtractionResult(assessments=[raw_item()], warnings=[])
            )

    monkeypatch.setattr("crunch_week.extraction.OpenAI", FakeOpenAI)
    document = Document("test.txt", "digest", (raw_item().evidence,))
    items, _ = extract_document(document, project.settings, "test-key")
    assert len(items) == 1 and not items[0].reviewed
    assert calls[0]["store"] is False
    assert calls[0]["text_format"] is ExtractionResult
    assert "untrusted" in calls[0]["instructions"]


def test_refusal_does_not_import_partial_results(monkeypatch, project):
    class FakeOpenAI:
        def __init__(self, **kwargs):
            self.responses = self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def parse(self, **kwargs):
            return SimpleNamespace(status="incomplete", output_parsed=None)

    monkeypatch.setattr("crunch_week.extraction.OpenAI", FakeOpenAI)
    with pytest.raises(ExtractionError, match="incomplete"):
        extract_document(Document("x.txt", "d", ("Hello",)), project.settings, "key")


@pytest.mark.parametrize(
    "base_url,model",
    [
        ("https://api.openai.com/v1/", "gpt-4.1-mini"),
        ("https://example.services.ai.azure.com/openai/v1/", "handbook-reader"),
    ],
)
def test_actual_openai_sdk_request_and_response_contract(monkeypatch, project, base_url, model):
    import json

    import httpx
    from openai import OpenAI as ActualOpenAI

    def handler(request):
        body = json.loads(request.content)
        assert str(request.url) == base_url + "responses"
        assert request.headers["authorization"] == "Bearer test-key"
        assert body["model"] == model
        assert body["text"]["format"]["type"] == "json_schema"
        assert body["text"]["format"]["strict"] is True
        assert body["text"]["format"]["schema"]["additionalProperties"] is False
        assert body["store"] is False
        return httpx.Response(
            200,
            json={
                "id": "resp_test",
                "object": "response",
                "created_at": 1791540000,
                "status": "completed",
                "model": model,
                "output": [
                    {
                        "id": "msg_test",
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "content": [
                            {
                                "type": "output_text",
                                "annotations": [],
                                "text": ExtractionResult(assessments=[raw_item()], warnings=[]).model_dump_json(),
                            }
                        ],
                    }
                ],
            },
        )

    monkeypatch.setattr(
        "crunch_week.extraction.OpenAI",
        lambda **kwargs: ActualOpenAI(**kwargs, http_client=httpx.Client(transport=httpx.MockTransport(handler))),
    )
    items, warnings = extract_document(
        Document("x.txt", "digest", (raw_item().evidence,)), project.settings, "test-key", model, base_url=base_url
    )
    assert len(items) == 1 and str(items[0].due_date) == "2026-10-09" and not warnings


def _office_zip(files: dict[str, str]) -> bytes:
    import io
    import zipfile

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        for name, content in files.items():
            archive.writestr(name, content)
    return buffer.getvalue()


def test_word_table_rows_stay_together():
    w = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    xml = (
        f"<w:document {w}><w:body><w:p><w:r><w:t>Outline</w:t></w:r></w:p><w:tbl><w:tr>"
        "<w:tc><w:p><w:r><w:t>Essay</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>40%</w:t></w:r></w:p></w:tc>"
        "</w:tr></w:tbl></w:body></w:document>"
    )
    document = read_document("outline.docx", _office_zip({"word/document.xml": xml}))
    assert document.pages == ("Outline\nEssay | 40%\n",)


def test_zip_reads_supported_files_and_skips_junk():
    data = _office_zip(
        {
            "Week 1/outline.txt": "Essay due 2026-11-03",
            "Week 1/table.csv": "Quiz,10%",
            "__MACOSX/._outline.txt": "junk",
            "Week 1/photo.jpg": "junk",
        }
    )
    document = read_document("moodle.zip", data)
    assert document.pages == ("[FILE outline.txt]\nEssay due 2026-11-03", "[FILE table.csv]\nQuiz,10%\n")


def test_html_drops_scripts_and_keeps_table_cells():
    html = b"<script>bad()</script><table><tr><td>Report</td><td>35%</td></tr></table>"
    assert read_document("page.html", html).pages == ("Report | 35%\n",)


@pytest.mark.parametrize("name", ["scan.png", "old.doc", "slides.key"])
def test_unreadable_formats_explain_next_step(name):
    with pytest.raises(DocumentError, match="PDF"):
        read_document(name, b"x")


def test_azure_error_is_actionable_and_does_not_echo_provider_body(monkeypatch, project):
    import httpx
    from openai import OpenAI as ActualOpenAI

    monkeypatch.setattr(
        "crunch_week.extraction.OpenAI",
        lambda **kwargs: ActualOpenAI(
            **kwargs,
            http_client=httpx.Client(
                transport=httpx.MockTransport(
                    lambda request: httpx.Response(404, json={"error": {"message": "private-provider-detail"}})
                )
            ),
        ),
    )
    with pytest.raises(ExtractionError) as error:
        extract_document(
            Document("x.txt", "d", ("Hello",)),
            project.settings,
            "test-key",
            base_url="https://example.openai.azure.com/openai/v1/",
            provider_label="Azure AI Foundry",
        )
    assert "Azure AI Foundry" in str(error.value)
    assert "deployment" in str(error.value)
    assert "private-provider-detail" not in str(error.value)
