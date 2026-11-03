#!/usr/bin/env python3
"""
Build data/works.json for Iconography Detective.

Pipeline (deterministic -- same input, same output):
  1. Load the National Gallery of Art open data CSVs
     (https://github.com/NationalGalleryOfArt/opendata, CC0).
     If --nga-dir is not given, the needed files are downloaded into .cache/nga.
  2. Keep objects whose *title* names one of the saints in data/lexicon.json,
     dated 1250-1850, with an open-access primary image.
  3. For every (work, saint) pair, search three text sources for each attribute
     pattern in the lexicon:
        desc  -- the NGA's written visual description of the image (assistive text)
        kw    -- NGA subject keyword / theme terms
        title -- the object title
     and keep the first matching sentence as *evidence*.
  4. Write a compact JSON file the static website reads.

Usage:
  python3 scripts/build_data.py                    # downloads NGA data (~200 MB)
  python3 scripts/build_data.py --nga-dir path/to/csvs
"""
import argparse
import csv
import json
import os
import re
import sys
import urllib.request
from collections import defaultdict
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
NGA_RAW = "https://raw.githubusercontent.com/NationalGalleryOfArt/opendata/main/data/"
FILES = ["objects.csv", "objects_terms.csv", "published_images.csv"]

CLASSIFICATIONS = {"Painting", "Print", "Drawing", "Sculpture", "Decorative Art"}
YEAR_MIN, YEAR_MAX = 1250, 1850

# A "saint token" must appear in the title so that e.g. "Paul Revere" is not read as Saint Paul.
SAINT_TOKEN = re.compile(
    r"\b(Saint|Saints|St\.?|Sts\.?|San|Santo|Santa|Sant'|Archangel)\b|Magdalen|Baptist|Giovannino|Patmos",
    re.I,
)
# Titles that signal a group composition rather than a single principal saint.
GROUP_WORDS = re.compile(
    r"Madonna|Virgin|Holy Family|Annunciation|Adoration|Trinity|Lamentation|Piet[aà]|Entombment|"
    r"Nativity|Assumption|Coronation|Holy Kinship|Sacra Conversazione|Saints\b|Sts\.|Apostles|"
    r"\band (Saint|St\.)",
    re.I,
)
SENT_SPLIT = re.compile(r"(?<=[.!?])\s+(?=[A-Z\"“])")


def download(dest):
    os.makedirs(dest, exist_ok=True)
    for f in FILES:
        p = os.path.join(dest, f)
        if not os.path.exists(p):
            print("downloading", f, file=sys.stderr)
            urllib.request.urlretrieve(NGA_RAW + f, p)
    return dest


def read_csv(path):
    csv.field_size_limit(10**9)
    with open(path, encoding="utf-8", newline="") as fh:
        yield from csv.DictReader(fh)


def compile_lexicon(lex):
    def comp(pats):
        return [re.compile(p, re.I) for p in pats]

    universal = [dict(a, rx=comp(a["patterns"])) for a in lex["universal"]]
    saints = []
    for s in lex["saints"]:
        saints.append(
            dict(
                s,
                title_rx=re.compile(s["title"], re.I),
                exclude_rx=re.compile(s["exclude"], re.I) if s.get("exclude") else None,
                attrs=[dict(a, rx=comp(a["patterns"])) for a in s["attributes"]] + universal,
            )
        )
    return saints


def find_evidence(rxs, sources):
    """Return [source, sentence, start, end] for the first pattern match, else None."""
    for src, sentences in sources:
        for sent in sentences:
            for rx in rxs:
                m = rx.search(sent)
                if m:
                    return [src, sent, m.start(), m.end()]
    return None


def to_int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nga-dir", help="folder containing NGA open data CSVs")
    ap.add_argument("--out", default=os.path.join(ROOT, "data", "works.json"))
    args = ap.parse_args()

    nga = args.nga_dir or download(os.path.join(ROOT, ".cache", "nga"))
    lex = json.load(open(os.path.join(ROOT, "data", "lexicon.json"), encoding="utf-8"))
    saints = compile_lexicon(lex)

    images = {}
    for r in read_csv(os.path.join(nga, "published_images.csv")):
        if r["viewtype"] == "primary" and r["openaccess"] == "1":
            images[r["depictstmsobjectid"]] = r

    terms = defaultdict(list)
    for r in read_csv(os.path.join(nga, "objects_terms.csv")):
        if r["termtype"] in ("Keyword", "Theme"):
            terms[r["objectid"]].append(r["term"])

    works = []
    for o in read_csv(os.path.join(nga, "objects.csv")):
        title = o["title"]
        if not SAINT_TOKEN.search(title):
            continue
        if o["classification"] not in CLASSIFICATIONS:
            continue
        y = to_int(o["beginyear"])
        if y is None or not (YEAR_MIN <= y <= YEAR_MAX):
            continue
        img = images.get(o["objectid"])
        if not img:
            continue
        matched = [
            s for s in saints
            if s["title_rx"].search(title) and not (s["exclude_rx"] and s["exclude_rx"].search(title))
        ]
        if not matched:
            continue

        n_tokens = len(re.findall(r"\b(Saint|St\.)\s", title))
        solo = len(matched) == 1 and n_tokens <= 1 and not GROUP_WORDS.search(title)

        alt = (img.get("assistivetext") or "").strip()
        kws = [t for t in terms.get(o["objectid"], []) if t.lower() not in ("saints", "keywords", "themes")]
        sources = [
            ("desc", SENT_SPLIT.split(alt) if alt else []),
            ("kw", kws),
            ("title", [title]),
        ]
        hits = {}
        for s in matched:
            h = {}
            for a in s["attrs"]:
                ev = find_evidence(a["rx"], sources)
                if ev:
                    h[a["id"]] = ev
            hits[s["id"]] = h

        works.append(
            {
                "id": int(o["objectid"]),
                "t": title,
                "d": o["displaydate"],
                "y": y,
                "c": o["classification"],
                "m": o["medium"],
                "a": o["attribution"],
                "img": img["iiifurl"],
                "w": to_int(img["width"]),
                "h": to_int(img["height"]),
                "alt": alt,
                "kw": kws,
                "saints": [s["id"] for s in matched],
                "solo": solo,
                "hits": hits,
            }
        )

    works.sort(key=lambda w: (w["y"], w["id"]))
    out = {
        "generated": date.today().isoformat(),
        "source": "National Gallery of Art Open Data (CC0), https://github.com/NationalGalleryOfArt/opendata",
        "years": [YEAR_MIN, YEAR_MAX],
        "works": works,
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as fh:
        json.dump(out, fh, ensure_ascii=False, separators=(",", ":"))

    # Summary for the console
    print(f"{len(works)} works written to {os.path.relpath(args.out, ROOT)}", file=sys.stderr)
    for s in saints:
        ws = [w for w in works if s["id"] in w["saints"]]
        print(f"  {s['name']:32} {len(ws):4} works, {sum(w['solo'] for w in ws):4} single-saint", file=sys.stderr)


if __name__ == "__main__":
    main()
