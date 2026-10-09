"""Bounded text extraction for operator-selected official PDFs; no OCR or network."""
import base64
from io import BytesIO
from pypdf import PdfReader


def extract_official_pdf(payload, url, metadata):
    result = dict(url=url, canonical_url=url, title=metadata.get("title"),
                  description=None, body=None, author=None,
                  published_at=metadata.get("published_at"), extraction_method="official-pdf",
                  extraction_confidence="failed", warnings=[])
    try:
        raw = base64.b64decode(payload.split(":", 1)[1], validate=True)
        if len(raw) > 8 * 1024 * 1024 or not raw.startswith(b"%PDF-"):
            raise ValueError("invalid-size-or-format")
        reader = PdfReader(BytesIO(raw))
        if reader.is_encrypted or len(reader.pages) > 20:
            raise ValueError("encrypted-or-over-20-pages")
        body = "\n\n".join(page.extract_text() or "" for page in reader.pages).strip()
        if len(body) < 50 or len(body) > 200000:
            raise ValueError("scanned-empty-or-over-text-bound")
        result.update(body=body, title=result["title"] or body.splitlines()[0][:300],
                      extraction_confidence="medium", warnings=["official-document", "no-ocr"])
    except Exception:
        result["warnings"] = ["official-pdf-unusable-or-outside-bounds"]
    return result
