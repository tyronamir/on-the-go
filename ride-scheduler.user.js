// ==UserScript==
// @name         RideScheduler – Excel view + Sort filter (Today & Week) + MutationObserver
// @namespace    http://tampermonkey.net/
// @version      6.4
// @description  Mobile → tabla Excel + botón Sort (Today/Week). Desktop → layout original (solo lógica). Persistente con MutationObserver.
// @author       tyronamir
// @match        https://onthego.ridescheduler.com/Scheduler/My?view=table&Title=Rides+Assigned+To+Me
// @grant        none
// @updateURL    https://raw.githubusercontent.com/tyronamir/on-the-go/main/ride-scheduler.user.6.4.js
// @downloadURL  https://raw.githubusercontent.com/tyronamir/on-the-go/main/ride-scheduler.user.6.4.js
// ==/UserScript==



const RealDate = Date;
window.__riderData = []; // Memoria global para almacenar riderName y riderPhone por bloque


(function () {
    'use strict';

  /***************************************************************************
   *            0 bis) FAKE DATE de un solo uso                              *
   ***************************************************************************/

  // Lee “rsFakeDateOnce”; si existe, redefine Date y luego borra la marca
  (function applyStoredFakeDate() {
    const iso = localStorage.getItem('rsFakeDateOnce');
    if (!iso) return;                    // no hay override pendiente

    const injectedCode = `
      (function () {
        const _Date = Date;
        const fakeNow = new _Date('${iso}T00:00:00');
        function FakeDate(...args){
          return args.length === 0 ? new _Date(fakeNow) : new _Date(...args);
        }
        FakeDate.now   = () => fakeNow.getTime();
        FakeDate.UTC   = _Date.UTC;
        FakeDate.parse = _Date.parse;
        FakeDate.prototype = _Date.prototype;
        window.Date = FakeDate;
      })();`;

    const s = document.createElement('script');
    s.textContent = injectedCode;
    document.documentElement.prepend(s);   // lo más arriba posible

    // Consumido: eliminar para que futuros refresh usen la fecha real
    localStorage.removeItem('rsFakeDateOnce');
  })();




    /***************************************************************************
     *                                                                         *
     *            0) UTILIDADES GENERALES                                     *
     *                                                                         *
     ***************************************************************************/

    const DATE_REGEX = /(\d{1,2})\/(\d{1,2})\/(\d{4})/;
    // Detectar si es dispositivo móvil o desktop
    const isMobile   = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);

    // Parsea "MM/DD/YYYY" y retorna Date
    function parseDate(str) {
      const m = str.match(DATE_REGEX);
      if (!m) return null;
      return new Date(+m[3], +m[1] - 1, +m[2]);
    }



    /***************************************************************************
     *                                                                         *
     *            1) BOTÓN SORT                                               *
     *                                                                         *
     ***************************************************************************/

    function addSortButton() {
  // Evitar duplicados
  if (document.getElementById('sortToggle')) return;

  const toolbar = document.querySelector('.col-md-6.col-sm-12.text-center #view-change');
  if (!toolbar) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'k-button k-button-icontext';
  wrapper.innerHTML = `
    <div style="display:inline-block; position:relative; margin-left:10px;">
      <button id="sortToggle" class="k-button k-button-icontext" type="button">
        <span class="k-icon fa fa-filter"></span> Sort
      </button>
      <ul id="sortMenu"
          style="display:none; position:absolute; top:100%; left:0; background:#fff;
                 border:1px solid #ccc; list-style:none; margin:0; padding:4px 0;
                 box-shadow:0 2px 8px rgba(0,0,0,.15); z-index:9999; width:120px;">
        <li class="sortOption" data-mode="today"
            style="padding:6px 12px; cursor:pointer;">Today</li>
        <li class="sortOption" data-mode="tomorrow"
            style="padding:6px 12px; cursor:pointer;">Tomorrow</li>
        <li class="sortOption" data-mode="week"
            style="padding:6px 12px; cursor:pointer;">Week</li>
      </ul>
    </div>
  `;
  toolbar.appendChild(wrapper);

  // Mostrar/ocultar el menú
  const toggleBtn = wrapper.querySelector('#sortToggle');
  const menu      = wrapper.querySelector('#sortMenu');
  toggleBtn.onclick = e => {
    e.stopPropagation();
    menu.style.display = (menu.style.display === 'block') ? 'none' : 'block';
  };

  document.addEventListener('click', () => {
    menu.style.display = 'none';
  });

  // Vincular las opciones "Today", "Tomorrow" y "Week"
 wrapper.querySelectorAll('.sortOption').forEach(opt => {
  opt.onclick = () => {
    const mode = opt.dataset.mode;

    // Siempre limpiar cualquier override
    localStorage.removeItem('rsFakeDateOnce');
    localStorage.removeItem('rsAutoToday');
    localStorage.removeItem('rsForceRealDate');

   if (mode === 'week') {
  // Desactiva filtro automático al recargar
  localStorage.setItem('rsSkipAutoFilter', '1');
  localStorage.removeItem('rsFakeDateOnce');
  localStorage.removeItem('rsAutoToday');
  localStorage.removeItem('rsForceRealDate');
  location.reload();
} else {
  localStorage.removeItem('rsSkipAutoFilter'); // por si acaso
  localStorage.setItem('rsForceRealDate', '1');
  localStorage.setItem('rsAutoToday', mode);
  location.reload();
}



    menu.style.display = 'none';
  };
});


}


    /***************************************************************************
  *                                                                         *
  *            1b) BOTÓN PRINT (vista imprimible)                           *
  *                                                                         *
  ***************************************************************************/

  /***************************************************************************
 *                                                                         *
 *            1b) BOTÓN PRINT (vista imprimible sin abrir ventana)         *
 *                                                                         *
 ***************************************************************************/
function addPrintButton() {
  if (document.getElementById('printToggle')) return; // evitar duplicados
  const toolbar = document.querySelector('.col-md-6.col-sm-12.text-center #view-change');
  if (!toolbar) return;

  const wrapper = document.createElement('div');
  wrapper.className = 'k-button k-button-icontext';
  wrapper.innerHTML = `
    <div style="display:inline-block; position:relative; margin-left:10px;">
      <button id="printToggle" class="k-button k-button-icontext" type="button">
        <span class="k-icon fa fa-print"></span> Print
      </button>
    </div>`;
  toolbar.appendChild(wrapper);

  const btn = wrapper.querySelector('#printToggle');
  btn.onclick = e => {
    e.stopPropagation();

    // **1) Limpiar contenedores o estilos anteriores** (si existen) para evitar duplicados
    const oldArea  = document.getElementById('rsPrintArea');
    if (oldArea) oldArea.remove();
    const oldStyle = document.getElementById('rsPrintStyle');
    if (oldStyle) oldStyle.remove();

    // **2) Generar el HTML de la tabla**
    const html = buildPrintHTML();

    // **3) Crear contenedor oculto para imprimir**
    const area = document.createElement('div');
    area.id = 'rsPrintArea';
    area.style.display = 'none'; // se mostrará solo en @media print
    area.innerHTML = html;
    document.body.appendChild(area);

    // **4) Inyectar estilos de impresión**
    const style = document.createElement('style');
    style.id = 'rsPrintStyle'; // para poder identificarlo en futuras limpiezas
    style.textContent = `
      ${printCSS()}
      @media print {
        body > *:not(#rsPrintArea) { display:none !important; }
        #rsPrintArea          { display:block !important; }
      }`;
    document.head.appendChild(style);

    // **5) Lanzar impresión**
    window.print();

    // **6) Limpieza final cuando termina la impresión**
    window.onafterprint = () => {
      area.remove();
      style.remove();
      window.onafterprint = null;
    };
  };
}

/***************************************************************************
 *                  Helpers para imprimir                                  *
 ***************************************************************************/

// Genera la tabla simplificada para imprimir
function buildPrintHTML() {
  // Solo los bloques .scheduler-row-block que estén visibles (no display:none)
  const rows = [...document.querySelectorAll('#scheduler .scheduler-row-block')]
    .filter(row => row.offsetParent !== null);

  rows.forEach(row => {
  const date  = row.querySelector('[data-eventmini-id]')?.innerText.replace(/\n/g,' ').trim() || '';
  const riderName = row.querySelector('.person-name')?.textContent.trim() || '';
  const riderPhoneLink = row.querySelector('[class^="phone-block"] a');
  const riderPhone = riderPhoneLink ? `<br><a href="${riderPhoneLink.href}" style="color:#0a58ca">${riderPhoneLink.textContent.trim()}</a>` : '';
  const rider = `${riderName}${riderPhone}`;


    const msg   = row.querySelector('.message-window-edit')?.innerText.replace(/\n/g,' ').trim() || '';

    const stops = [...row.querySelectorAll('.stop-block')].map(sb => {
      const place = sb.querySelector('div[data-title]')?.innerText.trim() || '';
      const time  = sb.querySelector('span')?.textContent.trim() || '';
      return `<td style="padding:4px 8px; border:1px solid #ccc;">
                <strong>${place}</strong><br>${time}
              </td>`;
    }).join('');

    // Celda con doble cuadro (exterior 30×30 px, interior 14×14 px)
    const check = `
      <td style="border:1px solid #ccc; width:32px; height:32px; text-align:center; vertical-align:middle;">
        <div style="width:14px; height:14px; border:1px solid #000; display:inline-block;"></div>
      </td>`;

    parts.push(`
      <tr>
        <td style="padding:4px 8px; border:1px solid #ccc; width:15%">${date}</td>
        <td style="padding:4px 8px; border:1px solid #ccc; width:15%">${rider}</td>
        <td style="padding:4px 8px; border:1px solid #ccc; width:25%">${msg}</td>
        ${stops}
        ${check}
      </tr>`);
  });

  return `
    <table style="width:100%; border-collapse:collapse; font-size:12px;">
      <thead>
        <tr style="background:#f0f0f0">
          <th style="border:1px solid #ccc; padding:4px 8px; width:15%">Date/Time</th>
          <th style="border:1px solid #ccc; padding:4px 8px; width:15%">Rider</th>
          <th style="border:1px solid #ccc; padding:4px 8px; width:25%">Message</th>
          <th style="border:1px solid #ccc; padding:4px 8px;" colspan="2">Stops</th>
          <th style="border:1px solid #ccc; padding:4px 8px; width:32px;">✓</th>
        </tr>
      </thead>
      <tbody>
        ${parts.join('')}
      </tbody>
    </table>
  `;
}

// Define estilos de impresión
function printCSS() {
  return `
    @page {
      size: portrait;
      margin: 10mm;
    }
    body  {
      font-family: Arial, sans-serif;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      border: 1px solid #ccc;
      padding: 4px 8px;
    }
    th {
      background: #f0f0f0;
    }
  `;
}

  /***************************************************************************
  *                                                                         *
  *            1c) BOTÓN CHECK DATE  (“viajar en el tiempo”)                *
  *                                                                         *
  ***************************************************************************/

  /***************************************************************************
  *            1c) BOTÓN CHECK DATE (selector inline)                        *
  ***************************************************************************/

  function addCheckDateButton() {
    if (document.getElementById('checkDateToggle')) return;
    const toolbar = document.querySelector('.col-md-6.col-sm-12.text-center #view-change');
    if (!toolbar) return;

    const wrapper = document.createElement('div');
    wrapper.className = 'k-button k-button-icontext';
    wrapper.innerHTML = `
      <div style="display:inline-block; position:relative; margin-left:10px;">
        <button id="checkDateToggle" class="k-button k-button-icontext" type="button">
          <span class="k-icon fa fa-calendar"></span> Check&nbsp;Date
        </button>
        <input type="date" id="fakeDateInput"
               style="position:absolute; opacity:0; width:1px; height:1px; pointer-events:auto;"
               tabindex="-1">
      </div>`;
    toolbar.appendChild(wrapper);

    const toggleBtn = wrapper.querySelector('#checkDateToggle');
    const picker    = wrapper.querySelector('#fakeDateInput');

    // Al hacer clic, se enfoca el input y se dispara el selector nativo
    toggleBtn.onclick = e => {
      e.stopPropagation();
      picker.focus();
      if (typeof picker.showPicker === 'function') {
        picker.showPicker();
      } else {
        picker.click();
      }
    };

    // Cuando se selecciona una fecha, se invoca setFakeToday
    picker.onchange = () => {
      if (!picker.value) return;
      setFakeToday(picker.value);  // guarda, inyecta y recarga
    };
  }



  /* ---------- helper que guarda la fecha y recarga ---------- */
  function setFakeToday(isoDateStr) {
    localStorage.setItem('rsFakeDateOnce', isoDateStr); // se consumirá y borrará en la próxima carga
    localStorage.setItem('rsAutoToday',   'today');        // aplicar filtro “Today” tras recarga

    // Limpia overrides anteriores en el DOM (por si acaso)
    document.querySelectorAll('script[data-fake-date]').forEach(s => s.remove());

    const injectedCode = `
      (function () {
        const _Date = Date;
        const fakeNow = new _Date('${isoDateStr}T00:00:00');
        function FakeDate(...args){ return args.length===0 ? new _Date(fakeNow) : new _Date(...args); }
        FakeDate.now  = () => fakeNow.getTime();
        FakeDate.UTC  = _Date.UTC;
        FakeDate.parse= _Date.parse;
        FakeDate.prototype = _Date.prototype;
        window.Date = FakeDate;
      })();`;

    const s = document.createElement('script');
    s.textContent = injectedCode;
    s.setAttribute('data-fake-date','');
    document.documentElement.prepend(s);

    location.reload();               // recarga con la nueva “hoy”
  }




    /***************************************************************************
     *                                                                         *
     *            2) FILTRAR TABLAS (TODAY & WEEK)                            *
     *                                                                         *
     ***************************************************************************/

    function filterTables(mode) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      // Definir semana actual (domingo a sábado)
      const startWeek = new Date(today);
      startWeek.setDate(today.getDate() - today.getDay());
      const endWeek   = new Date(startWeek);
      endWeek.setDate(startWeek.getDate() + 6);

      const kept = [];
      const removed = [];

      // Buscar contenedores generados con la transform
      document.querySelectorAll('#scheduler .k-listview-content > div[data-transformed]').forEach(div => {
        const raw =
          div.querySelector('table td')?.textContent.trim() ||
          div.querySelector('[data-eventmini-id]')?.innerText.replace(/\n/g, ' ').trim() ||
          '';

        const d = parseDate(raw);
        if (!d) {
          div.style.display = 'none';
          removed.push(raw);
          return;
        }

        let keep = false;
        if (mode === 'today') {
  keep = (d.getTime() === today.getTime());
} else if (mode === 'tomorrow') {
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  keep = (d.getTime() === tomorrow.getTime());
} else if (mode === 'week') {
  keep = (d >= startWeek && d <= endWeek);
}


        if (keep) {
          div.style.display = '';
          kept.push(raw);
        } else {
          div.style.display = 'none';
          removed.push(raw);
        }
      });


      console.log(`📌 Filtro aplicado: ${mode.toUpperCase()}`);
      console.log(`✅ Conservados (${kept.length}):`, kept);
      console.log(`🗑️ Eliminados  (${removed.length}):`, removed);
    }



    /***************************************************************************
     *                                                                         *
     *            3) TRANSFORMACIÓN BLOQUES → TABLAS EXCEL (solo móvil)       *
     *                                                                         *
     ***************************************************************************/

    // Crea celdas <td> con la parada
    function createStopCell(stop) {
  const outerDiv = stop.querySelector('div');
  const strong   = outerDiv?.querySelector('strong');
  const span     = outerDiv?.querySelector('span.cursor-pointer');

  if (!strong || !span) return '<td></td>'; // sin datos útiles

  const name    = strong.textContent.trim();
  const address = span.textContent.trim();
  const encoded = encodeURIComponent(address);

  // Enlace: geo en móvil, Google Maps en desktop
  const link = isMobile
    ? `<span style="color:#0a58ca; cursor:pointer" onclick="window.location.href='geo:0,0?q=${encoded}'">${address}</span>`
    : `<a href="https://www.google.com/maps/search/?api=1&query=${encoded}" target="_blank">${address}</a>`;

  return `
    <td style="border:1px solid #ccc; padding:6px; min-width:100px; word-break:break-word">
      <strong>${name}</strong><br>${link}
    </td>
  `;
}



    // Transforma un .scheduler-row-block
   // Transforma un .scheduler-row-block
