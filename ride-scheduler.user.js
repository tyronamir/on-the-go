function transformBlock(block) {
  // Evitar retransformar
  if (block.dataset.transformed) return;

  // Eliminar Drivers
  block.querySelectorAll('.fancy-scroll').forEach(b => {
    const label = b.querySelector('label')?.textContent.trim();
    if (label === 'Drivers') b.remove();
  });

  // Eliminar R&S_Category
  block.querySelector('[id^="field-block-"]')?.parentElement?.remove();

  // Desktop: convertir direcciones (espacio extra), pero no cambiar layout
  if (!isMobile) {
    block.querySelectorAll('.stop-block').forEach(convertStops);
    block.dataset.transformed = 'desktop';
    return;
  }

  // Móvil → construir tabla Excel
  block.querySelectorAll('.stop-block').forEach(convertStops);

  const dateTxt = block.querySelector('[data-eventmini-id]')?.innerText.replace(/\n/g, ' ') || '';
  const rider   = block.querySelector('.person-name')?.textContent.trim() || '';
  const msg     = block.querySelector('.message-window-edit')?.innerText.replace(/\n/g, ' ') || '';
  const stops   = [...block.querySelectorAll('.stop-block')];

  // NUEVO: Obtener teléfono del primer stop-block (si existe)
  let riderPhoneText = '[sin teléfono]';
  let riderPhoneHref = '';
  if (stops[0]) {
    const phoneLink = stops[0].querySelector('a[href^="tel:"]');
    if (phoneLink) {
      riderPhoneText = phoneLink.textContent.trim();
      riderPhoneHref = phoneLink.getAttribute('href');
    }
  }

  const tableHTML = `
    <div data-transformed="mobile" style="width:100%; margin-bottom:10px;">
      <table style="width:100%; border-collapse:collapse; border:1px solid #ccc;
                    font-size:13px; table-layout:fixed; margin:12px 0">
        <thead style="background:#f5f5f5">
          <tr>
            <th style="border:1px solid #ccc; padding:6px; width:18%">Date</th>
            <th style="border:1px solid #ccc; padding:6px; width:15%">Rider</th>
            <th style="border:1px solid #ccc; padding:6px; width:15%">Phone</th>
            <th style="border:1px solid #ccc; padding:6px; width:25%">Message</th>
            ${stops[0] ? '<th style="border:1px solid #ccc; padding:6px; width:15%">Pickup</th>' : ''}
            ${stops[1] ? '<th style="border:1px solid #ccc; padding:6px; width:15%">Destination</th>' : ''}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #ccc; padding:6px; word-break:break-word">${dateTxt}</td>
            <td style="border:1px solid #ccc; padding:6px; word-break:break-word">${rider}</td>
            <td style="border:1px solid #ccc; padding:6px; word-break:break-word">
              ${riderPhoneHref ? `<a href="${riderPhoneHref}" style="color:#0a58ca">${riderPhoneText}</a>` : '[sin teléfono]'}
            </td>
            <td style="border:1px solid #ccc; padding:6px; word-break:break-word">${msg}</td>
            ${stops.map(createStopCell).join('')}
          </tr>
        </tbody>
      </table>
    </div>
  `;

  block.replaceWith(document.createRange().createContextualFragment(tableHTML));
}
