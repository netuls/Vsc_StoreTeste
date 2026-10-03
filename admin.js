const $ = id => document.getElementById(id);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const STIDX = { 'Novo': 0, 'Aguardando conferência': 1, 'Confirmado': 2, 'Em separação': 3, 'Saiu para entrega': 4, 'Entregue': 5, 'Cancelado': 6 };
const MSG_ST = ['Confirmado', 'Em separação', 'Saiu para entrega', 'Entregue', 'Cancelado'];
const ASSINATURA = '\n\n_VSC STORE · Elegância em cada peça_';
const MSG_PAD = {
  'Novo': 'Olá, {nome}! Recebemos o seu pedido nº {pedido} na VSC STORE.\n\n*Total:* {total}\n\nEm breve entraremos em contato para dar andamento.',
  'Aguardando conferência': 'Olá, {nome}! Recebemos o seu pedido nº {pedido} na VSC STORE e estamos conferindo o pagamento.\n\n*Total:* {total}\n\nAssim que for confirmado, avisaremos por aqui.',
  'Confirmado': 'Olá, {nome}! Seu pedido nº {pedido} foi confirmado. Agradecemos a preferência pela VSC STORE.\n\n{detalhes}\n*Total:* {total}',
  'Em separação': 'Olá, {nome}! Seu pedido nº {pedido} está em separação. Estamos preparando tudo com cuidado e avisaremos assim que ele sair para entrega.',
  'Saiu para entrega': 'Olá, {nome}! Seu pedido nº {pedido} saiu para entrega e chegará até você em breve. Pedimos que fique atento ao recebimento.',
  'Entregue': 'Olá, {nome}! Seu pedido nº {pedido} foi entregue. Agradecemos a confiança na VSC STORE e esperamos que você aproveite cada peça.',
  'Cancelado': 'Olá, {nome}. Informamos que o seu pedido nº {pedido} foi cancelado. Em caso de dúvidas, estamos à disposição por aqui.' };
// textos padrão antigos: se a mensagem salva for igual a um deles, passa a valer o novo padrão
const MSG_OLD = {
  'Confirmado': ['Olá, {nome}! Seu pedido na VSC STORE foi confirmado ✅ Total: {total}.', 'Olá, {nome}! Seu pedido na VSC STORE foi confirmado ✅\n\n{detalhes}\n\nTotal: {total}.'],
  'Em separação': ['Olá, {nome}! Seu pedido está em separação 📦 Avisamos assim que sair.'],
  'Saiu para entrega': ['Olá, {nome}! Seu pedido saiu para entrega 🚚 Fique atento, chega em breve!'],
  'Entregue': ['Olá, {nome}! Pedido entregue 🖤 Obrigado por comprar na VSC STORE!'],
  'Cancelado': ['Olá, {nome}. Seu pedido foi cancelado. Qualquer dúvida é só responder aqui.'] };
const msgDe = k => { const m = CFG.msgs && CFG.msgs[k]; return (m && !(MSG_OLD[k] || []).includes(m)) ? m : MSG_PAD[k]; };
let CFG = {}, ajInit = false, PED = {}, PROD = {}, logoNova;
let primeiro = true;

