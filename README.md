# Iconography Detective

**Live site: https://GITHUB_USER.github.io/iconography-detective/**

*How do you know who you're looking at?* Iconography Detective teaches you to identify saints in European art by their **attributes**: Jerome's lion, Catherine's spiked wheel, Sebastian's arrows. It then follows those attributes across six centuries of the National Gallery of Art's collection to see which clues artists kept, which they dropped, and when.

Built for **CS 85: Introduction to Generative AI and Software Toolcraft** (Harvard, Fall 2026), Module 5: Art History.

---

## What you can do on the site

| Page | What it does |
|---|---|
| **Casebook** | 20 saints, each with a short life story and a representative image. |
| **Saint pages** | A *field guide* listing each traditional attribute with its meaning and how often it's found. A *heatmap* of attributes by half-century. A timeline of every matching work, from 1250 to 1850. Selecting a work shows the museum's description with the clues highlighted, plus the exact sentence that counts as evidence for each one. |
| **Who is this saint?** | A quiz. You get an unlabeled artwork and four names. You can ask for clues, and the answer comes with the evidence. A *description-only* mode hides the image and blacks out names in the museum's accessibility text, so you see the picture the way a blind visitor hears it. |
| **Patterns** | Four corpus-level findings, recomputed live and filterable by medium and description style (see below). |
| **Method** | How the analysis works and where it fails. |

## Background: iconography

Before most people could read, they could read pictures. In medieval and Renaissance Europe a saint was recognized less by their face than by an **attribute**: an object or animal tied to their life or martyrdom in texts like *The Golden Legend* (c. 1260). Saint Catherine carries the wheel that shattered when they tried to torture her with it. Saint Lawrence holds the gridiron he was roasted on. Saint Jerome, translator of the Bible, has the lion he tamed by pulling a thorn from its paw, and is often given a cardinal's red hat, centuries before cardinals existed. Art historians call this system of signs **iconography**. Erwin Panofsky made identifying subjects an early step of art-historical interpretation: before you can ask what a painting *means*, you have to know *what* it shows.

This project came out of our guest lecture, where one example question was how images of Saint Gregory are identified by the dove of the Holy Spirit at his ear. That raises a general question. Attributes are a visual language. Like any language, it should change over time. Can we *measure* that change in a museum collection?

## How it works

```
NGA open data (CSV, CC0)          data/lexicon.json (expert knowledge)
  objects, keywords,                20 saints × ~6 attributes each:
  IIIF images, visual               label, meaning, regex patterns
  descriptions                      (e.g. "red hat|galero|cardinal")
          │                                   │
          └─────────► scripts/build_data.py ◄─┘
                      1. keep works whose title names a saint (1250–1850,
                         open-access image) → 1,042 works
                      2. search each work's description, keywords and title
                         for each attribute's patterns
                      3. save the first matching sentence as *evidence*
                                   │
                                   ▼
                            data/works.json
                                   │
                                   ▼
             Static site (index.html + js/*.js, no framework, no server)
             filters, aggregates by period/medium, draws heatmaps & charts,
             and loads images from the NGA's IIIF image server
```

