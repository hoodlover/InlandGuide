// Card title bar for the HTML paste cards: city hard left, rail / terminal hard
// right, matching the PNG card in pasteCardImage.js. Two variants because the
// destinations disagree about layout — Salesforce honours floats, Outlook strips
// them and needs a real table. Shared by both lookup tabs so the two never drift.

const BASE = (titleSize) =>
  `font-family:Arial,sans-serif;color:#ffffff;font-size:${titleSize}px;font-weight:800;` +
  `letter-spacing:.03em;text-transform:uppercase`;

// Salesforce: float layout, with the soft shadow that card has always carried.
export function cardTitleFloat(titleLeft, titleRight, titleSize) {
  const cell = `${BASE(titleSize)};text-shadow:0 2px 5px rgba(0,0,0,0.45)`;
  return `<div style="overflow:hidden;border-bottom:2px solid #ffffff;padding-bottom:8px;margin-bottom:16px">` +
    `<span style="float:left;${cell}">${titleLeft}</span>` +
    `<span style="float:right;${cell}">${titleRight}</span>` +
    `</div>`;
}

// Outlook / Teams: table layout (they drop floats and background styles).
export function cardTitleTable(titleLeft, titleRight, titleSize) {
  const cell = `${BASE(titleSize)};padding:0 0 8px`;
  return `<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;margin-bottom:16px;border-bottom:2px solid #ffffff">` +
    `<tr>` +
      `<td align="left" style="${cell};text-align:left">${titleLeft}</td>` +
      `<td align="right" style="${cell};text-align:right">${titleRight}</td>` +
    `</tr></table>`;
}
