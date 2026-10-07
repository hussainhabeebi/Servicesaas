export const clientScript = `
(() => {
  const form = document.getElementById('enquiry');
  if (!form) return;
  const output = document.getElementById('estimate');
  const breakdown = document.getElementById('estimate-detail');
  const service = form.elements.namedItem('service');
  const hours = form.elements.namedItem('hours');
  const materials = form.elements.namedItem('materials');
  const date = form.elements.namedItem('date');
  const location = form.elements.namedItem('location');
  const settings = document.getElementById('danfe-settings');
  const runtime = settings ? JSON.parse(settings.textContent || '{}') : {};
  const city = form.elements.namedItem('city');
  const rateFor = withMaterials => city?.value === 'Dubai' ? (withMaterials ? 40 : 30) : (runtime.services || []).find(service => service.category === (withMaterials ? 'danfe_materials' : 'danfe_normal') && service.duration_minutes === 60)?.price ?? (withMaterials ? 35 : 25);
  // Dubai's date, independent of the visitor's timezone; no invented availability.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Dubai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = type => parts.find(p => p.type === type).value;
  date.min = part('year') + '-' + part('month') + '-' + part('day');
  function update() {
    const normal = service.value === 'Home cleaning' || service.value === 'Office cleaning';
    const rate = rateFor(materials.value === 'With materials');
    output.value = normal ? 'AED ' + (Number(hours.value) * rate) : 'Quote required';
    breakdown.textContent = normal ? hours.value + ' hours × AED ' + rate + '/hour, one cleaner' : 'Specialist scope confirmed with the team';
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const message = ['Hello Our Danfe, I would like to enquire about cleaning.', 'Service: ' + service.value, 'City: ' + (city?.value || 'Sharjah'), 'Location: ' + location.value.trim(), 'Preferred date: ' + (date.value || 'Please discuss with me'), 'Hours requested (one cleaner): ' + hours.value, 'Option: ' + materials.value, 'Estimate: ' + output.value, 'Please confirm availability, scope and final total.'].join('\\n');
    const phone = (runtime.content?.phone || '971562145676').replace(/[^0-9]/g, '');
    window.location.assign('https://wa.me/' + phone + '?text=' + encodeURIComponent(message));
  });
  update();
})();
`;