// Transforma un .scheduler-row-block
function transformBlock(block) {
  if (block.dataset.transformed) return;

  // Eliminar Drivers
  block.querySelectorAll('.fancy-scroll').forEach(b => {
    const label = b.querySelector('label')?.textContent.trim();
    if (label === 'Drivers') b.remove();
  });

  // Eliminar campos innecesarios
  block.querySelector('[id^="field-block-"]')?.parentElement?.remove();

  // Desktop: solo convierte direcciones
  if (!isMobile) {
    block.querySelectorAll('.stop-block').forEach(convertStops);
    block.dataset.transformed = 'desktop';
    return;
  }

  // Móvil → construir tabla
  block.querySelectorAll('.stop-block').forEach(convertStops);

  const dateTxt = block.querySelector('[data-eventmini-id]')?.innerText.replace(/\n/g, ' ') || '';
  const rider   = block.querySelector('.person-name')?.textContent.trim() || '';
  const msg     = block.querySelector('.message-window-edit')?.innerText.replace(/\n/g, ' ') || '';
  const stops   = [...block.querySelectorAll('.stop-block')];

  // Obtener teléfono del primer stop-block
  let riderPhone = '';
  if (stops[0]) {
    const phoneLink = stops[0].querySelector('a[href^="tel:"]');
    if (phoneLink) {
      const phoneText = phoneLink.textContent.trim();
      const phoneHref = phoneLink.getAttribute('href');
      riderPhone = `<br><a href="${phoneHref}" style="color:#0a58ca">${phoneText}</a>`;
    }
  }

  const riderHTML = `${rider}${riderPhone || '<br><span style="color:#777">[sin teléfono]</span>'}`;

  const tableHTML = `
    <div data-transformed="mobile" style="width:100%; margin-bottom:12px;">
      <table style="width:100%; border-collapse:collapse; border:1px solid #ccc;
                    font-size:14px; table-layout:fixed;">
        <thead style="background:#f5f5f5">
          <tr>
            <th style="border:1px solid #ccc; padding:8px; width:24%">Date</th>
            <th style="border:1px solid #ccc; padding:8px; width:28%">Rider</th>
            <th style="border:1px solid #ccc; padding:8px; width:28%">Message</th>
            ${stops[0] ? '<th style="border:1px solid #ccc; padding:8px; width:20%">Pickup</th>' : ''}
            ${stops[1] ? '<th style="border:1px solid #ccc; padding:8px; width:20%">Destination</th>' : ''}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="border:1px solid #ccc; padding:6px; word-break:break-word">${dateTxt}</td>
            <td style="border:1px solid #ccc; padding:6px; word-break:break-word">${riderHTML}</td>
            <td style="border:1px solid #ccc; padding:6px; word-break:break-word">${msg}</td>
            ${stops.map(createStopCell).join('')}
          </tr>
        </tbody>
      </table>
    </div>
  `;

  block.replaceWith(document.createRange().createContextualFragment(tableHTML));
}




    /***************************************************************************
     *                                                                         *
     *            4) PROCESAR TODAS LAS FILAS                                  *
     *                                                                         *
     ***************************************************************************/

    function processAll() {
        document.querySelectorAll('.scheduler-row-block').forEach(transformBlock);
        addSortButton();
        addPrintButton();          // <-- llamada añadida
        addCheckDateButton();
        if (isMobile) {
  const toolbar = document.querySelector('.col-md-6.col-sm-12.text-center #view-change');
  if (toolbar) {
    // ❌ Eliminar solo los botones "Calendar" y "Table"
    toolbar.querySelectorAll('button[data-view]').forEach(btn => btn.remove());
  }
}


      }



    /***************************************************************************
     *                                                                         *
     *            5) OBSERVAR CAMBIOS DINÁMICOS (MutationObserver)            *
     *                                                                         *
     ***************************************************************************/

    function observeScheduler() {
      const target = document.querySelector('#scheduler .k-listview-content');
      if (!target) return;

      const obs = new MutationObserver((mutationList) => {
        let foundChange = false;
        for (const mut of mutationList) {
          mut.addedNodes?.forEach(n => {
            if (n.nodeType === 1 && n.matches?.('.scheduler-row-block')) {
              transformBlock(n);
              foundChange = true;
            }
          });
        }
        // Si se agregaron .scheduler-row-block, re-procesar todo
        if (foundChange) processAll();
      });
      obs.observe(target, { childList: true, subtree: true });
    }



    /***************************************************************************
 *            6) INIT                                                      *
 ***************************************************************************/