* **Data:** [National Gallery of Art Open Data](https://github.com/NationalGalleryOfArt/opendata) (CC0). We use `objects.csv` (title, date, artist, medium), `objects_terms.csv` (subject keywords), and `published_images.csv` (IIIF image links and **assistive text**, the visual descriptions the NGA writes for blind and low-vision visitors).
* **Expert layer:** `data/lexicon.json` holds each saint's attributes, why each one belongs to them, and the text patterns used to detect it. Sources: James Hall, *Dictionary of Subjects and Symbols in Art*; George Ferguson, *Signs & Symbols in Christian Art*; Jacobus de Voragine, *The Golden Legend*.
* **Detection is deterministic.** Plain regular-expression search, with no AI model at runtime. Every match is stored with the sentence it came from, so every number on the site can be checked against a human-readable source.
* **Single-saint works:** By default the analysis only uses works where one saint is named in the title and there are no group words (Madonna, Holy Family, Saints…). In a picture of Jerome *and* Saint Mark, a lion could belong to either.
* **Front end:** vanilla JavaScript modules, hash routing, hand-built SVG/HTML charts with hover tooltips and table views, light/dark themes, mobile layout. Hosted on GitHub Pages.

## Findings (from the Patterns page)

1. **The disappearing halo.** Before 1400, **82%** of described works mention a halo. From 1500 on, **14%** do. The decline holds within paintings alone (100% in the 1300s, 8% by 1600–49) and within both description styles. That fits the standard art-historical account: as Renaissance naturalism took over, the gold disk shrank to a thin ring and then disappeared.
2. **Some saints are easier to recognize.** Saints whose attribute *is* the story are described most reliably: Christopher's Christ Child (82%), George's dragon (75%), Michael's wings (71%). Small handheld objects are described least: Andrew's X-shaped cross (14%), Roch's plague sore (7%). Gregory's dove scores 0% for another reason: almost all of the NGA's Gregory images show a different subject, the *Mass of Saint Gregory*.
3. **Jerome is more often a penitent than a scholar.** In this collection the penitent hermit with stone, bare chest and wilderness (46%) far outnumbers the scholar in his study (15%), with the peak in the 1500s.
4. **Who is doing the looking?** The NGA's descriptions come in two styles. *Detailed* ones (mostly of paintings, ~240 words) find **1.8×** as many attributes per work as *brief* ones that start "The image shows…" (~84 words). Only 3% of brief descriptions name the saint at all. This is a confound for any trend (early works tend to get detailed descriptions), so the site lets you filter by style. It is also an accessibility finding: a listener told "a man holding an X-shaped object" has to do the iconography themselves.

## Limitations

* **It reads words, not pixels.** An attribute only counts if the description mentions it, so the percentages measure *what a describer noticed and named*, not what the artist painted.
* **Ambiguity:** "palm" (hand or martyr's frond), "cross" (crucifix or gesture). The patterns avoid the known traps, but not every false positive. Each match shows its sentence so you can judge.
* **One museum:** The NGA is strong in Italian painting and German prints. Prints are about 64% of the corpus.
* **Small numbers:** Some saint × period cells are tiny. The site greys out cells and bars with fewer than 4 works.

## Generative AI in this project

This project was built with an AI coding partner (Claude), as the course intends. The AI wrote most of the code and drafted the lexicon. The pattern matches were then checked against real descriptions, and the patterns were revised when they misfired. Some examples: the word "Baptist" in titles was being counted as evidence of a baptism, which put John the Baptist's "river" score at 97%. Roch's plague sore was missed because descriptions mention his raised, bare leg rather than a "sore." "Palm" had to be limited to palm fronds so it wouldn't match hands. The analysis itself is **deterministic on purpose**, a theme from our discussion of compilers vs. prompts. A claim like "halos decline after 1400" should give the same answer every time it's run, and should trace back to sentences a person can read. A natural next step would be to send the brief descriptions, or the images themselves, to a vision-language model. Its answers would need to be logged as evidence in the same way, and checked against this deterministic baseline.

## Run it locally

```bash
git clone https://github.com/GITHUB_USER/iconography-detective.git
cd iconography-detective
python3 -m http.server 8000        # then open http://localhost:8000
```

Rebuild the data (downloads ~200 MB of NGA CSVs into `.cache/`):

```bash
python3 scripts/build_data.py
```

To change what counts as an attribute, edit `data/lexicon.json` and rebuild.

## Repository layout

```
index.html            page shell
css/style.css         styles (light + dark)
js/app.js             router and the five views
js/data.js            data loading, filters, aggregation
js/charts.js          heatmap, bar charts, tooltips
data/lexicon.json     saints, attributes, meanings, search patterns
data/works.json       generated dataset (1,042 works)
scripts/build_data.py reproducible data build from NGA open data
```

## Credits and license

Images and data courtesy of the **National Gallery of Art, Washington**, released under CC0. Visual descriptions are the NGA's. Code is MIT-licensed (see `LICENSE`).
