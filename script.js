/*
 * randomsoulwrites quote image generator
 *
 * Everything is drawn straight onto a canvas whose backing store is the real
 * export resolution (1080x1080 by default). Nothing is screenshotted and
 * nothing is scaled up after the fact, so text and logo stay sharp.
 */

/* ------------------------------------------------------------------ *
 * CONSTANTS — all geometry is a fraction of the canvas, never a fixed px
 * ------------------------------------------------------------------ */

var CONFIG = {
  DEFAULT_WIDTH: 1080,
  DEFAULT_HEIGHT: 1080,

  MIN_DIMENSION: 200,
  MAX_DIMENSION: 6000,

  BG_COLOR: "#f5f1ec",
  TEXT_COLOR: "#3a3a3a",
  FONT_FAMILY: '"Playfair Display", Georgia, "Times New Roman", serif',
  FONT_WEIGHT: "400",

  SIDE_PADDING: 0.11, // of canvas width, each side
  TOP_PADDING: 0.11, // of canvas height

  TEXT_MAX_FONT: 0.052, // of canvas width
  TEXT_MIN_FONT: 0.020,
  LINE_HEIGHT: 1.6, // multiple of font size
  PARAGRAPH_GAP: 0.8, // extra blank space between paragraphs, in line heights

  LOGO_SCALE: 0.42, // logo width / canvas width
  LOGO_BOTTOM_MARGIN: 0.085, // of canvas height
  LOGO_TEXT_GAP: 0.045, // clear space between text block and logo

  JPEG_QUALITY: 0.95
};

var SIZE_PRESETS = {
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  custom: null
};

var FORMATS = {
  jpg: { mime: "image/jpeg", ext: "jpg" },
  png: { mime: "image/png", ext: "png" },
  svg: { mime: "image/svg+xml", ext: "svg" }
};

var GOOGLE_FONT_URL =
  "https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&display=swap";

/* ------------------------------------------------------------------ *
 * DOM
 * ------------------------------------------------------------------ */

var els = {};
var measureCtx = document.createElement("canvas").getContext("2d");
var lastRender = null; // { width, height, text }

document.addEventListener("DOMContentLoaded", function () {
  els.input = document.getElementById("inputText");
  els.preset = document.getElementById("sizePreset");
  els.format = document.getElementById("format");
  els.customBox = document.getElementById("customSize");
  els.customWidth = document.getElementById("customWidth");
  els.customHeight = document.getElementById("customHeight");
  els.generate = document.getElementById("generateBtn");
  els.download = document.getElementById("downloadBtn");
  els.canvas = document.getElementById("preview");
  els.status = document.getElementById("status");

  els.generate.addEventListener("click", generate);
  els.download.addEventListener("click", downloadImage);

  els.preset.addEventListener("change", function () {
    els.customBox.hidden = els.preset.value !== "custom";
    generate();
  });
  els.format.addEventListener("change", updateStatus);
  els.customWidth.addEventListener("change", generate);
  els.customHeight.addEventListener("change", generate);

  generate();
});

/* ------------------------------------------------------------------ *
 * TEXT PREPARATION — unchanged behaviour: trim each line, capitalise the
 * first character, drop blanks, and treat what is left as paragraphs.
 * ------------------------------------------------------------------ */

function formatText(raw) {
  return String(raw || "")
    .split("\n")
    .map(function (line) {
      line = line.trim();
      if (!line) return "";
      return line.charAt(0).toUpperCase() + line.slice(1);
    })
    .filter(function (line) {
      return line.length > 0;
    });
}

/* ------------------------------------------------------------------ *
 * LAYOUT — computed once, then consumed by the canvas renderer and the
 * SVG exporter alike, so the two can never drift apart.
 * ------------------------------------------------------------------ */

function fontString(size) {
  return CONFIG.FONT_WEIGHT + " " + size + "px " + CONFIG.FONT_FAMILY;
}

