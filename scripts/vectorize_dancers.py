"""Trace the supplied dance video into a transparent, standalone animated SVG.

Usage: python scripts/vectorize_dancers.py path/to/video.mp4
Requires OpenCV and NumPy. Masks are tailored to this particular three-person shot.
"""
import argparse
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parent.parent
COLORS = ['#67d8ee', '#bcf36b', '#ea8fc8']


def color_at(point):
    x, y = point
    left = 94 if y < 95 else 85 if y < 175 else 108
    right = 169 if y < 110 else 179 if y < 190 else 166
    return 0 if x < left else 2 if x > right else 1


def trace(frame):
    frame = cv2.resize(frame, (238, 328))
    mask = np.zeros((328, 238), np.uint8)
    # Loose group silhouette. GrabCut refines its boundary for every frame.
    polygon = np.array([(25,105),(60,95),(66,65),(80,39),(119,22),
                        (144,30),(162,70),(169,60),(187,35),(215,45),
                        (236,80),(237,327),(39,327),(55,219),(57,164),
                        (26,152),(8,137),(8,112)], np.int32)
    cv2.fillPoly(mask, [polygon], cv2.GC_PR_FGD)
    # Small seeds safely inside each dancer's clothing throughout this shot.
    cv2.rectangle(mask, (113,113), (143,163), cv2.GC_FGD, -1)
    cv2.rectangle(mask, (87,203), (102,276), cv2.GC_FGD, -1)
    cv2.rectangle(mask, (189,174), (209,263), cv2.GC_FGD, -1)
    cv2.grabCut(frame, mask, None, np.zeros((1,65)), np.zeros((1,65)), 4, cv2.GC_INIT_WITH_MASK)
    foreground = ((mask == 1) | (mask == 3)).astype(np.uint8) * 255
    foreground = cv2.morphologyEx(foreground, cv2.MORPH_CLOSE, np.ones((3,3), np.uint8))
    contours, _ = cv2.findContours(foreground, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    silhouette = np.zeros_like(foreground)
    cv2.drawContours(silhouette, [c for c in contours if cv2.contourArea(c) > 800], -1, 255, -1)
    edges = cv2.Canny(cv2.bilateralFilter(frame, 7, 50, 50), 50, 110)
    edges &= cv2.erode(silhouette, np.ones((3,3), np.uint8))
    # Suppress the recording's small social overlay rather than tracing it.
    edges[270:324, 208:237] = 0
    details, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    outlines, _ = cv2.findContours(silhouette, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    paths = [[], [], []]
    for contour in outlines + details:
        if cv2.arcLength(contour, False) < 10:
            continue
        points = cv2.approxPolyDP(contour, .7, False).reshape(-1, 2).tolist()
        if len(points) < 2:
            continue
        current = color_at(points[0])
        segment = [points[0]]
        for point in points[1:]:
            # The source crops feet/right side: don't draw a rectangular video border.
            if point[0] >= 236 or point[1] >= 326:
                if len(segment) > 1:
                    paths[current].append(segment)
                segment = []
                continue
            color = color_at(point)
            segment.append(point)
            if color != current:
                if len(segment) > 1:
                    paths[current].append(segment)
                segment = [point]
                current = color
        if len(segment) > 1:
            paths[current].append(segment)
    groups = []
    for color, segments in zip(COLORS, paths):
        commands = []
        for segment in segments:
            commands.append('M' + ' L'.join(f'{x},{y}' for x, y in segment))
        groups.append(f'<path stroke="{color}" d="{" ".join(commands)}"/>')
    return ''.join(groups)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('video', type=Path)
    args = parser.parse_args()
    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        raise SystemExit('Não foi possível abrir o vídeo.')
    frames = []
    # Exclude the person crossing the foreground later in the recording.
    for index in range(33):
        capture.set(cv2.CAP_PROP_POS_MSEC, index / 12 * 1000)
        ok, frame = capture.read()
        if not ok:
            break
        frames.append(trace(frame))
    capture.release()
    if len(frames) < 2:
        raise SystemExit('Vídeo sem quadros suficientes.')
    sequence = list(range(len(frames))) + list(range(len(frames)-2, 0, -1))
    duration = len(sequence) / 12
    styles, groups = [], []
    for index, source in enumerate(sequence):
        start, end = index / len(sequence) * 100, (index+1) / len(sequence) * 100
        stops = ('' if index == 0 else '0%{visibility:hidden}') + f'{start:.5f}%{{visibility:visible}}{end:.5f}%{{visibility:hidden}}'
        styles.append(f'@keyframes f{index}{{{stops}}}.f{index}{{animation:f{index} {duration:.5f}s step-end infinite}}')
        groups.append(f'<g class="frame f{index}"><use href="#trace{source}"/></g>')
    header = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 238 328" fill="none" stroke-width=".85" stroke-linecap="round" stroke-linejoin="round" role="img" aria-labelledby="title"><title id="title">Três pessoas dançando, desenhadas em linhas ciano, verde e rosa</title>'
    css = '.frame{visibility:hidden}@media(prefers-reduced-motion:reduce){.frame{animation:none!important}.f0{visibility:visible}}'
    assets = ROOT / 'assets'
    assets.mkdir(exist_ok=True)
    definitions = '<defs>' + ''.join(f'<g id="trace{i}">{frame}</g>' for i, frame in enumerate(frames)) + '</defs>'
    (assets / 'dancers.svg').write_text(header + definitions + '<style>' + css + ''.join(styles) + '</style>' + ''.join(groups) + '</svg>', encoding='utf-8')
    (assets / 'dancers-poster.svg').write_text(header + frames[12] + '</svg>', encoding='utf-8')
    print(f'{len(frames)} quadros vetorizados; loop de {duration:.2f}s; {(assets / "dancers.svg").stat().st_size:,} bytes')


if __name__ == '__main__':
    main()
