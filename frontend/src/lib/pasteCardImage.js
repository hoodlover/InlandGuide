// Render the branded paste card to a PNG. Teams aggressively sanitizes pasted
// HTML, so an image is the only reliable way to preserve the guide's exact card.
export async function renderPasteCardImage({ title, titleLeft = '', titleRight = '', rows, logo, footer = '' }) {
  // Clipboard destinations paste PNGs at their native pixel dimensions. A
  // 1.2x export keeps the card crisp without appearing oversized (40% smaller
  // than the previous 2x bitmap).
  const scale = 1.2;
  const width = 470;
  const border = 5;
  const padding = 22;
  const contentWidth = width - (border + padding) * 2;
  let titleSize = title.length > 34 ? 15 : (title.length > 26 ? 17 : 20);

  const probe = document.createElement('canvas').getContext('2d');
  const hasTitleColumns = Boolean(titleLeft && titleRight);
  if (hasTitleColumns) {
    const halfWidth = (contentWidth - 18) / 2;
    while (titleSize > 12) {
      probe.font = `800 ${titleSize}px Arial`;
      if (
        probe.measureText(titleLeft.toUpperCase()).width <= halfWidth &&
        probe.measureText(titleRight.toUpperCase()).width <= halfWidth
      ) break;
      titleSize -= 1;
    }
  }
  probe.font = `800 ${titleSize}px Arial`;
  const titleTokens = hasTitleColumns ? [] : title.toUpperCase().split(/(\s+)/).filter(Boolean);
  const titleLines = [];
  let line = '';
  for (const token of titleTokens) {
    const next = line + token;
    if (line.trim() && token.trim() && probe.measureText(next).width > contentWidth) {
      titleLines.push(line.trimEnd());
      line = token.trimStart();
    } else {
      line = next;
    }
  }
  if (line.trim()) titleLines.push(line.trimEnd());

  const titleLineHeight = titleSize + 5;
  const titleHeight = (hasTitleColumns ? 1 : titleLines.length) * titleLineHeight + 10;
  const rowHeight = 42;
  const footerHeight = footer ? 25 : 0;
  const logoHeight = 24;
  const height = border + padding + titleHeight + 16 + rows.length * rowHeight + footerHeight + 14 + logoHeight + padding + border;

  const canvas = document.createElement('canvas');
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  ctx.scale(scale, scale);

  const roundedRect = (x, y, w, h, r) => {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
  };

  ctx.fillStyle = '#EB6608';
  roundedRect(0, 0, width, height, 12);
  ctx.fill();
  ctx.lineWidth = border;
  ctx.strokeStyle = '#002D72';
  roundedRect(border / 2, border / 2, width - border, height - border, 10);
  ctx.stroke();

  const left = border + padding;
  let y = border + padding;
  ctx.fillStyle = '#ffffff';
  ctx.font = `800 ${titleSize}px Arial`;
  ctx.textBaseline = 'top';
  if (hasTitleColumns) {
    const center = left + contentWidth / 2;
    ctx.textAlign = 'right';
    ctx.fillText(titleLeft.toUpperCase(), center - 9, y);
    ctx.textAlign = 'left';
    ctx.fillText(titleRight.toUpperCase(), center + 9, y);
    y += titleLineHeight;
  } else {
    ctx.textAlign = 'left';
    for (const titleLine of titleLines) {
      ctx.fillText(titleLine, left, y);
      y += titleLineHeight;
    }
  }
  y += 3;
  ctx.fillRect(left, y, contentWidth, 2);
  y += 16;

  ctx.fillStyle = '#ffffff';
  roundedRect(left, y, contentWidth, rows.length * rowHeight, 8);
  ctx.fill();

  rows.forEach(([label, value], index) => {
    const rowY = y + index * rowHeight;
    if (index > 0) {
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(left, rowY, contentWidth, 1);
    }
    ctx.fillStyle = '#000000';
    ctx.font = '700 13px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.fillText(String(label), left + 16, rowY + rowHeight / 2);
    ctx.font = '700 15px Arial';
    ctx.textAlign = 'right';
    ctx.fillText(String(value), left + contentWidth - 16, rowY + rowHeight / 2);
  });
  y += rows.length * rowHeight;

  if (footer) {
    y += 10;
    ctx.fillStyle = '#ffffff';
    ctx.font = '11px Arial';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(footer, left, y, contentWidth);
    y += 15;
  }

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = logo;
  });
  y += 14;
  ctx.drawImage(image, left + contentWidth - 150, y, 150, logoHeight);

  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('Unable to render card image')), 'image/png');
  });
  return { blob, dataUrl: canvas.toDataURL('image/png') };
}