function wrapParagraph(ctx, paragraph, maxWidth) {
  var words = paragraph.split(/\s+/);
  var lines = [];
  var current = "";

  for (var i = 0; i < words.length; i++) {
    var word = words[i];
    var candidate = current ? current + " " + word : word;

    if (ctx.measureText(candidate).width <= maxWidth || !current) {
      // A single word that is still too wide gets broken character by character.
      if (!current && ctx.measureText(candidate).width > maxWidth) {
        var chunk = "";
        for (var c = 0; c < word.length; c++) {
          if (ctx.measureText(chunk + word[c]).width > maxWidth && chunk) {
            lines.push(chunk);
            chunk = word[c];
          } else {
            chunk += word[c];
          }
        }
        current = chunk;
        continue;
      }
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) lines.push(current);
  return lines;
}

function layoutTextBlock(ctx, paragraphs, maxWidth, fontSize) {
  ctx.font = fontString(fontSize);

  var lineHeight = fontSize * CONFIG.LINE_HEIGHT;
  var gap = lineHeight * CONFIG.PARAGRAPH_GAP;
  var rows = [];
  var height = 0;

  for (var p = 0; p < paragraphs.length; p++) {
    if (p > 0) height += gap;
    var wrapped = wrapParagraph(ctx, paragraphs[p], maxWidth);
    for (var l = 0; l < wrapped.length; l++) {
      rows.push({ text: wrapped[l], top: height });
      height += lineHeight;
    }
  }

  return { rows: rows, height: height, lineHeight: lineHeight, fontSize: fontSize };
}

/**
 * Works out where every line of text and the logo belong, in pixels, for a
 * canvas of the given size. Positions scale with the canvas, so the same
 * composition holds at 1080x1080, 1080x1920 and any custom size.
 */
function computeLayout(paragraphs, width, height) {
  var padX = width * CONFIG.SIDE_PADDING;
  var contentWidth = width - padX * 2;
  var centerX = width / 2;

  var logoWidth = width * CONFIG.LOGO_SCALE;
  var logoHeight = logoWidth / window.RSW_LOGO.aspect; // aspect ratio is never overridden
  var logoY = height - height * CONFIG.LOGO_BOTTOM_MARGIN - logoHeight;
  var logoX = centerX - logoWidth / 2;

  var areaTop = height * CONFIG.TOP_PADDING;
  var areaBottom = logoY - height * CONFIG.LOGO_TEXT_GAP;
  var areaHeight = Math.max(areaBottom - areaTop, height * 0.1);

  // Shrink the type until the block fits the available area.
  var maxFont = width * CONFIG.TEXT_MAX_FONT;
  var minFont = width * CONFIG.TEXT_MIN_FONT;
  var block = layoutTextBlock(measureCtx, paragraphs, contentWidth, maxFont);
  var fontSize = maxFont;

  while (block.height > areaHeight && fontSize > minFont) {
    fontSize = Math.max(minFont, fontSize - Math.max(1, maxFont * 0.02));
    block = layoutTextBlock(measureCtx, paragraphs, contentWidth, fontSize);
  }

  // Vertically centre the block in the text area.
  var blockTop = areaTop + Math.max(0, (areaHeight - block.height) / 2);
  var baselineOffset = block.lineHeight / 2 + block.fontSize * 0.35;

  var lines = block.rows.map(function (row) {
    return { text: row.text, x: centerX, y: blockTop + row.top + baselineOffset };
  });

  return {
    width: width,
    height: height,
    fontSize: block.fontSize,
    lines: lines,
    // True when the text is too long to fit even at the smallest size.
    // Nothing is truncated; the caller just warns instead.
    overflow: block.height > areaHeight,
    logo: { x: logoX, y: logoY, width: logoWidth, height: logoHeight }
  };
}

/* ------------------------------------------------------------------ *
 * LOGO — rasterised from the vector source at the exact pixel size it
 * will occupy, so the browser never scales an already-rendered bitmap.
 * ------------------------------------------------------------------ */

var logoCache = {};

function getLogoImage(pxWidth, pxHeight) {
  var w = Math.max(1, Math.round(pxWidth));
  var h = Math.max(1, Math.round(pxHeight));
  var key = w + "x" + h;

  if (logoCache[key]) return logoCache[key];

  var markup = window.RSW_LOGO.svgMarkup(w, h);
  // A data URI keeps the canvas untainted, including over file://.
  var src =
    "data:image/svg+xml;base64," +
    btoa(unescape(encodeURIComponent(markup)));

  logoCache[key] = new Promise(function (resolve, reject) {
    var img = new Image();
    img.onload = function () {
      resolve(img);
    };
    img.onerror = function () {
      reject(new Error("Logo failed to load"));
    };
    img.src = src;
  });

  return logoCache[key];
}

/* ------------------------------------------------------------------ *
 * FONTS
 * ------------------------------------------------------------------ */

var fontsReady = null;

function ensureFontsReady() {
  if (fontsReady) return fontsReady;

  if (!document.fonts || !document.fonts.load) {
    fontsReady = Promise.resolve();
    return fontsReady;
  }

  fontsReady = Promise.all([
    document.fonts.load('400 100px "Playfair Display"'),
    document.fonts.load('500 100px "Playfair Display"')
  ])
    .then(function () {
      return document.fonts.ready;
    })
    .catch(function () {
      /* fall back to the serif stack */
    });

  return fontsReady;
}

/* ------------------------------------------------------------------ *
 * THE SINGLE RENDER PIPELINE
 * ------------------------------------------------------------------ */

/**
 * Draws the composition at true output resolution.
 * Pass a canvas to reuse (the preview) or leave it out for an offscreen one.
 */
function renderQuoteImage(options) {
  var width = options.width;
  var height = options.height;
  var canvas = options.canvas || document.createElement("canvas");
  var paragraphs = formatText(options.text);

  return ensureFontsReady().then(function () {
    var layout = computeLayout(paragraphs, width, height);

    // Backing store IS the export resolution. CSS may show it smaller.
    canvas.width = width;
    canvas.height = height;

    var ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";

    ctx.fillStyle = CONFIG.BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = CONFIG.TEXT_COLOR;
    ctx.font = fontString(layout.fontSize);
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";

    for (var i = 0; i < layout.lines.length; i++) {
      ctx.fillText(layout.lines[i].text, layout.lines[i].x, layout.lines[i].y);
    }

    return getLogoImage(layout.logo.width, layout.logo.height).then(function (img) {
      ctx.drawImage(
        img,
        layout.logo.x,
        layout.logo.y,
        layout.logo.width,
        layout.logo.height
      );
      return { canvas: canvas, layout: layout };
    });
  });
}

/* ------------------------------------------------------------------ *
 * SVG EXPORT — same layout numbers, serialised as vector elements
 * ------------------------------------------------------------------ */

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildSvgDocument(text, width, height) {
  var paragraphs = formatText(text);
  var layout = computeLayout(paragraphs, width, height);

  var lines = layout.lines
    .map(function (line) {
      return (
        '  <text x="' +
        line.x.toFixed(2) +
        '" y="' +
        line.y.toFixed(2) +
        '">' +
        escapeXml(line.text) +
        "</text>"
      );
    })
    .join("\n");

  var logo = window.RSW_LOGO.svgFragment(
    layout.logo.x.toFixed(2),
    layout.logo.y.toFixed(2),
    layout.logo.width.toFixed(2),
    layout.logo.height.toFixed(2)
  );

  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<svg xmlns="http://www.w3.org/2000/svg" width="' +
    width +
    '" height="' +
    height +
    '" viewBox="0 0 ' +
    width +
    " " +
    height +
    '">\n' +
    // CDATA keeps the "&" in the font URL from breaking XML parsing.
    "  <style><![CDATA[\n" +
    "    @import url('" +
    GOOGLE_FONT_URL +
    "');\n" +
    "    text {\n" +
    "      font-family: " +
    CONFIG.FONT_FAMILY +
    ";\n" +
    "      font-weight: " +
    CONFIG.FONT_WEIGHT +
    ";\n" +
    "      font-size: " +
    layout.fontSize.toFixed(2) +
    "px;\n" +
    "      fill: " +
    CONFIG.TEXT_COLOR +
    ";\n" +
    "      text-anchor: middle;\n" +
    "    }\n" +
    "  ]]></style>\n" +
    '  <rect width="100%" height="100%" fill="' +
    CONFIG.BG_COLOR +
    '"/>\n' +
    lines +
    "\n  " +
    logo +
    "\n</svg>\n"
  );
}