// ✅ FIX: Declarar antes de usar
let __rsInitDone = false;

function init() {
  if (__rsInitDone) return;
  __rsInitDone = true;

  processAll();
  observeScheduler();

  const realNow = new RealDate();
  const fakeNow = new Date(); // Esto usará el override si está activo
  const diff = fakeNow.getTime() - realNow.getTime();
  if (Math.abs(diff - 86400000) < 60000) {
    console.log("Fake date equals tomorrow. Reverting to real date.");
    window.Date = RealDate;
  }

  // ❌ Ya no hagas el filterTables aquí, lo moveremos abajo cuando todo esté listo
  // ✅ Lo haremos en autoClickToday con mejor timing
}







    /***************************************************************************
     *                                                                         *
     *  AUXILIAR: convertir direcciones dentro de stop-block (desktop)        *
     *                                                                         *
     ***************************************************************************/

    function convertStops(stopBlock) {
      const div = stopBlock.querySelector('div[data-title]');
      if (!div) return;

      const name = div.querySelector('strong')?.textContent.trim() || '';
      div.querySelectorAll('a[href^="tel:"]').forEach(a => a.remove());

      // Espacio extra en desktop para no pegar "NameAddress"
      let raw = div.innerText;
      if (!isMobile) {
        raw = raw.replace(name, name + ' ');
      }

      const addr = raw.replace(name, '').trim();
      if (!addr) return;

      const enc = encodeURIComponent(addr);
      const link = isMobile
        ? `<span style="color:#0a58ca;cursor:pointer" onclick="window.location.href='geo:0,0?q=${enc}'">${addr}</span>`
        : `<a href="https://www.google.com/maps/search/?api=1&query=${enc}" target="_blank">${addr}</a>`;

      // Reemplazar nodos de texto
      div.childNodes.forEach(n => {
        if (n.nodeType === 3 && n.textContent.trim()) {
          n.replaceWith(document.createRange().createContextualFragment(link));
        }
      });
    }


  /***************************************************************************
  *            BOOTSTRAP ROBUSTO – espera a #scheduler listo                *
  *            (pegar justo antes del cierre del IIFE)                      *
  ***************************************************************************/
  (function bootstrap () {
  const POLL_MS  = 400;   // intervalo entre intentos
  const MAX_WAIT = 60000; // tiempo máx. 60 s
  let   waited   = 0;

  // Detectar si la página fue recargada manualmente
  function isPageReload() {
    const nav = performance.getEntriesByType("navigation")[0];
    return (nav && nav.type === "reload") || performance.navigation.type === 1;
  }

 if (isPageReload() && !localStorage.getItem('rsAutoToday') && !localStorage.getItem('rsSkipAutoFilter')) {
  localStorage.setItem('rsAutoToday', 'today');
}



  const earlyObs = new MutationObserver(() => {
    if (document.querySelector('#scheduler .k-listview-content')) {
      earlyObs.disconnect();
      init();
      autoClickToday(); // ← Filtro automático si se recargó
    }
  });
  earlyObs.observe(document.documentElement, { childList:true, subtree:true });

  (function poll () {
    if (document.querySelector('#scheduler .k-listview-content')) {
      init();
      autoClickToday(); // ← Filtro automático si se recargó
    } else if ((waited += POLL_MS) < MAX_WAIT) {
      setTimeout(poll, POLL_MS);
    }
  })();

  /* ------------------------------------------------------------------ *
   *  autoClickToday(): si existe fecha falsa guardada, espera a que    *
   *  los viajes se dibujen y ejecuta filterTables('today')             *
   * ------------------------------------------------------------------ */
 function autoClickToday() {
  if (localStorage.getItem('rsSkipAutoFilter')) {
    localStorage.removeItem('rsSkipAutoFilter'); // limpiar para futuros usos
    return;
  }

  const mode = localStorage.getItem('rsAutoToday');
  if (!mode) return;

  const id = setInterval(() => {
    const ready = document.querySelector('#scheduler .k-listview-content > div[data-transformed]');
    if (ready) {
      clearInterval(id);
      localStorage.removeItem('rsAutoToday');
      console.log(`✅ Filtro automático aplicado: ${mode.toUpperCase()}`);
      filterTables(mode);
    }
  }, 300);
}

})();

    /***************************************************************************
 *                                                                         *
 *     7) AUTO-CHECK de nuevas versiones cada vez que se abra la página    *
 *                                                                         *
 ***************************************************************************/

(function autoForceUpdateCheck() {
  const lastCheck = localStorage.getItem('rsLastUpdateCheck') || 0;
  const now = Date.now();
  const ONE_HOUR = 3600000;

  if (now - lastCheck > ONE_HOUR) {
    localStorage.setItem('rsLastUpdateCheck', now.toString());

    // URL de actualización definida en el metablock
    const url = 'https://raw.githubusercontent.com/tyronamir/on-the-go/main/ride-scheduler.user.js';

    fetch(url)
      .then(res => res.text())
      .then(newCode => {
        const currentVersion = '6.1';  // ← actualízalo cuando cambies el metablock
        const match = newCode.match(/@version\s+([^\s]+)/);
        if (match && match[1] && match[1] !== currentVersion) {
          alert(`🚀 ¡Nueva versión disponible! (${match[1]})\nVe al Dashboard de Tampermonkey para actualizar.`);
        }
      })
      .catch(console.error);
  }
})();






  })();