// ── Som: bipe de verdade (3 toques) + vibração, para quando o painel está aberto ──
let actx;
document.addEventListener('click', () => { try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume(); } catch (e) {} }, { once: true });
function beep() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
    [0, 0.3, 0.6].forEach(t => {
      const o = actx.createOscillator(), g = actx.createGain(), n = actx.currentTime + t;
      o.type = 'square'; o.frequency.value = 880; o.connect(g); g.connect(actx.destination);
      g.gain.setValueAtTime(0.0001, n); g.gain.exponentialRampToValueAtTime(0.4, n + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, n + 0.22);
      o.start(n); o.stop(n + 0.25);
    });
    if (navigator.vibrate) navigator.vibrate([300, 150, 300]);
  } catch (e) {}
}
const OPC_NOTIF = { icon: 'icon-192.png', badge: 'icon-192.png', renotify: true, silent: false, requireInteraction: true, vibrate: [300, 150, 300, 150, 500] };
// Push com o painel ABERTO: o Firebase não chama o service worker, então mostramos a notificação aqui
let ouvindoPush = false;
function ouvirPush() {
  if (ouvindoPush) return;
  try {
    firebase.messaging().onMessage(async m => {
      const d = m.data || {}; beep();
      if (window.Notification && Notification.permission === 'granted') {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification(d.title || 'Novo pedido', { ...OPC_NOTIF, body: d.body || '', tag: 'pedido-' + Date.now() });
      }
    });
    ouvindoPush = true;
  } catch (e) { console.error('ouvirPush:', e); }
}
auth.onAuthStateChanged(u => {
  const ok = u && u.email === LOJA.adminEmail;
  $('login').style.display = ok ? 'none' : 'block'; $('app').style.display = ok ? 'block' : 'none';
  if (ok) iniciar();
});
function iniciar() {
  ouvirPush();
  db.collection('config').doc('loja').onSnapshot(s => { CFG = s.data() || {}; if (!ajInit) { ajInit = true; preencherAjustes(); } renderBairros(); });
  db.collection('pedidos').orderBy('criadoEm', 'desc').limit(100).onSnapshot(s => {
    if (!primeiro && s.docChanges().some(c => c.type === 'added')) { const t = $('toast'); t.textContent = '🛍️ Novo pedido recebido!'; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 5000); beep(); }
    primeiro = false;
    PED = {}; s.docs.forEach(x => PED[x.id] = x.data());
    $('peds').innerHTML = s.docs.map(d => { const p = d.data(), id = d.id, sc = STIDX[p.status] ?? 0, ent = p.entrega, end = ent && ent.endereco;
      const entHtml = !ent ? '' : ent.tipo === 'Retirada' ? '<br><small>🏬 Retirada na loja</small>' : '<br><small>📍 <a href="https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(txtEnd(end)) + '" target="_blank" rel="noopener" style="color:inherit">' + esc(end.rua) + ', ' + esc(end.numero) + (end.complemento ? ' (' + esc(end.complemento) + ')' : '') + ' - ' + esc(end.bairro) + ', ' + esc(end.cidade) + '</a>' + (end.ref ? '<br>Ref.: ' + esc(end.ref) : '') + '</small>';
      const b = (txt, cls, st) => `<button class="ab ${cls}" ${p.status === st ? 'disabled' : ''} onclick="setStatus('${id}','${st}')">${txt}</button>`;
      return `<tr><td data-l="Cliente"><b>${esc(p.cliente.nome)}</b><br><small style="color:var(--mut)">Pedido nº ${nPed(id)}</small>${entHtml}</td><td class="wa" data-l="WhatsApp">${esc(p.cliente.tel)}</td><td data-l="Itens"><small>${p.itens.map(i => esc(i.nome) + ' ' + esc(i.tam) + '×' + i.q).join('<br>')}</small></td>
      <td data-l="Data">${p.criadoEm ? p.criadoEm.toDate().toLocaleString('pt-BR') : ''}</td><td data-l="Pagamento">${esc(p.pagamento)}</td><td data-l="Valor">${R$(p.total)}${p.frete ? '<br><small style="color:var(--mut)">frete ' + R$(p.frete) + '</small>' : ''}</td>
      <td data-l="Status"><span class="st s${sc}">${esc(p.status)}</span></td>
      <td class="acoes">${b('Confirmar', 'b', 'Confirmado')}${b('Em separação', 'p', 'Em separação')}${b('Saiu p/ entrega', 'c', 'Saiu para entrega')}${b('Entregue', 'g', 'Entregue')}${b('Cancelar', 'r', 'Cancelado')}
      <button class="ab g" onclick="zap('${id}')">WhatsApp</button><button class="ab b" onclick="enviarPix('${id}')">Enviar Pix</button><button class="ab r" onclick="excluirPedido('${id}')">Excluir</button></td></tr>`; }).join('');
  });
  db.collection('produtos').onSnapshot(s => {
    PROD = {}; s.docs.forEach(d => PROD[d.id] = d.data());
    $('lista').innerHTML = s.docs.map(d => { const p = d.data(); return `<div class="card"><div class="im" style="background-image:url('${esc(p.img)}')"></div><div class="in"><h3>${esc(p.nome)}</h3><div class="pr">${precoHtml(p)} · ${esc(p.categoria)}</div>
    <div class="szs" id="e${d.id}">${(p.tamanhos || ['Único']).map(t => `<div class="sz"><b>${esc(t)}</b><input type="number" min="0" inputmode="numeric" data-t="${esc(t)}" value="${p.estoque ? (p.estoque[t] ?? 0) : ''}" placeholder="∞"></div>`).join('')}</div>
    <small id="rs${d.id}" style="display:block;color:var(--mut);margin-bottom:8px"></small>
    <div style="display:flex;gap:6px;margin-bottom:8px"><button class="ab g" style="flex:1" onclick="salvarEstoque('${d.id}')">Salvar estoque</button><button class="ab r" onclick="esgotar('${d.id}')">Esgotar</button></div>
    <button class="btn o" style="width:100%;margin-bottom:6px" onclick="editarProd('${d.id}')">Editar produto</button>
    <button class="btn o" style="width:100%;margin-bottom:6px" onclick="trocarFotoProd('${d.id}')">Trocar foto</button>
    <button class="btn o" style="width:100%;margin-bottom:6px" onclick="db.collection('produtos').doc('${d.id}').update({ativo:${!p.ativo}})">${p.ativo ? 'Ocultar' : 'Mostrar'}</button>
    <button class="btn o" style="width:100%" onclick="if(confirm('Excluir?'))db.collection('produtos').doc('${d.id}').delete()">Excluir</button></div></div>`; }).join(''); pintarReservas();
  });
  db.collection('reservas').onSnapshot(s => { RES = {}; s.docs.forEach(d => RES[d.id] = d.data().n || 0); pintarReservas(); }, () => {});
}
function salvar() {
  if (!pn.value || !pp.value) return alert('Informe nome e preço');
  if (!fotoData && !confirm('Cadastrar sem foto?')) return;
  const estoque = lerEstoque($('szs'), false); if (!Object.keys(estoque).length) return alert('Informe a quantidade em estoque de pelo menos um tamanho.');
  const promo = +$('pm').value || 0; if (promo && promo >= +pp.value) return alert('O preço promocional precisa ser menor que o preço normal.');
  db.collection('produtos').add({ nome: pn.value, preco: +pp.value, ...(promo ? { promo } : {}), categoria: pc.value, img: fotoData, tamanhos: TAMS.filter(t => t in estoque), estoque, ativo: true })
    .then(() => { pn.value = pp.value = pf.value = $('pm').value = ''; fotoData = ''; $('prev').style.display = 'none'; document.querySelectorAll('#szs input').forEach(x => x.value = ''); });
}

// ── Notificação push: registra este aparelho para receber aviso de pedido novo ──
async function ativarPush() {
  try {
    if (!LOJA.vapidKey) return alert('Preencha vapidKey no config.js (veja o passo a passo).');
    if (await Notification.requestPermission() !== 'granted') return alert('Permita as notificações no navegador/celular.');
    const reg = await navigator.serviceWorker.ready;
    const token = await firebase.messaging().getToken({ vapidKey: LOJA.vapidKey, serviceWorkerRegistration: reg });
    await db.collection('admTokens').doc(token).set({ em: firebase.firestore.FieldValue.serverTimestamp(), aparelho: navigator.userAgent.slice(0, 80) });
    ouvirPush(); beep(); $('bPush').textContent = '🔔 Avisos ativos'; alert('Pronto! Este aparelho vai receber aviso de cada pedido novo.');
  } catch (e) { alert('Não foi possível ativar: ' + e.message); }
}
if (window.Notification && Notification.permission === 'granted') window.addEventListener('load', () => { const b = $('bPush'); if (b) b.textContent = '🔔 Avisos ativos'; });

const entrarAdmin = () => auth.signInWithEmailAndPassword(LOJA.adminEmail, $('s').value).catch(() => alert('Senha incorreta.'));

