#!/usr/bin/env python3
"""Nude and olive versions of the finished hand (02-mao-isolada, French).

The style picker swaps label, colour and image from one state, and with reduced
motion the brief asks for "the finished hand, switching styles directly". The kit
only has the hand in French, so the two other finishes are derived from it:

1. each nail is segmented with GrabCut, seeded by an ellipse measured on the source
   (centre, half length, half width, angle); white French tips that GrabCut drops
   are added back;
2. inside the mask the colour is replaced in Lab: target a/b from the matching
   macro nail (04-nude / 06-verde-oliva), lightness = target + the original
   shading, with the French tip flattened to the nail-body level;
3. the original glossy streaks are put back on top, so the light stays the same.

Output: design/source/images/derived/hand-nude.png, hand-olive.png
Usage: python3 scripts/hand-variants.py   (needs opencv-python, numpy, Pillow)
"""
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
IMG = ROOT / "design/source/images"
OUT = IMG / "derived"

# (cx, cy, half length, half width, angle in degrees, y pointing down), source pixels
NAILS = [
    (755, 252, 52, 21, -37.8),
    (967, 167, 72, 33, -40.7),
    (1082, 200, 73, 34, -44.4),
    (1123, 330, 71, 33, -42.9),
    (1041, 655, 75, 34, -52.8),
]


def ellipse_coords(shape, cx, cy, a, b, ang):
    h, w = shape
    yy, xx = np.mgrid[0:h, 0:w]
    t = np.radians(ang)
    dx, dy = xx - cx, yy - cy
    u = (dx * np.cos(t) + dy * np.sin(t)) / a  # +1 = tip
    v = (-dx * np.sin(t) + dy * np.cos(t)) / b
    return u, v, u**2 + v**2


def nail_mask(rgb, alpha):
    h, w = alpha.shape
    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    # transparent pixels on a dark grey so white tips don't look like background
    bgr = cv2.cvtColor(np.where(alpha[..., None] > 0, rgb, 40).astype(np.uint8), cv2.COLOR_RGB2BGR)
    full = np.zeros((h, w), np.float32)
    for cx, cy, a, b, ang in NAILS:
        u, _, e = ellipse_coords((h, w), cx, cy, a, b, ang)
        seed = np.full((h, w), cv2.GC_BGD, np.uint8)
        seed[e < 1.6] = cv2.GC_PR_BGD
        seed[e < 1.0] = cv2.GC_PR_FGD
        seed[e < 0.35] = cv2.GC_FGD
        seed[alpha < 128] = cv2.GC_BGD
        x0, x1 = max(int(cx - a * 1.8), 0), int(cx + a * 1.8)
        y0, y1 = max(int(cy - a * 1.8), 0), int(cy + a * 1.8)
        sub = seed[y0:y1, x0:x1].copy()
        cv2.grabCut(bgr[y0:y1, x0:x1], sub, None, np.zeros((1, 65)), np.zeros((1, 65)), 6, cv2.GC_INIT_WITH_MASK)
        sel = ((sub == cv2.GC_FGD) | (sub == cv2.GC_PR_FGD)).astype(np.uint8)
        tip = (e < 1.25) & (u > 0.25) & (alpha > 200) & (lab[..., 0] > 215) & (chroma < 12)
        sel = np.maximum(sel, tip[y0:y1, x0:x1].astype(np.uint8))
        n, labels, stats, _ = cv2.connectedComponentsWithStats(sel)
        if n > 1:
            sel = (labels == 1 + np.argmax(stats[1:, cv2.CC_STAT_AREA])).astype(np.uint8)
        sel = cv2.morphologyEx(sel, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        full[y0:y1, x0:x1] = np.maximum(full[y0:y1, x0:x1], sel)
    mask = cv2.GaussianBlur(full, (0, 0), 1.1)
    return np.minimum(mask, alpha / 255.0)


def target_lab(name):
    src = np.array(Image.open(IMG / name).convert("RGBA"))
    solid = src[..., 3] > 250
    return np.median(cv2.cvtColor(src[..., :3], cv2.COLOR_RGB2LAB).astype(np.float32)[solid], axis=0)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    src = np.array(Image.open(IMG / "02-mao-isolada.png").convert("RGBA"))
    rgb, alpha = src[..., :3], src[..., 3]
    h, w = alpha.shape
    mask = nail_mask(rgb, alpha)

    # position along the nail axis, from the closest nail
    U = np.full((h, w), -9.0, np.float32)
    E = np.full((h, w), 99.0, np.float32)
    for nail in NAILS:
        u, _, e = ellipse_coords((h, w), *nail)
        near = (e < 2.2) & (e < E)
        U, E = np.where(near, u, U), np.where(near, e, E)

    lab = cv2.cvtColor(rgb, cv2.COLOR_RGB2LAB).astype(np.float32)
    L = lab[..., 0]
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    body = (mask > 0.9) & (U < 0.35)
    Lb = np.median(L[body])
    inside = (mask > 0.5).astype(np.float32)
    smooth = cv2.GaussianBlur(L * inside, (0, 0), 9) / np.maximum(cv2.GaussianBlur(inside, (0, 0), 9), 1e-3)
    tip = np.clip((U - 0.35) / 0.25, 0, 1) * np.clip((L - Lb - 6) / 10, 0, 1) * np.clip((16 - chroma) / 8, 0, 1)
    tip = cv2.GaussianBlur(tip, (0, 0), 1.5)
    spec = np.clip((L - smooth - 4) / 18, 0, 1) * np.clip((14 - chroma) / 10, 0, 1)
    spec *= 1 - np.clip(tip * 1.5, 0, 1)

    finishes = {
        # name: (target Lab, shading gain, streak strength)
        "nude": (target_lab("04-nude.png"), 0.85, 0.8),
        "olive": (target_lab("06-verde-oliva.png") * np.array([0.84, 1, 1], np.float32) + np.array([0, -3, 3], np.float32), 1.05, 0.9),
    }
    for name, (tgt, gain, streak) in finishes.items():
        Ls = L * (1 - tip) + np.minimum(L, Lb + 3) * tip
        Ls = np.where(spec > 0, smooth * (1 - tip) + np.minimum(smooth, Lb + 3) * tip, Ls)
        new_lab = np.stack([tgt[0] + (Ls - Lb) * gain, np.full_like(L, tgt[1]), np.full_like(L, tgt[2])], -1)
        new = cv2.cvtColor(np.clip(new_lab, 0, 255).astype(np.uint8), cv2.COLOR_LAB2RGB).astype(np.float32)
        s = spec[..., None] * streak
        new = new * (1 - s) + rgb.astype(np.float32) * s
        m = mask[..., None]
        out = rgb.astype(np.float32) * (1 - m) + new * m
        Image.fromarray(np.dstack([np.clip(out, 0, 255).astype(np.uint8), alpha])).save(OUT / f"hand-{name}.png")
        print(f"design/source/images/derived/hand-{name}.png")


if __name__ == "__main__":
    main()
