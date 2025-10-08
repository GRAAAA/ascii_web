(function () {
  const $ = (id) => document.getElementById(id);

  const fileInput = $("file");
  const chooseBtn = $("chooseBtn");
  const drop = $("drop");
  const widthRange = $("width");
  const widthVal = $("widthVal");
  const scaleY = $("scaleY");
  const charsetInput = $("charset");
  const invert = $("invert");
  const colorize = $("colorize");
  const edgeBoost = $("edgeBoost");
  const asciiPre = $("ascii");
  const info = $("info");
  const rerender = $("rerender");
  const copyBtn = $("copyBtn");
  const saveTxt = $("saveTxt");
  const saveHtml = $("saveHtml");
  const savePng = $("savePng");
  const saveJpg = $("saveJpg");
  const clearBtn = $("clearBtn");
  const canvas = $("canvas");
  const work = $("work");

  let imgBitmap = null;
  let lastAsciiPlain = "";
  let lastCells = null;
  let lastCols = 0, lastRows = 0;
  let baseCharAspect = 0.5;

  const PRESETS = {
    complex:
      "@$B%8&WM#*oahkbdpqwmZO0QLCJUYXzcvunxrjft/|()1{}[]?-_+~<>i!lI;:,\"^`'. ",
    classic: "@#%*+=-:. ",
    blocks: "█▓▒░ .",
    dots: "@o+=-:. ",
  };


  function measureCharAspect() {
    const probe = document.createElement("pre");
    probe.className = "ascii";
    probe.style.position = "absolute";
    probe.style.left = "-99999px";
    probe.style.top = "0";
    probe.style.height = "auto";
    probe.style.width = "auto";
    probe.style.whiteSpace = "pre";
    const count = 200;
    probe.textContent = "M".repeat(count);
    document.body.appendChild(probe);
    const rect = probe.getBoundingClientRect();
    const cs = getComputedStyle(probe);
    const lineH = parseFloat(cs.lineHeight) || 10;
    const charW = rect.width / count;
    document.body.removeChild(probe);
    return (charW / lineH) || 0.5;
  }
  baseCharAspect = measureCharAspect();

  function setPreset(name) {
    charsetInput.value = PRESETS[name] || PRESETS.classic;
    render();
  }
  document.querySelectorAll("[data-preset]").forEach((b) =>
    b.addEventListener("click", (e) => setPreset(e.currentTarget.dataset.preset))
  );

  widthRange.addEventListener("input", () => (widthVal.textContent = widthRange.value));

  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("drag");
    })
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("drag");
    })
  );
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    const f = e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });
  chooseBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) loadFile(f);
  });

  async function loadFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const blob = await fetch(url).then((r) => r.blob());
      const img = await createImageBitmap(blob);
      imgBitmap = img;
      rerender.disabled = false;
      render();
      drop.innerHTML =
        `<strong>Loaded:</strong> <span class="hint">${escapeHtml(file.name)}</span>
         <p class="hint">Drop/Choose again to replace image.</p>
         <label for="file" class="btn" id="chooseBtn2">Choose another…</label>`;

      const chooseBtn2 = document.getElementById("chooseBtn2");
      chooseBtn2 && chooseBtn2.addEventListener("click", () => fileInput.click());
    } catch (err) {
      alert("Could not load image: " + err.message);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

  function getScaledContext() {
    if (!imgBitmap) return null;

    const cols = parseInt(widthRange.value, 10); // output columns
    const aspectMultiplier = (parseInt(scaleY.value, 10) || 12) / 12; // fine tune
    const srcW = imgBitmap.width, srcH = imgBitmap.height;
    const srcAspect = srcH / srcW; // H/W

    const rows = Math.max(1, Math.round(cols * srcAspect * (baseCharAspect * aspectMultiplier)));

    const canvasW = cols;
    const canvasH = rows;

    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(imgBitmap, 0, 0, canvasW, canvasH);

    if (edgeBoost.checked) {
      work.width = canvasW; work.height = canvasH;
      const wctx = work.getContext("2d", { willReadFrequently: true });
      wctx.filter = "contrast(115%) saturate(110%)";
      wctx.drawImage(canvas, 0, 0);
      const imgData = wctx.getImageData(0, 0, work.width, work.height);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        const k = clamp((y - 128) / 128, -1, 1);
        data[i]     = clamp(data[i]     + k * 24, 0, 255);
        data[i + 1] = clamp(data[i + 1] + k * 24, 0, 255);
        data[i + 2] = clamp(data[i + 2] + k * 24, 0, 255);
      }
      wctx.putImageData(imgData, 0, 0);
      ctx.clearRect(0, 0, canvasW, canvasH);
      ctx.drawImage(work, 0, 0);
    }

    return { ctx, cols, rows, w: canvasW, h: canvasH };
  }

  function render() {
    if (!imgBitmap) {
      info.textContent = "No image loaded.";
      asciiPre.textContent = "";
      lastAsciiPlain = "";
      lastCells = null; lastCols = lastRows = 0;
      return;
    }
    info.textContent = "Rendering…";
    requestAnimationFrame(() => {
      const S = getScaledContext();
      if (!S) { info.textContent = "No image loaded."; return; }
      const { ctx, cols, rows, w, h } = S;
      const data = ctx.getImageData(0, 0, w, h).data;

      const chars = charsetInput.value || PRESETS.classic;
      const N = Math.max(1, chars.length - 1);
      const inv = invert.checked ? 1 : 0;
      const useColor = !!colorize.checked;

      let outHtml = "";
      let outText = "";
      const cells = new Array(rows * cols);

      let k = 0;
      for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++, k++) {
          const i = (y * w + x) * 4;
          const r = data[i], g = data[i + 1], b = data[i + 2];
          const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
          const t = inv ? luma / 255 : 1 - luma / 255;
          const idx = Math.round(t * N);
          const ch = chars[idx] || " ";
          cells[k] = { ch, r, g, b };
          if (useColor) {
            outHtml += `<span style="color: rgb(${r},${g},${b})">${escapeHtml(ch)}</span>`;
          } else {
            outHtml += escapeHtml(ch);
          }
          outText += ch;
        }
        outHtml += "\n"; outText += "\n";
      }

      asciiPre.classList.toggle("color", useColor);
      asciiPre.innerHTML = `<div class="asciiInner">${outHtml}</div>`;
      info.innerHTML = `Rendered <strong>${cols}×${rows}</strong> characters (source ${imgBitmap.width}×${imgBitmap.height})`;
      lastAsciiPlain = outText;
      lastCells = cells; lastCols = cols; lastRows = rows;

      fitAsciiToPanel(cols, rows);
      rerender.disabled = false;
    });
  }

  function fitAsciiToPanel(cols, rows) {
    const panel = asciiPre.parentElement;
    const bar = panel.querySelector(".bar");
    const barH = bar.getBoundingClientRect().height;
    const rect = panel.getBoundingClientRect();
    const availW = rect.width - 36;
    const availH = rect.height - barH - 36;

    let lineH = 16;
    let charW = baseCharAspect * lineH;

    const needW = cols * charW;
    const needH = rows * lineH;
    const s = Math.min(availW / needW, availH / needH, 1);
    lineH = Math.max(6, Math.floor(lineH * s));
    charW = baseCharAspect * lineH;

    asciiPre.style.setProperty("--ascii-line-height", `${lineH}px`);
    asciiPre.style.setProperty("--ascii-font-size", `${lineH}px`);
  }

  function escapeHtml(s) {
    return s.replace(/[&<>\"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[m]);
  }

  let t = null;
  const bump = () => { clearTimeout(t); t = setTimeout(render, 80); };
  [widthRange, scaleY, charsetInput, invert, colorize, edgeBoost].forEach((n) =>
    n.addEventListener("input", bump)
  );
  rerender.addEventListener("click", render);

  window.addEventListener("resize", () => { if (lastCols && lastRows) fitAsciiToPanel(lastCols, lastRows); });

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(lastAsciiPlain || asciiPre.innerText || "");
      toast("Copied to clipboard", "ok");
    } catch { toast("Copy failed", "warn"); }
  });
  function download(name, mime, data) {
    const a = document.createElement("a");
    a.download = name;
    a.href = URL.createObjectURL(new Blob([data], { type: mime }));
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  saveTxt.addEventListener("click", () => {
    download("ascii-art.txt","text/plain;charset=utf-8", lastAsciiPlain || asciiPre.innerText || "");
  });
  saveHtml.addEventListener("click", () => {
    const html = `<!doctype html><meta charset="utf-8"><title>ASCII Art</title><style>body{background:#0b0d10;color:#e5e7eb}pre{white-space:pre;font:10px/10px monospace}</style><pre>${asciiPre.innerHTML}</pre>`;
    download("ascii-art.html","text/html;charset=utf-8", html);
  });

  function exportImage(mime = "image/png", scale = 2) {
    if (!lastCells || !lastCols || !lastRows) return;
    const lh = parseFloat(getComputedStyle(asciiPre).getPropertyValue("--ascii-line-height")) || 10;
    const charW = baseCharAspect * lh;

    const outW = Math.ceil(lastCols * charW * scale);
    const outH = Math.ceil(lastRows * lh * scale);

    const c = document.createElement("canvas");
    c.width = outW; c.height = outH;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "#0b0d10";
    ctx.fillRect(0,0,outW,outH);

    ctx.font = `${Math.floor(lh * scale)}px SFMono-Regular, Consolas, monospace`;
    ctx.textBaseline = "top";

    let k = 0;
    for (let y = 0; y < lastRows; y++) {
      const ypx = Math.floor(y * lh * scale);
      for (let x = 0; x < lastCols; x++, k++) {
        const { ch, r, g, b } = lastCells[k];
        ctx.fillStyle = colorize.checked ? `rgb(${r},${g},${b})` : "#f1f5f9";
        ctx.fillText(ch, Math.floor(x * charW * scale), ypx);
      }
    }

    c.toBlob((blob) => {
      const a = document.createElement("a");
      a.download = mime === "image/jpeg" ? "ascii-art.jpg" : "ascii-art.png";
      a.href = URL.createObjectURL(blob);
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    }, mime, mime === "image/jpeg" ? 0.92 : undefined);
  }
  savePng && savePng.addEventListener("click", () => exportImage("image/png", 2));
  saveJpg && saveJpg.addEventListener("click", () => exportImage("image/jpeg", 2));

  clearBtn.addEventListener("click", () => {
    imgBitmap = null;
    asciiPre.textContent = "";
    lastAsciiPlain = "";
    lastCells = null; lastCols = lastRows = 0;
    info.textContent = "Cleared. Drop or choose an image to begin.";
    rerender.disabled = true;

    drop.innerHTML =
      '<strong>Drop image here</strong><p>or</p>' +
      '<label for="file" class="btn" id="chooseBtn">Choose image…</label>' +
      '<input id="file" type="file" accept="image/*" hidden />' +
      '<p class="hint">PNG • JPG • WebP • GIF (first frame)</p>';

    const newFile = drop.querySelector("#file");
    const newBtn = drop.querySelector("#chooseBtn");
    newBtn.addEventListener("click", () => newFile.click());
    newFile.addEventListener("change", () => {
      const f = newFile.files && newFile.files[0];
      if (f) loadFile(f);
    });
  });

  function toast(msg, kind = "ok") {
    const n = document.createElement("div");
    n.textContent = msg;
    n.style.position = "fixed";
    n.style.bottom = "18px";
    n.style.left = "50%";
    n.style.transform = "translateX(-50%)";
    n.style.background = kind === "ok" ? "rgba(16,185,129,.15)" : "rgba(245,158,11,.15)";
    n.style.border = "1px solid " + (kind === "ok" ? "#065f46" : "#7c5805");
    n.style.color = "#e5e7eb";
    n.style.padding = "10px 14px";
    n.style.borderRadius = "10px";
    n.style.backdropFilter = "blur(4px)";
    n.style.zIndex = 1000;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 1600);
  }

  widthVal.textContent = widthRange.value;
  info.textContent = "Drop or choose an image to begin.";
})();