// ── Foto do produto: máxima qualidade (até 1200 px, JPEG alto) guardada junto do produto, sem Storage ──
let fotoData = '';
function processarFoto(f, cb) {
  const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => {
    const k = Math.min(1, 1200 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    const x = c.getContext('2d'); x.imageSmoothingQuality = 'high'; x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height); x.drawImage(img, 0, 0, c.width, c.height);
    let q = 0.92, d = c.toDataURL('image/jpeg', q);
    while (d.length > 900000 && q > 0.5) { q -= 0.07; d = c.toDataURL('image/jpeg', q); }   // limite de ~1 MB por documento do Firestore
    URL.revokeObjectURL(url); cb(d);
  };
  img.onerror = () => alert('Não foi possível ler esta imagem.');
  img.src = url;
}
function lerFoto(inp) {
  const f = inp.files[0]; if (!f) return;
  processarFoto(f, d => { fotoData = d; const p = $('prev'); p.src = d; p.style.display = 'block'; });
}
function trocarFotoProd(id) {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
  inp.onchange = () => { const f = inp.files[0]; if (f) processarFoto(f, d => db.collection('produtos').doc(id).update({ img: d }).then(() => avisoAdm('Foto trocada'), e => alert('Erro ao salvar: ' + e.message))); };
  inp.click();
}

// ── Ações do pedido e WhatsApp para o cliente ──
// ── Status do pedido + estoque ──
// O estoque é RESERVADO quando o cliente faz o pedido (a peça some da vitrine na hora).
// Ao confirmar: sai de verdade do estoque. Ao cancelar: a reserva (ou a baixa) é desfeita. Tudo em transação.
const CONF = ['Confirmado', 'Em separação', 'Saiu para entrega', 'Entregue'];
const estadoEst = p => p.estoqueEstado !== undefined ? p.estoqueEstado : (p.estoqueBaixado === true ? 'baixado' : p.estoqueBaixado === false ? 'liberado' : undefined);   // undefined = pedido antigo, sem controle de estoque
let RES = {};   // reservas: "produto_tamanho" -> quantidade reservada
async function mudarStatus(id, st) {
  const ref = db.collection('pedidos').doc(id);
  await db.runTransaction(async t => {
    const ps = await t.get(ref); if (!ps.exists) throw new Error('Pedido não encontrado.');
    const p = ps.data(), upd = { status: st }, est = estadoEst(p);
    if (est !== undefined) {
      const quer = CONF.includes(st), cancela = st === 'Cancelado';
      let novo = est, dEst = 0, dRes = 0;   // dEst: mexe no estoque físico; dRes: mexe na reserva (sinal = por unidade do pedido)
      if (quer && est === 'reservado') { dEst = -1; dRes = -1; novo = 'baixado'; }
      else if (quer && est === 'liberado') { dEst = -1; novo = 'baixado'; }
      else if (cancela && est === 'reservado') { dRes = -1; novo = 'liberado'; }
      else if (cancela && est === 'baixado') { dEst = 1; novo = 'liberado'; }
      if (novo !== est) {
        const itens = p.itens || [], ids = [...new Set(itens.map(i => i.id))];
        const snaps = await Promise.all(ids.map(x => t.get(db.collection('produtos').doc(x))));
        const rsn = await Promise.all(itens.map(i => t.get(db.collection('reservas').doc(i.id + '_' + i.tam))));
        const mapas = {}, escritas = [];
        for (const sp of snaps) if (sp.exists && sp.data().estoque) mapas[sp.id] = { ...sp.data().estoque };   // produto apagado ou com estoque ilimitado: ignora
        itens.forEach((i, k) => {
          const m = mapas[i.id]; if (!m) return;
          const reservado = rsn[k].exists ? (rsn[k].data().n || 0) : 0, tem = m[i.tam] ?? 0;
          if (dEst < 0) {   // saindo do estoque: precisa ter a peça (descontando a reserva de OUTROS pedidos)
            const livre = tem - (est === 'reservado' ? 0 : reservado);
            if (livre < i.q) throw new Error('Estoque insuficiente: "' + i.nome + ' ' + i.tam + '" (disponível ' + Math.max(0, livre) + ', o pedido pede ' + i.q + '). O status não foi alterado.');
          }
          m[i.tam] = tem + dEst * i.q;
          if (dRes) escritas.push([rsn[k].ref, Math.max(0, reservado + dRes * i.q)]);
        });
        for (const sp of snaps) if (mapas[sp.id]) t.update(sp.ref, { estoque: mapas[sp.id] });
        escritas.forEach(([r, n]) => t.set(r, { n }));
        upd.estoqueEstado = novo;
      }
    }
    t.update(ref, upd);
  });
}
function pintarReservas() {   // mostra, em cada produto, quanto está reservado por pedidos ainda não confirmados
  Object.keys(PROD).forEach(id => {
    const el = $('rs' + id); if (!el) return;
    const l = (PROD[id].tamanhos || ['Único']).filter(t => RES[id + '_' + t] > 0).map(t => t + ': ' + RES[id + '_' + t]);
    el.textContent = l.length ? 'Reservado em pedidos a confirmar → ' + l.join(' · ') : '';
  });
}
// Antes de confirmar, confere se o pedido é coerente (a loja não tem servidor: esta é a trava contra pedido adulterado)
function conferirPedido(id, st) {
  const p = PED[id], e = estadoEst(p); if (!CONF.includes(st) || (e !== 'reservado' && e !== 'liberado')) return true;   // já conferido antes, ou pedido antigo
  const itens = p.itens || [], c = x => Math.round((x || 0) * 100);
  if (itens.reduce((a, i) => a + c(i.preco) * i.q, 0) + c(p.frete) !== c(p.total)) { alert('⚠ O total deste pedido (' + R$(p.total) + ') não bate com a soma dos itens + frete. Não confirme; confira com o cliente.'); return false; }
  const av = [];
  itens.forEach(i => { const pr = PROD[i.id]; if (pr) { const atual = emPromo(pr) ? pr.promo : pr.preco; if (Math.abs(atual - i.preco) > 0.004) av.push(i.nome + ': pedido a ' + R$(i.preco) + ', preço atual ' + R$(atual)); } });
  if (p.entrega && p.entrega.tipo === 'Entrega') {
    const sub = itens.reduce((a, i) => a + i.preco * i.q, 0), bairro = (p.entrega.endereco || {}).bairro, t = taxaBairroAdm(bairro);
    if (t === null) av.push('Bairro "' + bairro + '" não está na sua lista de entrega');
    else { const esp = (CFG.freteGratis > 0 && sub >= CFG.freteGratis) ? 0 : t; if (Math.abs((p.frete || 0) - esp) > 0.004) av.push('Frete (' + bairro + '): pedido com ' + R$(p.frete || 0) + ', esperado ' + R$(esp)); }
  }
  return av.length ? confirm('⚠ Este pedido tem diferenças em relação ao painel:\n\n- ' + av.join('\n- ') + '\n\n(Pode ser só uma mudança de preço feita depois do pedido.) Confirmar mesmo assim?') : true;
}
let cmPend = null;
async function setStatus(id, st) {
  if (!conferirPedido(id, st)) return;
  try { await mudarStatus(id, st); } catch (e) { return alert(e.message); }
  const p = PED[id]; if (!MSG_ST.includes(st) || !(p.cliente.tel || '').replace(/\D/g, '')) return;
  cmPend = { id, st }; $('cmP').textContent = 'Status salvo: "' + st + '" (pedido de ' + p.cliente.nome + '). Abrir o WhatsApp com a mensagem pronta?'; $('cm').classList.add('on');
}
function cmNao() { $('cm').classList.remove('on'); }
function cmSim() { $('cm').classList.remove('on'); zap(cmPend.id, cmPend.st); }
async function excluirPedido(id) {
  const p = PED[id]; if (!confirm('Excluir este pedido?')) return;
  try {
    const e = estadoEst(p);   // reservado: libera a reserva; já baixado: pergunta se devolve
    if (e === 'reservado' || (e === 'baixado' && confirm('As peças deste pedido já saíram do estoque. Devolver ao estoque?\n\nOK = devolver  ·  Cancelar = não devolver'))) await mudarStatus(id, 'Cancelado');
    await db.collection('pedidos').doc(id).delete();
  } catch (e) { alert('Erro: ' + e.message); }
}
const nPed = id => { const n = (PED[id] || {}).numero; return n ? String(n).padStart(2, '0') : id.slice(0, 6).toUpperCase(); };   // pedidos antigos, sem número sequencial, mostram o código antigo
const txtEnd = e => e.rua + ', ' + e.numero + (e.complemento ? ' (' + e.complemento + ')' : '') + ' - ' + e.bairro + ', ' + e.cidade + (e.cep ? ' · CEP ' + e.cep : '');
function detalhesPedido(p) {
  const ent = p.entrega, entTxt = !ent ? '' : ent.tipo === 'Retirada' ? '\n\n*Retirada na loja*' + ((CFG.retirada || {}).endereco ? '\n' + CFG.retirada.endereco + (CFG.retirada.horario ? '\nHorário: ' + CFG.retirada.horario : '') : '') : '\n\n*Entrega*\n' + txtEnd(ent.endereco) + (p.frete ? '\n*Frete:* ' + R$(p.frete) : '');
  return '*Resumo do pedido*\n' + p.itens.map(i => i.q + '× ' + i.nome + ' (' + i.tam + ') — ' + R$(i.preco * i.q)).join('\n') + entTxt + '\n\n*Pagamento:* ' + p.pagamento + '\n';
}
function zap(id, stNovo) {
  const p = PED[id], tel = (p.cliente.tel || '').replace(/\D/g, ''); if (!tel) return alert('Pedido sem telefone.');
  const st = stNovo || p.status;
  let t = msgDe(st) || MSG_PAD['Novo'];
  // Só na confirmação vão os detalhes do pedido (se a mensagem salva não tiver {detalhes}, eles entram no final)
  if (st === 'Confirmado') t = t.includes('{detalhes}') ? t : t + '\n\n{detalhes}';
  else t = t.replace(/\{detalhes\}/g, '');
  t = t.replace(/\{detalhes\}/g, detalhesPedido(p)).replace(/\{nome\}/g, (p.cliente.nome || '').split(' ')[0]).replace(/\{total\}/g, R$(p.total)).replace(/\{pedido\}/g, nPed(id)).trim() + ASSINATURA;
  window.open('https://wa.me/55' + tel + '?text=' + encodeURIComponent(t), '_blank');
}

