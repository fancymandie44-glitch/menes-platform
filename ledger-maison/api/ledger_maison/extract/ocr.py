from __future__ import annotations

import io
from typing import Callable

from PIL import Image, ImageFilter, ImageOps

from ledger_maison.extract.tabular import parse_table


def ocr_available() -> bool:
    try:
        import pytesseract

        pytesseract.get_tesseract_version()
        return True
    except Exception:
        return False


def preprocess_image(data: bytes) -> Image.Image:
    image = Image.open(io.BytesIO(data)).convert("L")
    image = ImageOps.autocontrast(image)
    image = image.filter(ImageFilter.SHARPEN)
    if image.info.get("dpi", (72, 72))[0] < 200:
        image = image.resize((image.width * 2, image.height * 2))
    return image


def ocr_image(data: bytes, file_name: str, table_from_text: Callable[[str], list[list[str]]]) -> object:
    if not ocr_available():
        raise RuntimeError("Tesseract n'est pas installé")
    import pytesseract

    text = pytesseract.image_to_string(preprocess_image(data), lang="fra+eng")
    rows = table_from_text(text)
    return parse_table(
        rows=rows,
        file_name=file_name,
        file_bytes=data,
        preview=text[:1500],
        extractor="ocr",
    )
