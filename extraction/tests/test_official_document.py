import base64
from io import BytesIO
from pathlib import Path
import sys

from pypdf import PdfWriter
from pypdf.generic import DecodedStreamObject, NameObject, DictionaryObject

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "pipeline"))
from official_document import extract_official_pdf


def payload(text=None, pages=1):
    writer = PdfWriter()
    for _ in range(pages):
        page = writer.add_blank_page(width=600, height=800)
        if text:
            font = DictionaryObject({NameObject("/Type"): NameObject("/Font"),
                                     NameObject("/Subtype"): NameObject("/Type1"),
                                     NameObject("/BaseFont"): NameObject("/Helvetica")})
            page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): writer._add_object(font)})})
            stream = DecodedStreamObject()
            stream.set_data(f"BT /F1 12 Tf 30 750 Td ({text}) Tj ET".encode())
            page[NameObject("/Contents")] = writer._add_object(stream)
    out = BytesIO()
    writer.write(out)
    return "PROJECTBIHAR_PDF_V1:" + base64.b64encode(out.getvalue()).decode()


def test_extracts_notice_with_listing_title_and_date():
    record = extract_official_pdf(payload("Bihar Patna public notice: The education department announces new school buildings across the district."),
                                  "https://bpsc.bihar.gov.in/notice.pdf", {"title": "Bihar education notice", "published_at": "2026-10-09T00:00:00Z"})
    assert record["extraction_confidence"] == "medium"
    assert "school buildings" in record["body"]
    assert record["title"] == "Bihar education notice"
    assert record["published_at"] == "2026-10-09T00:00:00Z"


def test_scans_and_overlong_documents_are_rejected_without_truncation():
    for value in (payload(), payload("Bihar important notice " * 4, pages=21), "PROJECTBIHAR_PDF_V1:invalid"):
        record = extract_official_pdf(value, "https://bpsc.bihar.gov.in/notice.pdf", {})
        assert record["extraction_confidence"] == "failed"
        assert record["body"] is None
