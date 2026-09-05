# randomsoulwrites generator

Turns typed text into an Instagram-ready quote image, rendered directly on a
canvas at the real export resolution.

## Files

```
index.html                          markup + size/format controls
styles.css                          original styling + controls & canvas preview
script.js                           layout, rendering, export
assets/randomsoulwrites-logo.svg    the brand logo, vector, transparent
assets/logo.js                      same path data as a JS constant (used at runtime)
```

Open `index.html` directly — no build step, no server required.

---

## The logo

`assets/randomsoulwrites-logo.svg` is the **fixed brand asset**. Do not edit the
path data, recolour it, redraw it, or substitute a font.

It was traced from the supplied profile-picture screenshot:

- avatar circle fitted at centre `(273.3, 378.2)`, radius `264.5`; everything
  outside it masked away
- the overlapping dark "edit" button removed
- cream paper normalised to white, upscaled 6× (Lanczos), gamma 1.3
- traced with `potrace -k 0.62 --turdsize 12 --alphamax 1.0`

The gamma + `0.62` threshold combination was chosen after testing: at `0.55` the
thin secondary strokes under the wordmark broke into dashes and the left taper
of the swoosh became a stray dot; at `0.78` every stroke thickened noticeably.

Result: `viewBox="26.00 2.00 2866.00 1108.00"`, intrinsic `2400×928`,
aspect ratio **2.586643**, fill `#111111`, transparent background, no padding,
no circular avatar background.

### Known caveat — the feather tip

The feather is genuinely clipped in the source screenshot. Its black artwork
runs into the circular avatar crop between roughly `y=264` and `y=274` and
merges with the dark background outside; the raw pixels there hold nothing
recoverable. The tip was reconstructed with a small triangle (~10px at source
scale) continuing both existing edges to a point.

**This is the only inferred part of the asset.** If the original logo file
(PNG / Illustrator / Canva export) ever turns up, retrace from that and the
question disappears.

### Why the logo lives in two files

`logo.js` duplicates the path data as a string on purpose. Loading the `.svg`
over `file://` taints the canvas and makes `toBlob()` throw. Building the image
from a data URI instead keeps the canvas clean, so the app works opened straight
from disk. Edit both files together or neither.

---

## Rendering

One pipeline, three formats:

```
computeLayout(paragraphs, width, height)
    -> { fontSize, lines[{text,x,y}], logo{x,y,width,height}, overflow }
         |
         +-- renderQuoteImage()  -> canvas -> preview / JPG / PNG
         +-- buildSvgDocument()  -> <text> elements + vector logo
```

Canvas and SVG consume the same layout object, so they cannot drift apart.

All geometry is a fraction of the canvas, never a fixed pixel value. Every
constant sits in the `CONFIG` object at the top of `script.js`:

| Constant | Value | Meaning |
|---|---|---|
| `LOGO_SCALE` | `0.42` | logo width ÷ canvas width |
| `LOGO_BOTTOM_MARGIN` | `0.085` | of canvas height |
| `SIDE_PADDING` | `0.11` | of canvas width, each side |
| `TEXT_MAX_FONT` / `TEXT_MIN_FONT` | `0.052` / `0.020` | of canvas width |
| `LINE_HEIGHT` | `1.6` | multiple of font size |
| `JPEG_QUALITY` | `0.95` | |

`LOGO_SCALE` and `LOGO_BOTTOM_MARGIN` are judgement calls, not derived from
anything — tune by eye against typical quote lengths.

### Resolution

`canvas.width` / `canvas.height` **are** the export dimensions. CSS only sets
`width: 100%; height: auto`, so the preview shrinks to the page column while the
buffer stays at full size. `devicePixelRatio` is never consulted. Download
re-renders at the selected size before exporting, so the file always matches the
label.

### Why the logo stays sharp

1. It is vector, so it is resolution-independent.
2. `getLogoImage(w, h)` builds an SVG whose `width`/`height` attributes are the
   exact pixels the logo will occupy, then loads that as an `Image`. At
   1080×1080 the browser rasterises a 454×175 SVG and `drawImage` places it 1:1.
   No intermediate bitmap is ever scaled. Results are cached per size.
3. `logoHeight = logoWidth / RSW_LOGO.aspect` — the height is always derived,
   never set. Nothing can stretch one axis independently.

---

## Export formats

| Format | How |
|---|---|
| **JPG** (default) | `toBlob('image/jpeg', 0.95)`; background already opaque |
| **PNG** | `toBlob('image/png')`, lossless, no artifacts near the feather |
| **SVG** | built as text: `<rect>` background, one `<text>` per line at the computed baseline, logo as a nested `<svg>` with real path data |

Filenames: `randomsoulwrites-1080x1080.jpg`

### SVG limitation

The logo is true vector, but the quote text stays as `<text>`, so it renders
correctly only where Playfair Display is available. The document embeds an
`@import` of the Google Fonts URL, which covers browsers; Illustrator and Figma
will substitute a fallback and line breaks may shift. Converting text to
outlines would need a font-parsing library such as opentype.js.

The `<style>` block **must** stay wrapped in `CDATA` — the `&` in the Google
Fonts URL makes the document invalid XML otherwise, and it fails to parse
outright.

---

## Output sizes

| Preset | Dimensions |
|---|---|
| Instagram Square (default) | 1080 × 1080 |
| Instagram Portrait | 1080 × 1350 |
| Instagram Story | 1080 × 1920 |
| Custom | 200–6000 px, clamped |

Verified: logo aspect ratio comes out identical at 1080×1080, 1080×1350,
1080×1920 and 800×600.

---

## Text handling

Unchanged from the original: trim each line, capitalise the first character,
drop blanks, treat what remains as paragraphs.

Type shrinks from `TEXT_MAX_FONT` toward `TEXT_MIN_FONT` until the block fits
above the logo. If it still does not fit, `computeLayout` returns
`overflow: true` and the status line suggests a taller size. **Nothing is ever
truncated.**