/* ------------------------------------------------------------------ *
 * UI GLUE
 * ------------------------------------------------------------------ */

function clampDimension(value, fallback) {
  var n = parseInt(value, 10);
  if (!isFinite(n)) n = fallback;
  return Math.min(CONFIG.MAX_DIMENSION, Math.max(CONFIG.MIN_DIMENSION, n));
}

function getOutputSize() {
  var preset = SIZE_PRESETS[els.preset.value];
  if (preset) return { width: preset.width, height: preset.height };

  return {
    width: clampDimension(els.customWidth.value, CONFIG.DEFAULT_WIDTH),
    height: clampDimension(els.customHeight.value, CONFIG.DEFAULT_HEIGHT)
  };
}

function updateStatus(message, isError) {
  var size = getOutputSize();
  var label = size.width + " × " + size.height + " · " + els.format.value.toUpperCase();
  els.status.textContent = message ? label + " — " + message : label;
  els.status.className = isError ? "status error" : "status";
}

function generate() {
  var size = getOutputSize();
  var text = els.input.value;

  els.generate.disabled = true;
  updateStatus("rendering…");

  return renderQuoteImage({
    canvas: els.canvas,
    width: size.width,
    height: size.height,
    text: text
  })
    .then(function (result) {
      lastRender = { width: size.width, height: size.height, text: text };
      updateStatus(
        result.layout.overflow ? "text is long — try a taller size" : ""
      );
    })
    .catch(function (err) {
      updateStatus(err.message || "render failed", true);
    })
    .then(function () {
      els.generate.disabled = false;
    });
}

