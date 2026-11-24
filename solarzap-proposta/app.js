(() => {
  'use strict';
  const $ = (s) => document.querySelector(s);
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const money = new Intl.NumberFormat('pt-BR', {style:'currency',currency:'BRL'});
  const decimal = new Intl.NumberFormat('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  const format = (v, type) => type === 'money' ? money.format(v) : decimal.format(v);
  function count(el) {
    if (reduced || el.dataset.done) return;
    el.dataset.done = '1'; const target = Number(el.dataset.count); const start = performance.now();
    const tick = (now) => {if(el.dataset.done==='print')return;const t = Math.min((now-start)/1000,1); el.textContent = format(target*(1-Math.pow(1-t,3)),el.dataset.format); if(t<1) requestAnimationFrame(tick);};
    requestAnimationFrame(tick);
  }
  if (!reduced && 'IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => entries.forEach(e => {if(e.isIntersecting){e.target.classList.add('visible');e.target.querySelectorAll('[data-count]').forEach(count);obs.unobserve(e.target);}}), {threshold:0.08});
    document.documentElement.classList.add('motion'); document.querySelectorAll('.reveal').forEach(el => obs.observe(el));
    count($('.hero-number'));
  }
  function progress(){const max = document.documentElement.scrollHeight-innerHeight; $('.progress').style.transform=`scaleX(${max>0?Math.min(1,scrollY/max):0})`;}
  addEventListener('scroll',progress,{passive:true});addEventListener('resize',progress);progress();
  const slider=$('#year-range');
  const { proposalNumber, total, commercialWhatsapp, series: publishedSeries, plot: publishedPlot } = document.documentElement.dataset;
  const series = publishedSeries ? JSON.parse(publishedSeries) : Array.from({length:26}, (_, year) => year / 25 * 137000);
  const plot = publishedPlot ? JSON.parse(publishedPlot) : series.map((_, year) => [year / 25 * 760, 230 - year / 25 * 199.6]);
  function updateProjection() {
    const year = Number(slider.value);
    const [x, y] = plot[year] || plot[plot.length - 1];
    $('#year-label').textContent = year;
    $('#year-output').textContent = year === 1 ? '1 ano' : `${year} anos`;
    $('#year-value').textContent = money.format(series[year] ?? series[series.length - 1]);
    $('#year-point').setAttribute('cx', x);
    $('#year-point').setAttribute('cy', y);
    $('#year-line').setAttribute('x1', x);
    $('#year-line').setAttribute('x2', x);
  }
  slider.addEventListener('input', updateProjection);
  updateProjection();
  // Configure with the company's WhatsApp (country code + area code + number).
  // Leave empty for WhatsApp's recipient picker; never use the customer's phone here.
  const commercialWhatsApp = commercialWhatsapp || '';
  const dialog=$('#approval-dialog'), form=$('#approval-form'), status=$('#send-status');
  $('#approve')?.addEventListener('click',()=>{form.reset();status.textContent='A confirmação será preparada no WhatsApp para envio. Não substitui a assinatura do contrato.';dialog.showModal();});
  $('#close-dialog').addEventListener('click',()=>dialog.close());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close();});
  form.addEventListener('submit',e=>{
    e.preventDefault(); const choice=new FormData(form).get('payment'); if(!choice)return;
    const message=`Olá! Confirmo meu aceite comercial da proposta de energia solar ${proposalNumber || 'PROP-FE9AE459'}, no valor total de ${total || 'R$ 10.000,00'}. Forma de pagamento escolhida: ${choice}. Autorizo o prosseguimento para a formalização do contrato e execução do projeto, conforme as condições da proposta.`;
    const destination=commercialWhatsApp.replace(/\D/g,'');
    const url=`https://wa.me/${destination}?text=${encodeURIComponent(message)}`;
    window.open(url,'_blank','noopener,noreferrer');
    status.textContent=destination?'Confirme o envio no WhatsApp para concluir.':'Selecione o contato da equipe comercial no WhatsApp e confirme o envio.';
  });
  document.querySelectorAll('#print,[data-print]').forEach(b=>b.addEventListener('click',()=>window.print()));
  let previousYear;
  addEventListener('beforeprint',()=>{
    document.querySelectorAll('details').forEach(d=>{d.dataset.wasOpen=String(d.open);d.open=true;});
    document.querySelectorAll('[data-count]').forEach(el=>{el.dataset.done='print';el.textContent=format(Number(el.dataset.count),el.dataset.format);});
    previousYear=slider.value;slider.value=slider.max;updateProjection();
  });
  addEventListener('afterprint',()=>{
    document.querySelectorAll('details').forEach(d=>{d.open=d.dataset.wasOpen==='true';});
    if(previousYear!=null){slider.value=previousYear;slider.dispatchEvent(new Event('input'));}
  });
})();
