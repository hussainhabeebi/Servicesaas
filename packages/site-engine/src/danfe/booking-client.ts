export const bookingClientScript = `
(() => {
  const settingsEl = document.getElementById('danfe-settings');
  if (!settingsEl) return;
  const initial = JSON.parse(settingsEl.textContent || '{}');
  const bookingForm = document.getElementById('online-booking');
  const list = document.getElementById('booking-list');
  const changeForm = document.getElementById('booking-change');
  const api = async (path, options = {}) => {
    const response = await fetch('/booking-api' + path, { ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
    const data = await response.json();
    if (!response.ok) throw new Error(typeof data.error === 'string' ? data.error : 'Please check the details and retry.');
    return data;
  };
  const node = (tag, text, className) => { const el = document.createElement(tag); if (text) el.textContent = text; if (className) el.className = className; return el; };
  const readSaved = () => { try { const value = JSON.parse(sessionStorage.getItem('danfe-bookings') || '[]'); return Array.isArray(value) ? value.filter(item => typeof item.id === 'string' && typeof item.token === 'string').slice(-20) : []; } catch { return []; } };
  const save = record => { try { const saved = readSaved().filter(item => item.id !== record.id); sessionStorage.setItem('danfe-bookings', JSON.stringify([...saved, record].slice(-20))); } catch {} };
  const uaeDate = value => new Intl.DateTimeFormat('en-AE', { timeZone: 'Asia/Dubai', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
  const updateRates = services => {
    ['normal', 'materials'].forEach(kind => {
      const service = services.find(s => s.category === 'danfe_' + kind && s.duration_minutes === 60);
      if (service) document.querySelectorAll('[data-rate="' + kind + '"]').forEach(el => { el.textContent = 'AED ' + service.price + ' / hour'; });
    });
  };
  updateRates(initial.services || []);

  if (bookingForm) {
    const fields = bookingForm.elements;
    const serviceInput = fields.namedItem('service_id');
    const date = fields.namedItem('date');
    const time = fields.namedItem('time');
    const city = fields.namedItem('city');
    const price = document.getElementById('booking-price');
    const feedback = document.getElementById('booking-feedback');
    const connection = document.getElementById('booking-connection');
    const submit = document.getElementById('booking-submit');
    const slots = document.getElementById('booking-slots');
    let catalogue = [], sending = false, slotRevision = 0;
    const query = new URLSearchParams(location.search);
    if (query.get('city') === 'Dubai') city.value = 'Dubai';
    const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
    const p = type => parts.find(part => part.type === type).value;
    date.min = p('year') + '-' + p('month') + '-' + p('day');
    const selected = () => catalogue.find(s => s.id === serviceInput.value);
    const update = () => { const service = selected(); price.value = service ? 'AED ' + Number(service.price).toFixed(0) : '—'; };
    async function loadSlots() {
      const revision = ++slotRevision;
      slots.replaceChildren();
      if (!date.value || !serviceInput.value) return;
      try {
        const result = await api('/suggestions/best-slots?service_id=' + encodeURIComponent(serviceInput.value) + '&date=' + encodeURIComponent(date.value));
        if (revision !== slotRevision) return;
        const times = (result.slots || []).filter(slot => slot.recommended).slice(0, 6);
        if (!times.length) { slots.append(node('p', 'No suggested times for this date. Contact the team or request your preferred time.', 'fine')); return; }
        slots.append(node('p','Suggested times · UAE','fine'));
        const row = node('div', '', 'slot-buttons');
        times.forEach(slot => {
          const label = new Intl.DateTimeFormat('en-GB', {timeZone:'Asia/Dubai',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(slot.start));
          const button = node('button',label); button.type = 'button'; button.setAttribute('aria-pressed','false');
          button.addEventListener('click', () => { time.value = label; row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed','false')); button.setAttribute('aria-pressed','true'); }); row.append(button);
        }); slots.append(row);
      } catch { if (revision === slotRevision) slots.append(node('p','Suggested times could not be loaded. You can enter a preferred time or contact the team.','fine')); }
    }
    async function refreshCatalogue() {
      try {
        const result = await api('/storefront');
        const previous = serviceInput.value;
        catalogue = result.services || [];
        serviceInput.replaceChildren(new Option('Choose your cleaning package',''));
        catalogue.forEach(service => serviceInput.append(new Option(service.name + ' · AED ' + service.price, service.id)));
        if (catalogue.some(s => s.id === previous)) serviceInput.value = previous;
        else { const category = query.get('category'); const service = catalogue.find(s => s.category === category && s.duration_minutes === 180); if (service) serviceInput.value = service.id; }
        serviceInput.disabled = false;
        submit.disabled = !catalogue.length || sending;
        connection.textContent = catalogue.length ? 'Choose from the available cleaning packages.' : 'No online services are available. Please contact our team.';
        update(); updateRates(catalogue);
      } catch (error) { connection.textContent = error.message; serviceInput.replaceChildren(new Option('Online booking unavailable', '')); serviceInput.disabled = true; price.value = '—'; submit.disabled = true; }
    }
    serviceInput.addEventListener('change', () => {update(); loadSlots();});
    date.addEventListener('change', loadSlots);
    bookingForm.addEventListener('submit', async event => {
      event.preventDefault(); if (sending || !bookingForm.reportValidity()) return;
      const service = selected(); if (!service) return;
      const scheduled = new Date(date.value + 'T' + time.value + ':00+04:00');
      if (!Number.isFinite(scheduled.getTime()) || scheduled.getTime() <= Date.now()) { feedback.textContent = 'Choose a future time in the UAE timezone.'; return; }
      sending = true; submit.disabled = true; submit.textContent = 'Booking…'; feedback.textContent = '';
      try {
        const result = await api('/bookings', {method:'POST', body:JSON.stringify({service_id:service.id,customer_name:fields.namedItem('customer_name').value.trim(),customer_phone:fields.namedItem('customer_phone').value.trim(),address_line:fields.namedItem('address_line').value.trim(),area:city.value + ', ' + fields.namedItem('area').value.trim(),scheduled_start:scheduled.toISOString()})});
        if (!result.id || !result.accessToken) throw new Error('The response did not include a booking reference. Contact our team before retrying.');
        save({id:result.id,token:result.accessToken});
        feedback.textContent = 'Booking created for ' + uaeDate(result.scheduled_start) + (result.staffingPending ? '. The team will confirm cleaner assignment.' : '.') + (result.depositRequired ? ' A deposit of AED ' + result.depositRequired + ' may be required.' : '');
        const anchor = node('a','View my booking','button'); anchor.href = '/bookings#booking=' + encodeURIComponent(result.id) + '&access=' + encodeURIComponent(result.accessToken); feedback.append(document.createElement('br'),anchor);
        submit.textContent = 'Booking created';
      } catch(error) { feedback.textContent = error.message + ' If the connection interrupted, check with the team before submitting again.'; sending = false; submit.disabled = false; submit.textContent = 'Book cleaning'; }
    });
    refreshCatalogue();
    document.addEventListener('visibilitychange', () => {if (!document.hidden && !sending) refreshCatalogue();});
  }

  if (list) {
    let selectedRecord;
    const hash = new URLSearchParams(location.hash.slice(1));
    if (hash.get('booking') && hash.get('access')) { save({id:hash.get('booking'),token:hash.get('access')}); history.replaceState(null,'',location.pathname); }
    async function refresh() {
      const records = readSaved(); if (!records.length) return;
      const cards = [];
      for (const record of records.slice().reverse()) {
        const card = node('article','','booking-record');
        try {
          const result = await api('/bookings/' + encodeURIComponent(record.id) + '/details',{headers:{Authorization:'Bearer ' + record.token}});
          const booking = result.booking;
          card.append(node('span',booking.status.replaceAll('_',' '),'status'),node('h2',booking.service || 'Cleaning booking'),node('p',uaeDate(booking.scheduled_start) + ' — ' + uaeDate(booking.scheduled_end)),node('p',booking.area || ''),node('p','Reference: ' + booking.id,'fine'));
          (result.invoices || []).forEach(invoice => card.append(node('p', invoice.invoice_number + ' · ' + invoice.status + ' · ' + invoice.currency + ' ' + invoice.total + ' · Paid ' + invoice.amount_paid, 'invoice-row')));
          if (booking.status === 'scheduled') { const change = node('button','Request a change','button outline'); change.type='button'; change.addEventListener('click',()=>{selectedRecord=record;changeForm.hidden=false;changeForm.scrollIntoView({block:'start'});}); card.append(change); }
        } catch(error) {card.append(node('p',error.message));}
        cards.push(card);
      }
      list.replaceChildren(...cards);
    }
    changeForm.addEventListener('submit', async event => {
      event.preventDefault(); if (!selectedRecord || !changeForm.reportValidity()) return;
      const feedback = document.getElementById('change-feedback');
      const fields = changeForm.elements; const kind = fields.namedItem('kind').value;
      const raw = fields.namedItem('preferred_start').value;
      if (kind === 'reschedule' && (!raw || !Number.isFinite(Date.parse(raw + ':00+04:00')))) {feedback.textContent='Enter a preferred UAE date and time.';return;}
      const button = changeForm.querySelector('button'); button.disabled=true;
      try { const result = await api('/bookings/' + encodeURIComponent(selectedRecord.id) + '/change-request',{method:'POST',headers:{Authorization:'Bearer '+selectedRecord.token},body:JSON.stringify({kind,reason:fields.namedItem('reason').value.trim(),preferred_start:kind==='reschedule'?new Date(raw + ':00+04:00').toISOString():undefined})});feedback.textContent=result.message; }
      catch(error){feedback.textContent=error.message;} finally{button.disabled=false;}
    });
    document.getElementById('forget-bookings').addEventListener('click',()=>{try{sessionStorage.removeItem('danfe-bookings');}catch{} location.reload();});
    refresh();
    const timer = setInterval(()=>{if(!document.hidden)refresh();},30000);
    window.addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
  }
})();
`;