function triggerDownload(blob, filename) {
  var url = URL.createObjectURL(blob);
  var link = document.createElement("a");
  link.download = filename;
  link.href = url;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(function () {
    URL.revokeObjectURL(url);
  }, 1000);
}

function canvasToBlob(canvas, mime, quality) {
  return new Promise(function (resolve, reject) {
    if (canvas.toBlob) {
      canvas.toBlob(
        function (blob) {
          blob ? resolve(blob) : reject(new Error("Export failed"));
        },
        mime,
        quality
      );
    } else {
      // Very old browsers: fall back to a data URL.
      var dataUrl = canvas.toDataURL(mime, quality);
      var binary = atob(dataUrl.split(",")[1]);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      resolve(new Blob([bytes], { type: mime }));
    }
  });
}

function downloadImage() {
  var size = getOutputSize();
  var text = els.input.value;
  var formatKey = els.format.value;
  var format = FORMATS[formatKey];
  var filename =
    "randomsoulwrites-" + size.width + "x" + size.height + "." + format.ext;

  els.download.disabled = true;
  updateStatus("preparing " + format.ext.toUpperCase() + "…");

  var job;

  if (formatKey === "svg") {
    job = ensureFontsReady().then(function () {
      var markup = buildSvgDocument(text, size.width, size.height);
      triggerDownload(new Blob([markup], { type: format.mime }), filename);
    });
  } else {
    // Always re-render at the selected size so the file matches the label,
    // even if the preview is showing something older.
    job = renderQuoteImage({
      canvas: els.canvas,
      width: size.width,
      height: size.height,
      text: text
    })
      .then(function (result) {
        lastRender = { width: size.width, height: size.height, text: text };
        return canvasToBlob(
          result.canvas,
          format.mime,
          formatKey === "jpg" ? CONFIG.JPEG_QUALITY : undefined
        );
      })
      .then(function (blob) {
        triggerDownload(blob, filename);
      });
  }

  job
    .then(function () {
      updateStatus();
    })
    .catch(function (err) {
      updateStatus(err.message || "export failed", true);
    })
    .then(function () {
      els.download.disabled = false;
    });
}
