#!/usr/bin/env python3
"""Render original OpenConductor onboarding illustrations with ffmpeg (no captured app assets)."""
import argparse
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
FONT = ROOT / "public/fonts/Geist-VariableFont_wght.ttf"
MONO = ROOT / "public/fonts/GeistMono-VariableFont_wght.ttf"
WIDTH, HEIGHT, FPS = 1200, 676, 24
BG, PANEL, LINE = "0x151719", "0x202326", "0x353a3e"
TEXT, MUTED, GREEN, BLUE = "0xe8edef", "0x9aa6ad", "0x9bd3b5", "0x9fc5ef"


def box(x, y, w, h, color=PANEL, start=0):
    return f"drawbox=x={x}:y={y}:w={w}:h={h}:color={color}:t=fill:enable='gte(t,{start})'"


def text(label, x, y, size=22, color=TEXT, start=0, mono=False):
    font = MONO if mono else FONT
    return (f"drawtext=fontfile='{font}':text='{label}':x={x}:y={y}:fontsize={size}:"
            f"fontcolor={color}:alpha='min(max((t-{start})*3,0),1)'")


def window(title, subtitle):
    return [
        box(24, 24, 1152, 627, "0x1b1e20"),
        box(24, 24, 1152, 54, PANEL),
        text("OpenConductor", 50, 42, 20),
        text("ILLUSTRATIVE DEMO", 952, 44, 14, MUTED),
        box(24, 78, 240, 573, "0x191c1e"),
        text("REPOSITORIES", 48, 108, 14, MUTED),
        box(38, 148, 212, 42, "0x2c3338"),
        text("sample-app", 56, 159, 20),
        text("Workspaces", 56, 223, 18, MUTED),
        text("Build navigation", 72, 268, 16, BLUE),
        text("Polish the search", 72, 308, 16, MUTED),
        text("Add test coverage", 72, 348, 16, MUTED),
        text(title, 300, 112, 30),
        text(subtitle, 300, 159, 18, MUTED),
    ]


def workspace_scene():
    filters = window("A workspace for every idea", "Work in parallel without sharing a working tree.")
    for i, (name, branch) in enumerate([
        ("Build navigation", "workspace/navigation"),
        ("Polish the search", "workspace/search"),
        ("Add test coverage", "workspace/tests"),
    ]):
        y, start = 218 + i * 112, 0.6 + i * 1.25
        filters += [box(300, y, 828, 94, PANEL, start), box(300, y, 4, 94, BLUE, start),
                    text(name, 326, y + 19, 23, start=start),
                    text(branch, 326, y + 55, 17, MUTED, start, mono=True),
                    text("Isolated", 1000, y + 36, 17, GREEN, start + 0.35)]
    filters += [text("One repository. Independent workspaces.", 300, 594, 20, GREEN, 4.5)]
    return filters


def agents_scene():
    filters = window("Keep the whole team in view", "See progress, questions, and the next task.")
    for i, (name, status, color, detail) in enumerate([
        ("Build navigation", "Working", BLUE, "Updating the sidebar"),
        ("Polish the search", "Needs attention", "0xedc793", "Choose a search shortcut"),
        ("Add test coverage", "Planned", MUTED, "Ready when you are"),
    ]):
        y, start = 218 + i * 112, 0.5 + i * 0.9
        filters += [box(300, y, 828, 94, PANEL, start),
                    text(name, 324, y + 18, 22, start=start),
                    text(detail, 324, y + 55, 17, MUTED, start + 0.3),
                    text(status, 918, y + 35, 17, color, start + 0.5)]
    for i in range(32):
        filters.append(box(324 + i * 16, 300, 14, 3, BLUE, 1 + i * 0.12))
    filters += [text("Stay focused. Nothing gets lost.", 300, 594, 20, GREEN, 5)]
    return filters


def review_scene():
    filters = window("From changes to a pull request", "Review the work in the same place you started it.")
    filters += [box(300, 212, 828, 332, PANEL), text("src/navigation.ts", 324, 234, 18, MUTED, mono=True)]
    lines = [
        ("  export function navigation() {", TEXT),
        ("-   return items;", "0xe2a7a7"),
        ("+   return items.filter(isVisible);", GREEN),
        ("  }", TEXT),
    ]
    for i, (line, color) in enumerate(lines):
        filters.append(text(line, 328, 284 + i * 35, 20, color, 0.8 + i * 0.35, mono=True))
    filters += [box(324, 451, 780, 66, "0x2d373d", 2.6),
                text("Looks good. Keep the keyboard shortcut.", 346, 475, 20, start=2.6),
                box(850, 568, 278, 50, GREEN, 4),
                text("Create pull request", 878, 583, 20, BG, 4),
                text("Changes reviewed", 300, 584, 20, GREEN, 4.8)]
    return filters


def generate(output):
    output.mkdir(parents=True, exist_ok=True)
    for name, duration, filters in [
        ("workspaces", 6, workspace_scene()),
        ("agents", 7, agents_scene()),
        ("review", 8, review_scene()),
    ]:
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-filter_threads", "2", "-f", "lavfi", "-i",
            f"color=c={BG}:s={WIDTH}x{HEIGHT}:r={FPS}:d={duration}",
            "-vf", ",".join([*filters, "scale=1280:720"]), "-an", "-c:v", "libx264", "-threads", "2",
            "-preset", "medium", "-crf", "23", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
            str(output / f"{name}.mp4"),
        ], check=True, timeout=120)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "public/onboarding")
    generate(parser.parse_args().output.resolve())
