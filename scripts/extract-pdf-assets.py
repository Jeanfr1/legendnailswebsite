#!/usr/bin/env python3
"""Pull the animation assets out of the catalogue PDF.

The kit arrived as a PDF (the PNG zip mentioned on its last page was not part of
the delivery), so the images embedded in it are the source files. They are
written to design/source/images with the catalogue numbering (01 … 10).

The order of the images inside each page does not follow the captions, so the
mapping below was checked visually against the catalogue.

Usage: python3 scripts/extract-pdf-assets.py   (needs pypdf + Pillow)
"""
from pathlib import Path

import pypdf

ROOT = Path(__file__).resolve().parent.parent
PDF = ROOT / "design/source/legend-nails-catalogo-assets.pdf"
OUT = ROOT / "design/source/images"

# (page index, image index on that page) -> catalogue name
NAMES = {
    (0, 0): "01-retrato",
    (0, 1): "02-mao-isolada",
    # (0, 2) is the transparent logo, delivered separately as 11-logo.png
    (1, 0): "03-base-marfim",
    (1, 1): "06-verde-oliva",
    (1, 2): "05-francesinha",
    (1, 3): "04-nude",
    (2, 0): "07-brilho",
    (2, 1): "10-composicao",
    (2, 2): "09-pincel",
    (2, 3): "08-traco",
}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    reader = pypdf.PdfReader(PDF)
    for p, page in enumerate(reader.pages):
        for i, image in enumerate(page.images):
            name = NAMES.get((p, i))
            if not name:
                continue
            target = OUT / f"{name}.png"
            image.image.save(target)
            print(f"{target.relative_to(ROOT)}  {image.image.mode} {image.image.size}")


if __name__ == "__main__":
    main()