// ── Ajustes da loja: WhatsApp, logo do site e mensagens ──
const mid = k => 'm-' + k.replace(/\W/g, '_');
function preencherAjustes() {
  const px = CFG.pix || {};
  $('pxt').value = px.tipo || 'cpf'; $('pxk').value = px.chave || ''; $('pxn').value = px.nome || ''; $('pxc').value = px.cidade || '';
  $('aw').value = (CFG.whatsapp || '').replace(/^55/, ''); $('ar').value = CFG.reiniciar || 'nunca'; $('afr').value = CFG.frete || ''; $('afg').value = CFG.freteGratis || '';
  $('arl').value = (CFG.retirada || {}).endereco || ''; $('arh').value = (CFG.retirada || {}).horario || ''; $('abn').value = CFG.bairroOutros || 'padrao';
  if (CFG.logo) { $('alogo').src = CFG.logo; $('alogo').style.display = 'block'; }
  $('amsgs').innerHTML = MSG_ST.map(k => `<label>${k}</label><textarea id="${mid(k)}" rows="2">${esc(msgDe(k))}</textarea>`).join('');
}
function lerLogo(inp) {
  const f = inp.files[0]; if (!f) return; const img = new Image(), url = URL.createObjectURL(f);
  img.onload = () => { const k = Math.min(1, 480 / Math.max(img.width, img.height)), c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    logoNova = c.toDataURL('image/png'); URL.revokeObjectURL(url); $('alogo').src = logoNova; $('alogo').style.display = 'block'; };
  img.onerror = () => alert('Não foi possível ler esta imagem.'); img.src = url;
}
function tirarLogo() { logoNova = ''; $('alogo').style.display = 'none'; $('af').value = ''; }
const normN = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
let BL = [];   // lista exibida (ordenada); os botões usam a posição nela
function renderBairros() {
  BL = (CFG.bairros || []).slice().sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  $('bl').innerHTML = BL.length
    ? BL.map((b, i) => `<div style="display:flex;gap:8px;align-items:center;margin-bottom:8px"><span style="flex:1">${esc(b.nome)}</span><span style="color:var(--mut)">R$</span><input type="number" step="0.01" min="0" inputmode="decimal" value="${b.taxa}" style="width:92px;margin:0" onchange="mudarTaxaBairro(${i}, this.value)"><button class="ab r" onclick="tirarBairro(${i})">Remover</button></div>`).join('')
    : '<p style="color:var(--mut);font-size:12px">Nenhum bairro cadastrado: vale a taxa padrão para todos.</p>';
}
async function gravarBairros(lista) {
  try { await db.collection('config').doc('loja').set({ bairros: lista, taxas: [...new Set(lista.map(b => b.taxa))] }, { merge: true }); return true; }
  catch (e) { alert('Erro ao salvar: ' + e.message); return false; }
}
async function addBairro() {
  const nome = $('bn').value.trim().slice(0, 60), taxa = parseFloat(String($('bv').value).replace(',', '.'));
  if (!nome) return alert('Digite o nome do bairro.');
  if (!(taxa >= 0)) return alert('Digite o valor da taxa (0 = entrega grátis).');
  const L = (CFG.bairros || []).slice(), i = L.findIndex(b => normN(b.nome) === normN(nome)), novo = { nome, taxa: Math.round(taxa * 100) / 100 };
  if (i >= 0) L[i] = novo; else { if (L.length >= 200) return alert('Limite de 200 bairros.'); L.push(novo); }
  if (await gravarBairros(L)) { $('bn').value = ''; $('bv').value = ''; $('bn').focus(); avisoAdm(i >= 0 ? 'Taxa atualizada' : 'Bairro adicionado'); }
}
async function mudarTaxaBairro(i, v) {
  const taxa = parseFloat(String(v).replace(',', '.')); if (!(taxa >= 0)) { renderBairros(); return alert('Valor inválido.'); }
  const L = BL.map(b => ({ ...b })); L[i].taxa = Math.round(taxa * 100) / 100;
  if (await gravarBairros(L)) avisoAdm('Taxa atualizada');
}
async function tirarBairro(i) {
  if (!confirm('Remover "' + BL[i].nome + '" da lista de entrega?')) return;
  if (await gravarBairros(BL.filter((_, k) => k !== i))) avisoAdm('Bairro removido');
}
function taxaBairroAdm(bairro) {   // null = bairro fora da lista e a loja não entrega fora dela
  const L = CFG.bairros || []; if (!L.length) return +CFG.frete || 0;
  const m = L.find(b => normN(b.nome) === normN(bairro)); if (m) return +m.taxa || 0;
  return CFG.bairroOutros === 'bloquear' ? null : (+CFG.frete || 0);
}
async function salvarRetirada() {   // salva na hora, sem precisar do botão "Salvar ajustes"
  try { await db.collection('config').doc('loja').set({ retirada: { endereco: $('arl').value.trim().slice(0, 200), horario: $('arh').value.trim().slice(0, 100) } }, { merge: true }); avisoAdm('Local de retirada salvo'); }
  catch (e) { alert('Erro ao salvar: ' + e.message); }
}
async function salvarAjustes() {
  let w = $('aw').value.replace(/\D/g, ''); if (w && w.length <= 11) w = '55' + w;
  if (w && !/^55\d{10,11}$/.test(w)) return alert('WhatsApp inválido: use DDD + número.');
  const msgs = {}; MSG_ST.forEach(k => msgs[k] = $(mid(k)).value.trim() || MSG_PAD[k]);
  const frete = Math.max(0, +$('afr').value || 0), freteGratis = Math.max(0, +$('afg').value || 0);
  const dados = { whatsapp: w, msgs, reiniciar: $('ar').value, frete, freteGratis, bairroOutros: $('abn').value, retirada: { endereco: $('arl').value.trim(), horario: $('arh').value.trim() } };
  if (logoNova !== undefined) dados.logo = logoNova || firebase.firestore.FieldValue.delete();
  try { await db.collection('config').doc('loja').set(dados, { merge: true }); logoNova = undefined; alert('Ajustes salvos!'); } catch (e) { alert('Erro ao salvar: ' + e.message); }
}

