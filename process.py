#!/usr/bin/env python3
"""
process.py — Photo Gallery Build Script
========================================
One command that does everything:
  - Extracts images/videos from ZIP archives
  - Deduplicates by SHA-256 hash (keeps only one copy)
  - Groups by date (extracted from WhatsApp filenames)
  - Optimizes images (quality 85 JPEG)
  - Generates 400×300 thumbnails
  - Copies videos
  - Generates gallery.json manifest
  - Regenerates README.md

Usage:
  python process.py --source "D:\\E\\Temp"
  python process.py --source "D:\\E\\Temp" --title "My Photos"
  python process.py --source "D:\\E\\Temp" --remove IMG001.jpg
"""

import os
import sys
import json
import hashlib
import shutil
import zipfile
import re
import tempfile
import argparse
from pathlib import Path
from datetime import datetime

# ── Auto-install Pillow if missing ──────────────────────────────────────────
try:
    from PIL import Image, ExifTags
    from PIL import UnidentifiedImageError
except ImportError:
    import subprocess
    print("📦 Installing Pillow...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow", "--quiet"])
    from PIL import Image, ExifTags
    from PIL import UnidentifiedImageError

# ── Constants ────────────────────────────────────────────────────────────────
PROJECT_DIR   = Path(__file__).parent.resolve()
PHOTOS_DIR    = PROJECT_DIR / "photos"
VIDEOS_DIR    = PROJECT_DIR / "videos"
GALLERY_JSON  = PROJECT_DIR / "gallery.json"
README_FILE   = PROJECT_DIR / "README.md"
HASHES_FILE   = PROJECT_DIR / ".processed_hashes.json"
ALBUM_NAMES   = PROJECT_DIR / "album_names.json"

THUMB_SIZE    = (400, 300)
ORIG_QUALITY  = 85

IMAGE_EXTS    = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp", ".tiff", ".tif"}
VIDEO_EXTS    = {".mp4", ".mov", ".avi", ".mkv", ".m4v"}

# ── Friendly album name mappings (auto-generated from dates) ──────────────
MONTH_NAMES = {
    1: "January", 2: "February", 3: "March", 4: "April",
    5: "May", 6: "June", 7: "July", 8: "August",
    9: "September", 10: "October", 11: "November", 12: "December"
}

def date_to_friendly_name(date_str: str) -> str:
    """Convert '2026-11-07' → 'November 7, 2026'."""
    try:
        y, m, d = date_str.split("-")
        return f"{MONTH_NAMES[int(m)]} {int(d)}, {y}"
    except Exception:
        return date_str