// ── Pix ──
async function salvarPix() {
  const tipo = $('pxt').value; let chave = $('pxk').value.trim();
  const nome = $('pxn').value.trim(), cidade = $('pxc').value.trim();
  if (!chave || !nome || !cidade) return alert('Preencha a chave, o nome do recebedor e a cidade.');
  if (tipo === 'cpf') chave = chave.replace(/\D/g, '');
  if (tipo === 'tel') { chave = chave.replace(/\D/g, ''); if (chave.length <= 11) chave = '55' + chave; chave = '+' + chave; }
  if (tipo === 'email') chave = chave.toLowerCase();
  if (tipo === 'cpf' && ![11, 14].includes(chave.length)) return alert('CPF deve ter 11 dígitos ou CNPJ 14.');
  try { await db.collection('config').doc('loja').set({ pix: { tipo, chave, nome, cidade } }, { merge: true }); $('pxk').value = chave; alert('Pix salvo!'); }
  catch (e) { alert('Erro ao salvar: ' + e.message); }
}
function enviarPix(id) {
  const px = CFG.pix; if (!px || !px.chave) return alert('Cadastre sua chave Pix no painel PIX primeiro.');
  const p = PED[id], tel = (p.cliente.tel || '').replace(/\D/g, ''); if (!tel) return alert('Pedido sem telefone.');
  const code = gerarPix(px.chave, px.nome, px.cidade, p.total, id);
  const t = 'Olá, ' + (p.cliente.nome || '').split(' ')[0] + '! Segue o Pix referente ao seu pedido nº ' + nPed(id) + ' na VSC STORE.\n\n*Valor:* ' + R$(p.total) + '\n*Favorecido:* ' + px.nome + '\n\nPara pagar, copie o código abaixo e use a opção "Pix Copia e Cola" no aplicativo do seu banco:' + ASSINATURA + '\n\n' + code;
  window.open('https://wa.me/55' + tel + '?text=' + encodeURIComponent(t), '_blank');
}

// ── Tamanhos e estoque ──
const TAMS = ['P', 'M', 'G', 'GG', 'XG', 'Único', '36', '38', '40', '42', '44'];
$('szs').innerHTML = TAMS.map(t => `<div class="sz"><b>${t}</b><input type="number" min="0" inputmode="numeric" data-t="${t}" placeholder="—"></div>`).join('');
function lerEstoque(c, vazioZero) {
  const e = {}; c.querySelectorAll('input[data-t]').forEach(i => { if (i.value !== '') e[i.dataset.t] = Math.max(0, parseInt(i.value) || 0); else if (vazioZero) e[i.dataset.t] = 0; }); return e;
}
function avisoAdm(m) { const t = $('toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 2500); }
const salvarEstoque = id => db.collection('produtos').doc(id).update({ estoque: lerEstoque($('e' + id), true) }).then(() => avisoAdm('Estoque salvo'));
function esgotar(id) { if (!confirm('Marcar todos os tamanhos como esgotados?')) return; const e = lerEstoque($('e' + id), true); Object.keys(e).forEach(k => e[k] = 0); db.collection('produtos').doc(id).update({ estoque: e }); }

// ── Editar produto e promoção ──
const emPromo = p => p.promo > 0 && p.promo < p.preco;
const precoHtml = p => emPromo(p) ? '<s style="color:var(--mut)">' + R$(p.preco) + '</s> <b>' + R$(p.promo) + '</b>' : R$(p.preco);
let prodEd = null;
function editarProd(id) {
  const p = PROD[id]; if (!p) return; prodEd = id;
  $('epN').value = p.nome || ''; $('epP').value = p.preco ?? ''; $('epPm').value = emPromo(p) ? p.promo : ''; $('epC').value = p.categoria || '';
  $('ep').classList.add('on');
}
const fecharProd = () => { $('ep').classList.remove('on'); prodEd = null; };
async function salvarProd() {
  const nome = $('epN').value.trim(), preco = +$('epP').value, promo = +$('epPm').value || 0, categoria = $('epC').value.trim();
  if (!nome || !(preco > 0)) return alert('Informe nome e preço.');
  if (promo && promo >= preco) return alert('O preço promocional precisa ser menor que o preço normal.');
  try { await db.collection('produtos').doc(prodEd).update({ nome, preco, categoria, promo: promo || firebase.firestore.FieldValue.delete() }); fecharProd(); avisoAdm('Produto atualizado'); }
  catch (e) { alert('Erro ao salvar: ' + e.message); }
}

// ── Relatórios ──
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const REC = ['Confirmado', 'Em separação', 'Saiu para entrega', 'Entregue'];   // status que contam como venda
let POR = {};
const mkey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
const mnome = k => { const [y, m] = k.split('-'); return MESES[m - 1] + ' de ' + y; };
const mesAnt = k => { const [y, m] = k.split('-').map(Number); return mkey(new Date(y, m - 2, 1)); };
const ult12 = () => { const h = new Date(), r = []; for (let i = 0; i < 12; i++) r.push(mkey(new Date(h.getFullYear(), h.getMonth() - i, 1))); return r; };   // do mês atual para trás

function aba(t) {
  $('tP').style.display = t === 'P' ? 'block' : 'none'; $('tR').style.display = t === 'R' ? 'block' : 'none'; $('tC').style.display = t === 'C' ? 'block' : 'none';
  $('tbP').classList.toggle('on', t === 'P'); $('tbR').classList.toggle('on', t === 'R'); $('tbC').classList.toggle('on', t === 'C');
  if (t === 'R') relCarregar();
  if (t === 'C') clCarregar();
}
async function relCarregar() {
  const h = new Date(), ini = new Date(h.getFullYear(), h.getMonth() - 12, 1);   // 13 meses: dá para comparar o mês mais antigo com o anterior
  try {
    const s = await db.collection('pedidos').where('criadoEm', '>=', ini).get();
    POR = {}; s.docs.forEach(d => { const p = d.data(); if (!p.criadoEm) return; const k = mkey(p.criadoEm.toDate()); (POR[k] = POR[k] || []).push(p); });
  } catch (e) { return alert('Erro ao carregar relatórios: ' + e.message); }
  const atual = $('rm').value;
  $('rm').innerHTML = ult12().map(k => `<option value="${k}">${mnome(k)}</option>`).join('');
  $('rm').value = atual && ult12().includes(atual) ? atual : mkey(h);
  relRender();
}
function relMes(d) { const h = new Date(); $('rm').value = mkey(new Date(h.getFullYear(), h.getMonth() + d, 1)); relRender(); }
function relSel(k) { $('rm').value = k; relRender(); window.scrollTo({ top: $('rOut').offsetTop - 80, behavior: 'smooth' }); }
function relAgg(lista) {
  const r = { receita: 0, pedidos: 0, itens: 0, cancel: 0, pend: 0, pag: {}, prod: {} };
  lista.forEach(p => {
    if (p.status === 'Cancelado') { r.cancel++; return; }
    if (!REC.includes(p.status)) { r.pend++; return; }
    const t = p.total || 0, f = p.pagamento || 'Outro';
    r.receita += t; r.pedidos++;
    r.pag[f] = r.pag[f] || { v: 0, n: 0 }; r.pag[f].v += t; r.pag[f].n++;
    (p.itens || []).forEach(i => { r.itens += i.q; r.prod[i.nome] = r.prod[i.nome] || { v: 0, q: 0 }; r.prod[i.nome].v += i.preco * i.q; r.prod[i.nome].q += i.q; });
  });
  return r;
}
const barra = (rot, sub, v, max, extra, cls, key) => `<div class="rb${key ? ' clk' : ''} ${cls || ''}"${key ? ` onclick="relSel('${key}')"` : ''}><div class="rt"><b>${rot}</b><span>${R$(v)}${extra || ''}</span></div><div class="rbar"><i style="width:${max > 0 ? Math.max(2, v / max * 100) : 0}%"></i></div><small>${sub}</small></div>`;
function relRender() {
  const k = $('rm').value; if (!k) return;
  const mes = relAgg(POR[k] || []), ant = relAgg(POR[mesAnt(k)] || []), K12 = ult12();
  const tudo = relAgg(K12.flatMap(m => POR[m] || []));
  const varp = ant.receita > 0 ? Math.round((mes.receita - ant.receita) / ant.receita * 100) : null;
  const fin = mes.pedidos + mes.cancel, tick = mes.pedidos ? mes.receita / mes.pedidos : 0;
  const kpi = (t, v, s) => `<div class="rc"><small>${t}</small><b>${v}</b><i>${s}</i></div>`;
  const ord = o => Object.entries(o).sort((a, b) => b[1].v - a[1].v);
  const pagBars = (agg, destaque) => {
    const l = ord(agg.pag), max = l.length ? l[0][1].v : 0, tot = agg.receita || 1;
    return l.map(([n, x], i) => barra(esc(n) + (destaque && i === 0 ? '<em class="tg">mais lucrativa</em>' : ''), x.n + ' pedido(s) · ticket ' + R$(x.v / x.n), x.v, max, ' · ' + Math.round(x.v / tot * 100) + '%')).join('') || '<p class="rd">Sem vendas no período.</p>';
  };
  const prods = ord(mes.prod).slice(0, 8), pmax = prods.length ? prods[0][1].v : 0;
  const vals = K12.map(m => relAgg(POR[m] || [])), mx = Math.max(...vals.map(v => v.receita));
  $('rOut').innerHTML =
    `<h3 class="pt" style="margin-bottom:10px">${mnome(k).toUpperCase()}</h3><div class="rk">`
    + kpi('Receita total', R$(mes.receita), varp === null ? 'sem mês anterior para comparar' : (varp >= 0 ? '▲ ' : '▼ ') + Math.abs(varp) + '% vs mês anterior')
    + kpi('Pedidos', mes.pedidos, 'confirmados') + kpi('Peças vendidas', mes.itens, 'unidades') + kpi('Ticket médio', R$(tick), 'por pedido')
    + kpi('Cancelados', mes.cancel, fin ? Math.round(mes.cancel / fin * 100) + '% dos finalizados' : 'nenhum no mês') + kpi('Aguardando', mes.pend, 'ainda não confirmados') + `</div>`
    + `<div class="rp"><h3>POR FORMA DE PAGAMENTO · ${mnome(k).toUpperCase()}</h3>${pagBars(mes)}</div>`
    + `<div class="rp"><h3>FORMA DE PAGAMENTO · ÚLTIMOS 12 MESES</h3><p class="rd">Total de ${R$(tudo.receita)} em ${tudo.pedidos} pedido(s). Veja qual forma de pagamento mais rendeu.</p>${pagBars(tudo, true)}</div>`
    + `<div class="rp"><h3>POR PRODUTO · ${mnome(k).toUpperCase()}</h3>${prods.map(([n, x]) => barra(esc(n), x.q + ' unidade(s)', x.v, pmax)).join('') || '<p class="rd">Sem vendas no período.</p>'}</div>`
    + `<div class="rp"><h3>ÚLTIMOS 12 MESES</h3><p class="rd">Toque em um mês para ver o detalhe dele.</p>${K12.map((m, i) => barra(mnome(m), vals[i].pedidos + ' pedido(s)', vals[i].receita, mx, '', m === k ? 'sel' : '', m)).join('')}</div>`;
}
function relCsv() {
  const k = $('rm').value, l = (POR[k] || []).slice().sort((a, b) => a.criadoEm.seconds - b.criadoEm.seconds);
  if (!l.length) return alert('Não há pedidos neste mês.');
  const c = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const linhas = [['Nº', 'Data', 'Cliente', 'Telefone', 'Itens', 'Entrega', 'Frete', 'Pagamento', 'Status', 'Total']].concat(l.map(p => [p.numero || '', p.criadoEm.toDate().toLocaleString('pt-BR'), p.cliente.nome, p.cliente.tel, (p.itens || []).map(i => i.nome + ' ' + i.tam + ' x' + i.q).join(' | '), p.entrega ? (p.entrega.tipo === 'Retirada' ? 'Retirada' : txtEnd(p.entrega.endereco)) : '', (p.frete || 0).toFixed(2).replace('.', ','), p.pagamento, p.status, (p.total || 0).toFixed(2).replace('.', ',')]));
  const blob = new Blob(['\ufeff' + linhas.map(r => r.map(c).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'pedidos-' + k + '.csv'; document.body.appendChild(a); a.click(); a.remove();
}

// ── Clientes e visitantes ──
let clL = [];
const clTs = x => x && x.toDate ? x.toDate() : null;
const clFd = d => d ? d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const clAp = u => /iPhone|iPad/.test(u) ? 'iPhone' : /Android/.test(u) ? 'Android' : /Windows/.test(u) ? 'Windows' : /Mac/.test(u) ? 'Mac' : '';
async function clCarregar() {
  try {
    const [cs, vs, ps] = await Promise.all([db.collection('clientes').get(), db.collection('visitas').get(), db.collection('pedidos').limit(3000).get()]);
    const M = {}, g = id => M[id] = M[id] || { id, nome: '', tel: '', bairro: '', n: 0, ped: 0, gasto: 0, ultVis: null, ultPed: null, ap: '' };
    vs.docs.forEach(d => { const x = d.data(), c = g(d.id); c.n = x.n || 0; c.ultVis = clTs(x.ultima); c.ap = clAp(x.aparelho || ''); if (x.nome) c.nome = x.nome; });
    cs.docs.forEach(d => { const x = d.data(), c = g(d.id); c.nome = ((x.nome || '') + ' ' + (x.sobrenome || '')).trim() || c.nome; c.tel = x.tel || ''; c.bairro = (x.end || {}).bairro || ''; });
    ps.docs.forEach(d => {
      const p = d.data(); if (!p.uid) return; const c = g(p.uid), t = clTs(p.criadoEm);
      if (!c.nome && p.cliente) c.nome = p.cliente.nome; if (!c.tel && p.cliente) c.tel = p.cliente.tel;
      if (t && (!c.ultPed || t > c.ultPed)) c.ultPed = t;
      if (p.status !== 'Cancelado') { c.ped++; c.gasto += p.total || 0; }
    });
    clL = Object.values(M);
  } catch (e) { return alert('Erro ao carregar clientes: ' + e.message + '\n\nConfira se o firestore.rules permite o admin ler "clientes" e "visitas".'); }
  clRender();
}
function clRender() {
  const q = $('clq').value.toLowerCase().trim(), fl = $('clf').value, od = $('clo').value, agora = Date.now(), ult = c => c.ultVis || c.ultPed;
  const l = clL.filter(c => {
    if (fl === 'cad' && !c.tel) return false; if (fl === 'comp' && !c.ped) return false; if (fl === 'vis' && c.tel) return false;
    return !q || (c.nome + ' ' + c.tel + ' ' + c.bairro).toLowerCase().includes(q);
  }).sort((a, b) => od === 'gasto' ? b.gasto - a.gasto : od === 'n' ? b.n - a.n : (ult(b) || 0) - (ult(a) || 0));
  const online = clL.filter(c => c.ultVis && agora - c.ultVis < 3e5).length, hoje = clL.filter(c => c.ultVis && agora - c.ultVis < 864e5).length;
  const kpi = (t, v, s) => `<div class="rc"><small>${t}</small><b>${v}</b><i>${s}</i></div>`;
  $('clk').innerHTML = kpi('Pessoas', clL.length, 'visitantes + clientes') + kpi('Cadastradas', clL.filter(c => c.tel).length, 'com nome e WhatsApp') + kpi('Já compraram', clL.filter(c => c.ped).length, 'pedido não cancelado') + kpi('Entraram em 24h', hoje, 'visitas recentes') + kpi('Online agora', online, 'últimos 5 minutos');
  $('clb').innerHTML = l.map(c => {
    const tel = String(c.tel || '').replace(/\D/g, '');
    return `<tr><td data-l="Quem"><b>${esc(c.nome || 'Visitante')}</b><br><small style="color:var(--mut)">${esc(c.bairro)}${c.bairro && c.ap ? ' · ' : ''}${esc(c.ap)}${!c.nome ? ' · ' + esc(c.id.slice(0, 6)) : ''}</small></td>
    <td data-l="WhatsApp">${tel ? `<a href="https://wa.me/55${tel}" target="_blank" rel="noopener" style="color:inherit">${esc(c.tel)}</a>` : '—'}</td>
    <td data-l="Visitas">${c.n || '—'}</td><td data-l="Última visita">${clFd(ult(c))}</td><td data-l="Pedidos">${c.ped || '—'}</td><td data-l="Total gasto">${c.gasto ? R$(c.gasto) : '—'}</td><td class="acoes"><button class="ab r" onclick="clApagar('${esc(c.id)}')">Apagar</button></td></tr>`;
  }).join('') || '<tr><td colspan="7" style="color:var(--mut)">Nenhum resultado.</td></tr>';
}
// Apaga o cadastro (clientes) e o registro de visitas. Os PEDIDOS ficam, para não bagunçar relatórios e estoque.
async function clApagar(id) {
  const c = clL.find(x => x.id === id); if (!c) return;
  if (!confirm('Apagar "' + (c.nome || 'Visitante') + '"?\n\nSerão removidos o cadastro e o histórico de visitas. Os pedidos dessa pessoa continuam salvos.')) return;
  try {
    const b = db.batch(); b.delete(db.collection('clientes').doc(id)); b.delete(db.collection('visitas').doc(id)); await b.commit();
    clL = clL.filter(x => x.id !== id); clRender(); avisoAdm('Cliente apagado');
  } catch (e) { alert('Erro ao apagar: ' + e.message); }
}
async function clApagarTodos() {
  if (!clL.length) return alert('Não há clientes para apagar.');
  if (!confirm('Apagar TODOS os ' + clL.length + ' clientes e visitantes?\n\nSerão removidos cadastros e histórico de visitas. Os pedidos continuam salvos. Isso não tem volta.')) return;
  if ((prompt('Para confirmar, digite APAGAR') || '').trim().toUpperCase() !== 'APAGAR') return alert('Cancelado: nada foi apagado.');
  try {
    const ids = clL.map(x => x.id);
    for (let i = 0; i < ids.length; i += 200) {   // lotes de 200 (2 apagamentos por pessoa, limite de 500 por lote)
      const b = db.batch(); ids.slice(i, i + 200).forEach(id => { b.delete(db.collection('clientes').doc(id)); b.delete(db.collection('visitas').doc(id)); }); await b.commit();
    }
    clL = []; clRender(); avisoAdm('Todos os clientes foram apagados');
  } catch (e) { alert('Erro ao apagar: ' + e.message); }
}
function clCsv() {
  const c = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  const rows = [['Nome', 'WhatsApp', 'Bairro', 'Visitas', 'Última visita', 'Pedidos', 'Total gasto']].concat(clL.map(x => [x.nome || 'Visitante', x.tel, x.bairro, x.n, clFd(x.ultVis || x.ultPed), x.ped, x.gasto.toFixed(2).replace('.', ',')]));
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['\ufeff' + rows.map(r => r.map(c).join(';')).join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  a.download = 'clientes.csv'; document.body.appendChild(a); a.click(); a.remove();
}

// ── Diagnóstico dos avisos: mostra em qual etapa o push quebra ──
async function testarAvisos() {
  const L = [], ok = (b, t) => L.push((b ? '✅ ' : '❌ ') + t);
  const seguro = location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  ok(seguro, 'Endereço seguro (' + location.protocol + '//' + location.host + ')' + (seguro ? '' : ' → abra por https:// ou localhost, nunca por file://'));
  ok('serviceWorker' in navigator, 'Navegador tem service worker');
  ok(!!window.Notification, 'Navegador tem notificações');
  let regs = []; try { regs = await navigator.serviceWorker.getRegistrations(); } catch (e) {}
  const sw = regs.find(r => r.active); ok(!!sw, 'Service worker ativo' + (sw ? '' : ' → recarregue com Ctrl+Shift+R'));
  let sup = false; try { sup = await firebase.messaging.isSupported(); } catch (e) {} ok(sup, 'Este navegador suporta push (FCM)' + (sup ? '' : ' → use Chrome/Edge fora do VS Code'));
  ok(window.Notification && Notification.permission === 'granted', 'Permissão de notificação: ' + (window.Notification ? Notification.permission : 'n/d') + (Notification.permission === 'denied' ? ' → libere no cadeado da barra de endereço' : ''));
  ok(!!LOJA.vapidKey, 'vapidKey preenchida no config.js');
  try { const n = (await db.collection('admTokens').get()).size; ok(n > 0, 'Aparelhos registrados em admTokens: ' + n + (n ? '' : ' → clique em 🔔 Ativar avisos')); }
  catch (e) { ok(false, 'Sem acesso a admTokens (' + e.code + ') → ajuste o firestore.rules'); }
  beep();
  if (window.Notification && Notification.permission === 'granted' && sw) {
    try { await sw.showNotification('🔧 Teste de aviso', { ...OPC_NOTIF, body: 'Se você viu e ouviu isto, o aparelho está pronto.', tag: 'teste' }); ok(true, 'Notificação de teste enviada (deve aparecer agora, com som)'); }
    catch (e) { ok(false, 'Falha ao mostrar notificação: ' + e.message); }
  }
  L.push('', 'Se tudo está ✅ e o pedido de teste não avisa, olhe Firebase → Functions → Logs de "novoPedido".');
  alert(L.join('\n'));
}