def load_custom_album_names() -> dict:
    """Load user-defined album name overrides from album_names.json."""
    if ALBUM_NAMES.exists():
        with open(ALBUM_NAMES, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def get_album_name(date_str: str, custom_names: dict) -> str:
    """Return custom name if defined, else auto-generate from date."""
    return custom_names.get(date_str, date_to_friendly_name(date_str))


# ── Hash helpers ─────────────────────────────────────────────────────────────
def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_hashes() -> dict:
    if HASHES_FILE.exists():
        with open(HASHES_FILE, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


def save_hashes(hashes: dict):
    with open(HASHES_FILE, "w", encoding="utf-8") as f:
        json.dump(hashes, f, indent=2)


# ── Date extraction from WhatsApp filenames ───────────────────────────────
DATE_PATTERN = re.compile(r'(\d{4}-\d{2}-\d{2})')

def extract_date(filename: str) -> str:
    """Extract YYYY-MM-DD from a WhatsApp-style filename, or use 'unsorted'."""
    m = DATE_PATTERN.search(filename)
    if m:
        return m.group(1)
    return "unsorted"


def safe_slug(filename: str) -> str:
    """Convert filename to a filesystem-safe slug, preserve extension."""
    stem = Path(filename).stem
    ext  = Path(filename).suffix.lower()
    # Keep date+time info, replace spaces/colons/parens with underscores
    slug = re.sub(r'[^a-zA-Z0-9._-]', '_', stem)
    slug = re.sub(r'_+', '_', slug).strip('_')
    return slug + (".jpg" if ext in {".jpeg", ".jpg"} else ext)


# ── Image processing ─────────────────────────────────────────────────────────
def fix_orientation(img: Image.Image) -> Image.Image:
    """Auto-rotate image according to EXIF orientation tag."""
    try:
        exif = img._getexif()
        if exif is None:
            return img
        orientation_key = next(
            (k for k, v in ExifTags.TAGS.items() if v == "Orientation"), None
        )
        if orientation_key and orientation_key in exif:
            orientation = exif[orientation_key]
            rotations = {3: 180, 6: 270, 8: 90}
            if orientation in rotations:
                img = img.rotate(rotations[orientation], expand=True)
    except Exception:
        pass
    return img


def process_image(src_path: Path, album_date: str, slug: str) -> dict | None:
    """
    Optimize image and create thumbnail.
    Returns photo metadata dict, or None on failure.
    """
    orig_dir  = PHOTOS_DIR / album_date / "originals"
    thumb_dir = PHOTOS_DIR / album_date / "thumbs"
    orig_dir.mkdir(parents=True, exist_ok=True)
    thumb_dir.mkdir(parents=True, exist_ok=True)

    dest_orig  = orig_dir  / slug
    dest_thumb = thumb_dir / slug

    try:
        with Image.open(src_path) as img:
            img = fix_orientation(img)
            orig_w, orig_h = img.size

            # Save optimized original
            if not dest_orig.exists():
                rgb = img.convert("RGB")
                rgb.save(dest_orig, "JPEG", quality=ORIG_QUALITY, optimize=True)

            # Save thumbnail (cover-fit into THUMB_SIZE)
            if not dest_thumb.exists():
                thumb = img.copy()
                thumb = fix_orientation(thumb)
                thumb.thumbnail((THUMB_SIZE[0] * 2, THUMB_SIZE[1] * 2), Image.LANCZOS)
                # Center-crop to exact thumbnail size
                thumb_w, thumb_h = thumb.size
                tw, th = THUMB_SIZE
                ratio = max(tw / thumb_w, th / thumb_h)
                new_w = int(thumb_w * ratio)
                new_h = int(thumb_h * ratio)
                thumb = thumb.resize((new_w, new_h), Image.LANCZOS)
                left  = (new_w - tw) // 2
                top   = (new_h - th) // 2
                thumb = thumb.crop((left, top, left + tw, top + th))
                thumb = thumb.convert("RGB")
                thumb.save(dest_thumb, "JPEG", quality=80, optimize=True)

        rel_orig  = dest_orig.relative_to(PROJECT_DIR).as_posix()
        rel_thumb = dest_thumb.relative_to(PROJECT_DIR).as_posix()

        return {
            "id":       slug,
            "original": rel_orig,
            "thumb":    rel_thumb,
            "caption":  Path(slug).stem.replace("_", " ").strip(),
            "width":    orig_w,
            "height":   orig_h,
        }
    except (UnidentifiedImageError, Exception) as e:
        print(f"  ⚠️  Skipping {slug}: {e}")
        return None


def process_video(src_path: Path, album_date: str, slug: str) -> dict | None:
    """Copy video file to gallery. Returns video metadata dict."""
    video_dir = VIDEOS_DIR / album_date
    video_dir.mkdir(parents=True, exist_ok=True)
    dest = video_dir / Path(slug).with_suffix(src_path.suffix.lower())

    if not dest.exists():
        shutil.copy2(src_path, dest)

    rel = dest.relative_to(PROJECT_DIR).as_posix()
    return {
        "id":      dest.name,
        "src":     rel,
        "caption": Path(slug).stem.replace("_", " ").strip(),
    }


# ── Main processing pipeline ─────────────────────────────────────────────────
def collect_source_files(source_dir: Path) -> list[tuple[str, Path | bytes]]:
    """
    Collect all media files from source_dir.
    Returns list of (original_filename, file_path_or_bytes).
    ZIP files are extracted in-memory.
    """
    collected = []  # (filename, path)

    for item in sorted(source_dir.iterdir()):
        if item.suffix.lower() == ".zip":
            print(f"  📦 Extracting {item.name}...")
            try:
                with zipfile.ZipFile(item, "r") as zf:
                    for entry in zf.infolist():
                        name = Path(entry.filename).name
                        ext  = Path(name).suffix.lower()
                        if ext in IMAGE_EXTS or ext in VIDEO_EXTS:
                            collected.append(("zip", item, entry.filename, name))
            except zipfile.BadZipFile:
                print(f"  ⚠️  Skipping bad ZIP: {item.name}")
        elif item.suffix.lower() in IMAGE_EXTS or item.suffix.lower() in VIDEO_EXTS:
            collected.append(("file", item, None, item.name))

    return collected


def run(source_dir: Path, title: str, remove_names: list[str]):
    print(f"\n🔍 Scanning source: {source_dir}")
    print(f"📂 Output: {PROJECT_DIR}\n")

    hashes       = load_hashes()         # hash → rel_path  (already processed)
    seen_hashes  = set(hashes.keys())    # hashes of files already in gallery
    custom_names = load_custom_album_names()

    # Albums: date_str → { photos: [], videos: [] }
    albums_data: dict[str, dict] = {}

    # ── Load existing gallery.json to merge (incremental updates) ──────────
    existing_gallery = {}
    if GALLERY_JSON.exists():
        with open(GALLERY_JSON, "r", encoding="utf-8") as f:
            existing_gallery = json.load(f)
        for alb in existing_gallery.get("albums", []):
            albums_data[alb["id"]] = {
                "photos": alb.get("photos", []),
                "videos": alb.get("videos", []),
            }

    # ── Collect source files ─────────────────────────────────────────────
    print("📁 Collecting source files...")
    source_items = collect_source_files(source_dir)
    print(f"   Found {len(source_items)} media files in source.\n")

    new_photos = 0
    new_videos = 0
    skipped_dupes = 0

    with tempfile.TemporaryDirectory() as tmpdir:
        tmppath = Path(tmpdir)

        for item in source_items:
            kind, fpath, zip_entry, orig_name = item
            ext = Path(orig_name).suffix.lower()

            # Extract from ZIP if needed
            if kind == "zip":
                try:
                    with zipfile.ZipFile(fpath, "r") as zf:
                        data = zf.read(zip_entry)
                    tmp_file = tmppath / orig_name
                    tmp_file.write_bytes(data)
                    src = tmp_file
                except Exception as e:
                    print(f"  ⚠️  Cannot read {orig_name} from {fpath.name}: {e}")
                    continue
            else:
                src = fpath

            # ── Duplicate check ───────────────────────────────────────────
            file_hash = sha256_file(src)
            if file_hash in seen_hashes:
                skipped_dupes += 1
                continue
            seen_hashes.add(file_hash)

            # ── Skip if explicitly removed ────────────────────────────────
            if remove_names and orig_name in remove_names:
                print(f"  🗑️  Removing {orig_name} from gallery.")
                continue

            album_date = extract_date(orig_name)
            slug       = safe_slug(orig_name)
            # Ensure unique slug within album
            if album_date not in albums_data:
                albums_data[album_date] = {"photos": [], "videos": []}

            # ── Process image ─────────────────────────────────────────────
            if ext in IMAGE_EXTS:
                meta = process_image(src, album_date, slug)
                if meta:
                    # Avoid duplicate slugs
                    existing_ids = {p["id"] for p in albums_data[album_date]["photos"]}
                    if meta["id"] not in existing_ids:
                        albums_data[album_date]["photos"].append(meta)
                        hashes[file_hash] = meta["original"]
                        new_photos += 1
                        print(f"  🖼️  {orig_name} → {album_date}/originals/{slug}")

            # ── Process video ─────────────────────────────────────────────
            elif ext in VIDEO_EXTS:
                meta = process_video(src, album_date, slug)
                if meta:
                    existing_ids = {v["id"] for v in albums_data[album_date]["videos"]}
                    if meta["id"] not in existing_ids:
                        albums_data[album_date]["videos"].append(meta)
                        hashes[file_hash] = meta["src"]
                        new_videos += 1
                        print(f"  🎬 {orig_name} → {album_date}/{slug}")

    save_hashes(hashes)

    # ── Build sorted gallery.json ─────────────────────────────────────────
    albums_sorted = []
    for date_str in sorted(albums_data.keys()):
        alb = albums_data[date_str]
        photos = sorted(alb["photos"], key=lambda p: p["id"])
        videos = sorted(alb["videos"], key=lambda v: v["id"])
        cover  = photos[0]["thumb"] if photos else (videos[0]["src"] if videos else "")
        albums_sorted.append({
            "id":          date_str,
            "name":        get_album_name(date_str, custom_names),
            "date":        date_str,
            "cover":       cover,
            "photo_count": len(photos),
            "video_count": len(videos),
            "photos":      photos,
            "videos":      videos,
        })

    gallery = {
        "title":     title,
        "generated": datetime.now().isoformat(timespec="seconds"),
        "total_photos": sum(a["photo_count"] for a in albums_sorted),
        "total_videos": sum(a["video_count"] for a in albums_sorted),
        "albums":    albums_sorted,
    }

    with open(GALLERY_JSON, "w", encoding="utf-8") as f:
        json.dump(gallery, f, indent=2, ensure_ascii=False)
    print(f"\n✅ gallery.json written ({gallery['total_photos']} photos, {gallery['total_videos']} videos)")

    # ── Regenerate README.md ──────────────────────────────────────────────
    generate_readme(gallery)
    print("✅ README.md regenerated")

    print(f"\n{'='*50}")
    print(f"  New photos added:   {new_photos}")
    print(f"  New videos added:   {new_videos}")
    print(f"  Duplicates skipped: {skipped_dupes}")
    print(f"  Total in gallery:   {gallery['total_photos']} photos, {gallery['total_videos']} videos")
    print(f"{'='*50}")
    print("\n🚀 Next step — push to GitHub:")
    print("  cd D:\\E\\photo-gallery")
    print('  git add -A')
    print('  git commit -m "Update gallery"')
    print('  git push')
    print()


# ── README generator ──────────────────────────────────────────────────────────
def generate_readme(gallery: dict):
    title    = gallery["title"]
    total_p  = gallery["total_photos"]
    total_v  = gallery["total_videos"]
    albums   = gallery["albums"]
    gen_date = gallery["generated"][:10]

    # GitHub Pages URL (derived from known repo)
    pages_url = "https://vijayalakshmi-kammala.github.io/Gallary/"

    lines = [
        f"# 📸 {title}",
        "",
        f"> A personal photo gallery hosted on GitHub Pages.",
        f"> **[🌐 Open the full gallery →]({pages_url})**",
        "",
        f"![Photos](https://img.shields.io/badge/Photos-{total_p}-blue?style=flat-square&logo=image) "
        f"![Videos](https://img.shields.io/badge/Videos-{total_v}-purple?style=flat-square&logo=youtube) "
        f"![Albums](https://img.shields.io/badge/Albums-{len(albums)}-green?style=flat-square)",
        "",
        "---",
        "",
        "## 📂 Albums",
        "",
    ]

    for alb in albums:
        lines.append(f"### {alb['name']} &nbsp; `{alb['photo_count']} photos · {alb['video_count']} videos`")
        lines.append("")

        # Show up to 6 thumbnails per album
        previews = alb["photos"][:6]
        if previews:
            # GitHub README supports inline images with links
            row = ""
            for ph in previews:
                thumb   = ph["thumb"]
                orig    = ph["original"]
                caption = ph["caption"][:30]
                row += f'<a href="{pages_url}"><img src="{thumb}" width="150" title="{caption}" alt="{caption}"></a> '
            lines.append(row.strip())
            lines.append("")
        if alb["video_count"] > 0:
            lines.append(f"🎬 *+ {alb['video_count']} video(s)*")
            lines.append("")

    lines += [
        "---",
        "",
        "## 🚀 Add New Photos",
        "",
        "```bash",
        "# 1. Drop new photos into your source folder",
        "# 2. Run the build script",
        'python process.py --source "D:\\E\\Temp"',
        "",
        "# 3. Push to GitHub (auto-deploys via GitHub Actions)",
        "git add -A",
        'git commit -m "Add new photos"',
        "git push",
        "```",
        "",
        "## 🗑️ Remove a Photo",
        "",
        "```bash",
        'python process.py --source "D:\\E\\Temp" --remove "photo_name.jpg"',
        "git add -A && git commit -m 'Remove photo' && git push",
        "```",
        "",
        "## 🏷️ Rename Albums",
        "",
        "Edit `album_names.json`:",
        "",
        "```json",
        "{",
        '  "2026-11-07": "Evening Party",',
        '  "2026-11-04": "Morning Event"',
        "}",
        "```",
        "",
        "---",
        f"*Gallery auto-generated on {gen_date}*",
    ]

    with open(README_FILE, "w", encoding="utf-8") as f:
        f.write("\n".join(lines))


# ── Entry point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    # Fix Windows console encoding for emoji output
    if sys.stdout.encoding and sys.stdout.encoding.lower() not in ('utf-8', 'utf8'):
        import io
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

    parser = argparse.ArgumentParser(description="Photo Gallery Builder")
    parser.add_argument("--source", required=True, help="Source folder containing photos/ZIPs")
    parser.add_argument("--title",  default="My Photo Gallery", help="Gallery title")
    parser.add_argument("--remove", nargs="*", default=[], help="Filenames to remove from gallery")
    args = parser.parse_args()

    source = Path(args.source)
    if not source.exists():
        print(f"❌ Source folder not found: {source}")
        sys.exit(1)

    run(source, args.title, args.remove)
