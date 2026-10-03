const STIDX = { 'Novo': 0, 'Aguardando conferência': 1, 'Confirmado': 2, 'Em separação': 3, 'Saiu para entrega': 4, 'Entregue': 5, 'Cancelado': 6 };
let prods = [], cart = [], cat = 'Todos', forma = 'Pix', user = null, perfil = {}, PIX = null, FRETE = 0, FRETE_GRATIS = 0, BAIRROS = [], BAIRRO_OUTROS = 'padrao', RETIRADA = {}, REINICIAR = 'nunca', entrega = 'Entrega', endTocado = false, enviando = false;
const $ = id => document.getElementById(id);
const abrir = id => { fechar(); $(id).classList.add('on'); if (id === 'pCarrinho') renderCarrinho(); };
const fechar = () => document.querySelectorAll('.ov').forEach(o => o.classList.remove('on'));
const aviso = m => { const t = $('toast'); t.textContent = m; t.style.display = 'block'; setTimeout(() => t.style.display = 'none', 3200); };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

let RES = {};
db.collection('reservas').onSnapshot(s => { RES = {}; s.docs.forEach(d => RES[d.id] = d.data().n || 0); renderLoja(); if ($('pCarrinho').classList.contains('on')) renderCarrinho(); }, () => {});
const precoAtual = p => (p.promo > 0 && p.promo < p.preco) ? p.promo : p.preco;
const emPromo = p => precoAtual(p) < p.preco;
db.collection('produtos').where('ativo', '==', true).onSnapshot(s => { prods = s.docs.map(d => ({ id: d.id, ...d.data() })); renderLoja(); });
const logos = [...document.querySelectorAll('.brand img, .hero img')]; logos.forEach(i => i.dataset.o = i.getAttribute('src'));
db.collection('config').doc('loja').onSnapshot(s => {
  const c = s.data() || {}; if (c.whatsapp) LOJA.whatsapp = c.whatsapp; PIX = c.pix || null;
  RETIRADA = c.retirada || {}; BAIRROS = Array.isArray(c.bairros) ? c.bairros : []; BAIRRO_OUTROS = c.bairroOutros || 'padrao'; FRETE = +c.frete || 0; FRETE_GRATIS = +c.freteGratis || 0; REINICIAR = c.reiniciar || 'nunca';
  logos.forEach(i => i.src = c.logo || i.dataset.o);
  if ($('pCarrinho').classList.contains('on')) renderCarrinho();
}, () => {});
// Estoque por tamanho: p.estoque = { P: 3, M: 0 }; sem p.estoque o produto é ilimitado
const estq = (p, t) => p.estoque ? Math.max(0, (p.estoque[t] ?? 0) - (RES[p.id + '_' + t] || 0)) : Infinity;   // disponível = estoque - reservado em pedidos ainda não confirmados
const esgotado = p => (p.tamanhos || ['Único']).every(t => estq(p, t) <= 0);
const selTam = el => { el.parentNode.querySelectorAll('b').forEach(x => x.classList.remove('on')); el.classList.add('on'); };
function renderLoja() {
  const cs = ['Todos', ...new Set(prods.map(p => p.categoria).filter(Boolean))];
  $('cats').innerHTML = cs.map(c => `<button class="${c === cat ? 'on' : ''}" onclick="cat='${esc(c)}';renderLoja()">${esc(c)}</button>`).join('');
  $('grid').innerHTML = prods.filter(p => cat === 'Todos' || p.categoria === cat).map(p => {
    const ts = p.tamanhos || ['Único'], off = esgotado(p), first = ts.findIndex(t => estq(p, t) > 0);
    const tot = ts.reduce((a, t) => a + Math.max(0, estq(p, t)), 0);
    const tag = off ? '<span class="tag">Esgotado</span>' : (tot <= 3 ? '<span class="tag">Últimas unidades</span>' : (emPromo(p) ? '<span class="tag">Promoção</span>' : ''));
    return `<div class="card${off ? ' off' : ''}"><div class="im" style="background-image:url('${esc(p.img)}')">${tag}</div><div class="in"><h3>${esc(p.nome)}</h3><div class="pr">${emPromo(p) ? `<s style="color:var(--mut);font-size:.8em;font-weight:400;margin-right:6px">${R$(p.preco)}</s>${R$(precoAtual(p))}` : R$(p.preco)}</div>
    <div class="tam" id="t${p.id}">${ts.map((t, i) => `<b class="${i === first ? 'on' : ''}${estq(p, t) <= 0 ? ' x' : ''}" ${estq(p, t) > 0 ? 'onclick="selTam(this)"' : ''}>${esc(t)}</b>`).join('')}</div>
    <button class="btn" ${off ? 'disabled' : ''} onclick="add('${p.id}')">${off ? 'Indisponível' : 'Adicionar'}</button></div></div>`;
  }).join('') || '<p style="color:var(--mut)">Nenhuma peça disponível ainda.</p>';
}
function add(id) {
  const p = prods.find(x => x.id === id), el = document.querySelector(`#t${id} b.on`);
  if (!el) return aviso('Escolha um tamanho disponível');
  const tam = el.textContent, it = cart.find(c => c.id === id && c.tam === tam), q = estq(p, tam);
  if ((it ? it.q : 0) + 1 > q) return aviso(q <= 0 ? 'Tamanho esgotado' : 'Só temos ' + q + ' unidade(s) deste tamanho');
  it ? it.q++ : cart.push({ id, nome: p.nome, preco: precoAtual(p), tam, q: 1 });
  $('qtd').textContent = cart.reduce((a, c) => a + c.q, 0); aviso('Adicionado à sacola');
}

// ── Totais: subtotal + frete (o servidor confere tudo de novo ao criar o pedido) ──
const subtotal = () => cart.reduce((a, c) => a + c.preco * c.q, 0);
const norm = x => String(x || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const acharBairro = n => BAIRROS.find(b => norm(b.nome) === norm(n));
const bairroSel = () => { if (!$('eBai')) return ''; if (!BAIRROS.length) return $('eBaiO').value.trim(); const v = $('eBai').value; return v === '__outro' ? $('eBaiO').value.trim() : v; };
function taxaEntrega() {   // null = não entregamos nesse bairro
  if (!BAIRROS.length) return FRETE;   // sem tabela por bairro: taxa única
  const b = bairroSel(), m = acharBairro(b); if (m) return +m.taxa || 0;
  if (!b) return 0;   // ainda não escolheu o bairro
  return BAIRRO_OUTROS === 'bloquear' ? null : FRETE;
}
const freteVal = () => (entrega === 'Entrega' && cart.length) ? ((FRETE_GRATIS > 0 && subtotal() >= FRETE_GRATIS) ? 0 : (taxaEntrega() ?? 0)) : 0;
const total = () => Math.round((subtotal() + freteVal()) * 100) / 100;

// ── Entrega ou retirada + endereço (montado por aqui, acima da forma de pagamento) ──
function montarEntrega() {
  const fp = $('fp'); if (!fp || $('entBox')) return;
  const d = document.createElement('div'); d.id = 'entBox'; d.setAttribute('oninput', 'endTocado=true');
  d.innerHTML = `<label>Como você quer receber?</label>
  <div style="display:flex;gap:8px;margin-bottom:12px"><button class="btn" id="eBtE" style="flex:1" onclick="setEntrega('Entrega')">Entrega</button><button class="btn o" id="eBtR" style="flex:1" onclick="setEntrega('Retirada')">Retirar na loja</button></div>
  <div id="eEnd">
    <label>CEP</label><input id="eCep" inputmode="numeric" maxlength="9" placeholder="00000-000" autocomplete="postal-code" oninput="buscarCep()">
    <label>Rua</label><input id="eRua" autocomplete="address-line1">
    <div style="display:grid;grid-template-columns:96px 1fr;gap:0 10px"><div><label>Número</label><input id="eNum" inputmode="numeric"></div><div><label>Bairro</label><select id="eBai" style="width:100%;margin-bottom:12px;padding:10px" onchange="trocarBairro()"></select><input id="eBaiO" placeholder="Digite o bairro" style="display:none;margin-top:-4px"></div></div>
    <label>Cidade</label><input id="eCid" autocomplete="address-level2">
    <label>Complemento (opcional)</label><input id="eCom" placeholder="Apto, bloco...">
    <label>Ponto de referência (opcional)</label><input id="eRef">
  </div>
  <div id="eRetBox" style="display:none;margin-bottom:12px"></div>`;
  fp.parentNode.insertBefore(d, fp);
}
function setEntrega(t) {
  entrega = t;
  $('eBtE').className = 'btn' + (t === 'Entrega' ? '' : ' o'); $('eBtR').className = 'btn' + (t === 'Retirada' ? '' : ' o');
  $('eEnd').style.display = t === 'Entrega' ? 'block' : 'none';
  renderCarrinho();
}
let cepT = null;
function buscarCep() {
  const i = $('eCep'), v = i.value.replace(/\D/g, '').slice(0, 8);
  i.value = v.length > 5 ? v.slice(0, 5) + '-' + v.slice(5) : v;
  clearTimeout(cepT); if (v.length !== 8) return;
  cepT = setTimeout(async () => {
    try {
      const r = await (await fetch('https://viacep.com.br/ws/' + v + '/json/')).json(); if (r.erro) return;
      if (r.logradouro) $('eRua').value = r.logradouro; if (r.localidade) $('eCid').value = r.localidade;
      if (r.bairro) { setBairro(r.bairro); if (BAIRROS.length && !bairroSel()) aviso('Não entregamos no bairro ' + r.bairro + '. Escolha outro bairro ou retire na loja.'); renderCarrinho(); }
      $('eNum').focus();
    } catch (e) {}   // sem internet no ViaCEP: a pessoa preenche na mão
  }, 250);
}
const CAMPOS_END = [['eCep', 'cep'], ['eRua', 'rua'], ['eNum', 'numero'], ['eCid', 'cidade'], ['eCom', 'complemento'], ['eRef', 'ref']];
function preencherEnd() { if (!$('entBox') || endTocado || !perfil.end) return; CAMPOS_END.forEach(([i, k]) => $(i).value = perfil.end[k] || ''); setBairro(perfil.end.bairro); }
function limparEnd() { endTocado = false; if ($('entBox')) { CAMPOS_END.forEach(([i]) => $(i).value = ''); setBairro(''); } }
// Bairro: com tabela de taxas no painel vira uma lista (com o valor de cada um); sem tabela, é um campo de texto
let sigB = '';
function mostrarBairro() { const lista = BAIRROS.length > 0; $('eBai').style.display = lista ? 'block' : 'none'; $('eBaiO').style.display = (!lista || $('eBai').value === '__outro') ? 'block' : 'none'; $('eBaiO').style.marginTop = lista ? '-4px' : '0'; }
function setBairro(n) {
  if (!$('eBai')) return;
  if (!BAIRROS.length) { $('eBaiO').value = n || ''; return mostrarBairro(); }
  const m = acharBairro(n);
  if (m) { $('eBai').value = m.nome; $('eBaiO').value = ''; }
  else if (n && BAIRRO_OUTROS === 'padrao') { $('eBai').value = '__outro'; $('eBaiO').value = n; }
  else { $('eBai').value = ''; $('eBaiO').value = ''; }
  mostrarBairro();
}
function montarBairros() {
  if (!$('eBai')) return;
  const sig = JSON.stringify([BAIRROS, BAIRRO_OUTROS]); if (sig === sigB) return; sigB = sig;
  const atual = bairroSel();
  $('eBai').innerHTML = '<option value="">Escolha o bairro</option>' + BAIRROS.map(b => `<option value="${esc(b.nome)}">${esc(b.nome)} · ${(+b.taxa) ? R$(+b.taxa) : 'grátis'}</option>`).join('') + (BAIRRO_OUTROS === 'padrao' ? '<option value="__outro">Outro bairro</option>' : '');
  setBairro(atual);
}
function trocarBairro() { mostrarBairro(); renderCarrinho(); }
function lerEntrega() {
  if (entrega === 'Retirada') return { tipo: 'Retirada' };
  const g = id => $(id).value.trim(), end = {};
  CAMPOS_END.forEach(([i, k]) => end[k] = g(i)); end.bairro = bairroSel();
  if (!end.rua || !end.numero || !end.bairro || !end.cidade) { aviso('Preencha rua, número, bairro e cidade'); return null; }
  if (taxaEntrega() === null) { aviso('Não entregamos neste bairro. Escolha outro bairro ou retire na loja.'); return null; }
  return { tipo: 'Entrega', endereco: end };
}
const txtEnd = e => e.rua + ', ' + e.numero + (e.complemento ? ' (' + e.complemento + ')' : '') + ' - ' + e.bairro + ', ' + e.cidade + (e.cep ? ' · CEP ' + e.cep : '') + (e.ref ? '\nRef.: ' + e.ref : '');

// Local de retirada (cadastrado no painel)
const txtRetirada = () => (RETIRADA.endereco ? RETIRADA.endereco : '') + (RETIRADA.horario ? '\nHorário: ' + RETIRADA.horario : '');
function renderRetirada() {
  const b = $('eRetBox'); if (!b) return;
  b.style.display = entrega === 'Retirada' ? 'block' : 'none';
  b.innerHTML = RETIRADA.endereco
    ? '<label>Local de retirada</label><div style="padding:10px 12px;border:1px solid var(--line)">📍 ' + esc(RETIRADA.endereco) + (RETIRADA.horario ? '<br><small style="color:var(--mut)">Horário: ' + esc(RETIRADA.horario) + '</small>' : '') + '</div>'
    : '<p style="color:var(--mut);font-size:13px">O local e o horário da retirada serão combinados pelo WhatsApp.</p>';
}
// Resumo antes do total: mostra exatamente o que está sendo cobrado (produtos + entrega)
function renderResumo() {
  let el = $('resumo');
  if (!el) {
    el = document.createElement('div'); el.id = 'resumo'; el.style.cssText = 'margin:12px 0;font-size:14px';
    const t = $('tot'), par = t.parentElement, alvo = (par.contains($('itens')) || par.contains($('fp'))) ? t : par;   // fica logo acima da linha do Total
    alvo.insertAdjacentElement('beforebegin', el);
  }
  if (!cart.length) { el.innerHTML = ''; return; }
  const lin = (a, b) => `<div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:4px"><span>${a}</span><span>${b}</span></div>`;
  const n = cart.reduce((a, c) => a + c.q, 0), sub = subtotal(), f = freteVal(), t = taxaEntrega(), b = bairroSel();
  let h = lin('Produtos (' + n + (n === 1 ? ' peça)' : ' peças)'), R$(sub)), obs = '';
  if (entrega === 'Retirada') { h += lin('Retirada na loja', 'Sem custo'); if (RETIRADA.endereco) obs = 'Retire em: ' + esc(RETIRADA.endereco) + (RETIRADA.horario ? ' (' + esc(RETIRADA.horario) + ')' : '') + '.'; }
  else if (BAIRROS.length && !b) h += lin('Entrega', '<span style="color:var(--mut)">escolha o bairro</span>');
  else if (t === null) { h += lin('Entrega', '<span style="color:#e5484d">indisponível</span>'); obs = '<span style="color:#e5484d">Não entregamos neste bairro. Escolha outro bairro ou retire na loja.</span>'; }
  else {
    h += lin('Entrega' + (b ? ' · ' + esc(b) : ''), f ? R$(f) : 'Grátis');
    if (!f) obs = (FRETE_GRATIS > 0 && sub >= FRETE_GRATIS) ? 'Frete grátis: seu pedido passou de ' + R$(FRETE_GRATIS) + '.' : 'Entrega grátis para este bairro.';
    else if (FRETE_GRATIS > 0) obs = 'Faltam ' + R$(FRETE_GRATIS - sub) + ' em produtos para ganhar frete grátis.';
  }
  const fim = 'Total = produtos' + (entrega === 'Entrega' ? ' + entrega' : '') + '.' + (forma === 'Pix' ? ' O código Pix abaixo já vem com este valor.' : '');
  el.innerHTML = h + '<div style="color:var(--mut);font-size:12px;margin-top:6px">' + (obs ? obs + '<br>' : '') + fim + '</div>';
}
function renderCarrinho() {
  montarEntrega(); montarBairros(); preencherEnd();
  $('itens').innerHTML = cart.map((c, i) => `<div class="li"><span>${esc(c.nome)} · ${esc(c.tam)} × ${c.q}</span><span>${R$(c.preco * c.q)} <a href="#" onclick="cart.splice(${i},1);renderCarrinho();$('qtd').textContent=cart.reduce((a,c)=>a+c.q,0);return false" style="color:var(--mut)">✕</a></span></div>`).join('') || '<p style="color:var(--mut)">Sacola vazia.</p>';
  renderRetirada(); renderResumo();
  $('tot').textContent = R$(total()); pixBox();
}
document.querySelectorAll('#fp div').forEach(d => d.onclick = () => { forma = d.dataset.f; document.querySelectorAll('#fp div').forEach(x => x.classList.toggle('on', x === d)); pixBox(); renderResumo(); });
async function copiarPix() {
  const el = $('pixc');
  try { await navigator.clipboard.writeText(el.value); }
  catch (e) { el.focus(); el.select(); el.setSelectionRange(0, 99999); try { document.execCommand('copy'); } catch (_) {} }
  aviso('Código Pix copiado');
}
function pixBox() {
  const b = $('pixBox'); b.innerHTML = '';
  if (forma !== 'Pix' || !total()) { if (forma === 'Cartão') b.innerHTML = '<p style="color:var(--mut);margin-bottom:12px">Cartão na entrega/retirada (maquininha).</p>'; return; }
  const txid = 'VSC' + Date.now();
  const code = (PIX && PIX.chave) ? gerarPix(PIX.chave, PIX.nome, PIX.cidade, total(), txid) : pixPayload(total(), txid);
  b.innerHTML = '<div id="qr"></div><textarea readonly rows="3" id="pixc">' + code + '</textarea><button class="btn o" onclick="copiarPix()">Copiar código Pix</button><p style="color:var(--mut);font-size:12px;margin:8px 0 14px">Pague e depois toque em Finalizar pedido.</p>';
  new QRCode($('qr'), { text: code, width: 180, height: 180 });
}

// ── Conta do cliente ──
let perfilUid = null, offPed = null;
const err = e => aviso(e.message.replace('Firebase: ', ''));
async function atualizarConta() {
  if (user && perfilUid !== user.uid) { const d = (await db.collection('clientes').doc(user.uid).get()).data(); if (perfilUid !== user.uid) { perfil = d || {}; perfilUid = user.uid; endTocado = false; } }
  if (!user) { perfil = {}; perfilUid = null; limparEnd(); }
  const ok = !!perfil.nome;
  $('bConta').textContent = ok ? perfil.nome : 'Entrar';
  $('fLogin').style.display = ok ? 'none' : 'block'; $('fPedidos').style.display = ok ? 'block' : 'none';
  renderSeguranca();
  if (offPed) { offPed(); offPed = null; }
  if (!ok) { if (user && user.displayName && !$('cNome').value) { const n = user.displayName.trim().split(/\s+/); $('cNome').value = n[0]; $('cSob').value = n.slice(1).join(' '); } return; }
  $('cNome').value = perfil.nome; $('cSob').value = perfil.sobrenome || ''; $('cTel').value = perfil.tel || '';
  offPed = db.collection('pedidos').where('uid', '==', user.uid).onSnapshot(s => {
    const docs = s.docs.map(d => d.data()).sort((a, b) => (b.criadoEm ? b.criadoEm.seconds : 9e9) - (a.criadoEm ? a.criadoEm.seconds : 9e9));
    $('meus').innerHTML = docs.map(p => `<div class="li" style="display:block">${p.numero ? '<small style="color:var(--mut)">Pedido nº ' + fmtNum(p.numero) + '</small><br>' : ''}<b>${R$(p.total)}</b> · ${esc(p.pagamento)} <span class="st s${STIDX[p.status] ?? 0}">${esc(p.status)}</span><br><small style="color:var(--mut)">${p.itens.map(i => esc(i.nome) + ' ' + esc(i.tam) + '×' + i.q).join(', ')}${p.entrega ? '<br>' + (p.entrega.tipo === 'Retirada' ? 'Retirada na loja' + (RETIRADA.endereco ? ' · ' + esc(RETIRADA.endereco) : '') : 'Entrega' + (p.frete ? ' · frete ' + R$(p.frete) : '')) : ''}</small></div>`).join('') || '<p style="color:var(--mut)">Você ainda não fez pedidos.</p>';
  });
}
auth.onAuthStateChanged(u => { user = u; atualizarConta(); });

// Entrar / proteger a conta com Google. Cliente anônimo: vincula o Google à mesma conta (os pedidos continuam). Aparelho novo: entra e recupera o histórico.
function renderSeguranca() {
  const box = (id, pai) => { let b = $(id); if (!b) { b = document.createElement('div'); b.id = id; b.style.cssText = 'margin-top:18px;padding-top:14px;border-top:1px solid var(--line)'; $(pai).appendChild(b); } return b; };
  const L = box('gBoxL', 'fLogin'), P = box('gBoxP', 'fPedidos'), logado = user && !user.isAnonymous;
  L.style.display = logado ? 'none' : 'block';
  L.innerHTML = '<p style="color:var(--mut);font-size:13px;margin:0 0 10px">Já comprou antes ou quer guardar seus pedidos?</p><button class="btn o" style="width:100%" onclick="entrarGoogle()">Logar com o Google</button>';
  P.innerHTML = logado
    ? '<p style="color:var(--mut);font-size:13px;margin:0 0 10px">Conectado como ' + esc(user.email || user.displayName || 'Google') + '</p><button class="btn o" style="width:100%" onclick="sairConta()">Sair</button>'
    : '<p style="color:var(--mut);font-size:13px;margin:0 0 10px">Seus pedidos estão salvos só neste aparelho. Se você limpar o navegador ou trocar de celular, perde o histórico.</p><button class="btn o" style="width:100%;margin-bottom:8px" onclick="entrarGoogle()">Logar com o Google</button><button class="btn o" style="width:100%" onclick="sairConta()">Sair</button>';
}
async function entrarGoogle() {
  const prov = new firebase.auth.GoogleAuthProvider();
  try {
    if (user && user.isAnonymous) {
      try { await user.linkWithPopup(prov); await atualizarConta(); aviso('Login feito! Seus pedidos agora ficam salvos na sua conta Google.'); }
      catch (e) {
        if (e.code === 'auth/credential-already-in-use' && e.credential) { await auth.signInWithCredential(e.credential); aviso('Bem-vindo de volta!'); }   // este Google já tem conta: entra nela
        else throw e;
      }
    } else { await auth.signInWithPopup(prov); aviso('Bem-vindo!'); }
  } catch (e) { if (!['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(e.code)) err(e); }
}
async function sairConta() {
  if (user && user.isAnonymous && !confirm('Você não fez login com o Google. Se sair, você perde o acesso ao histórico de pedidos deste aparelho. Sair mesmo assim?')) return;
  await auth.signOut(); cart = []; $('qtd').textContent = 0; fechar(); aviso('Você saiu da conta');
}

function editarDados() { $('fLogin').style.display = 'block'; $('fPedidos').style.display = 'none'; }
async function salvarDados() {
  const nome = $('cNome').value.trim(), sobrenome = $('cSob').value.trim(), tel = $('cTel').value.replace(/\D/g, '').replace(/^55(?=\d{10,11}$)/, '');
  if (!nome || !sobrenome) return aviso('Informe nome e sobrenome');
  if (!/^\d{10,11}$/.test(tel)) return aviso('Telefone inválido: use DDD + número');
  try {
    if (!user) user = (await auth.signInAnonymously()).user;
    perfil = { ...perfil, nome, sobrenome, tel }; perfilUid = user.uid;
    await db.collection('clientes').doc(user.uid).set(perfil);
  } catch (e) { return err(e); }
  await atualizarConta(); aviso('Dados salvos!'); cart.length ? abrir('pCarrinho') : fechar();
}
const fmtTel = t => t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : t.length === 10 ? `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}` : t;
const fmtNum = n => String(n).padStart(2, '0');

// ── Número do pedido em sequência (01, 02, 03...), com reinício opcional definido no painel ──
function chavePeriodo() {   // período atual no horário de Fortaleza; a semana começa na segunda-feira
  const f = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Fortaleza', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date());
  const g = t => f.find(x => x.type === t).value, p = n => String(n).padStart(2, '0');
  const y = +g('year'), m = +g('month'), dia = +g('day'), dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].indexOf(g('weekday'));
  if (REINICIAR === 'diario') return y + '-' + p(m) + '-' + p(dia);
  if (REINICIAR === 'mensal') return y + '-' + p(m);
  if (REINICIAR === 'semanal') { const seg = new Date(Date.UTC(y, m - 1, dia - dow)); return 'sem-' + seg.getUTCFullYear() + '-' + p(seg.getUTCMonth() + 1) + '-' + p(seg.getUTCDate()); }
  return 'sempre';
}
const r2 = n => Math.round(n * 100) / 100;

// ── Finalizar: o número do pedido e o pedido são gravados juntos, na mesma transação (não "queima" número se falhar).
// O estoque é baixado pelo painel quando você confirma o pedido (e volta se você cancelar). ──
async function finalizar() {
  if (enviando) return;
  if (!cart.length) return aviso('Sua sacola está vazia');
  for (const c of cart) { const p = prods.find(x => x.id === c.id); if (!p || estq(p, c.tam) < c.q) return aviso('"' + c.nome + ' ' + c.tam + '" não tem estoque suficiente. Ajuste sua sacola.'); c.preco = precoAtual(p); }
  if (!user || !perfil.nome) { abrir('pConta'); return aviso('Informe seus dados para finalizar'); }
  const ent = lerEntrega(); if (!ent) return;
  const ped = {
    uid: user.uid, cliente: { nome: (perfil.nome + ' ' + (perfil.sobrenome || '')).trim(), tel: perfil.tel },
    itens: cart.map(c => ({ id: c.id, nome: c.nome, preco: c.preco, tam: c.tam, q: c.q })),
    subtotal: r2(subtotal()), frete: freteVal(), total: total(), pagamento: forma, entrega: ent,
    status: forma === 'Pix' ? 'Aguardando conferência' : 'Novo', estoqueEstado: 'reservado', criadoEm: firebase.firestore.FieldValue.serverTimestamp()
  };
  const ref = db.collection('pedidos').doc(), cont = db.collection('config').doc('contador'), per = chavePeriodo();
  enviando = true; aviso('Enviando seu pedido...');
  try {
    await db.runTransaction(async t => {
      // leituras primeiro: contador, produtos e reservas
      const d = await t.get(cont), ids = [...new Set(ped.itens.map(l => l.id))];
      const ps = await Promise.all(ids.map(id => t.get(db.collection('produtos').doc(id))));
      const P = {}; ps.forEach(x => P[x.id] = x.exists ? x.data() : null);
      const rs = await Promise.all(ped.itens.map(l => t.get(db.collection('reservas').doc(l.id + '_' + l.tam))));
      const novas = [];
      ped.itens.forEach((l, i) => {
        const p = P[l.id]; if (!p || p.ativo === false) throw new Error('"' + l.nome + '" não está mais disponível.');
        if (Math.abs(precoAtual(p) - l.preco) > 0.004) throw new Error('O preço de "' + l.nome + '" mudou. Confira a sacola e tente de novo.');
        if (!p.estoque) return;   // sem controle de estoque: ilimitado
        const res = rs[i].exists ? (rs[i].data().n || 0) : 0, livre = (p.estoque[l.tam] ?? 0) - res;
        if (livre < l.q) throw new Error(livre <= 0 ? '"' + l.nome + ' ' + l.tam + '" esgotou.' : 'Só temos ' + livre + ' unidade(s) de "' + l.nome + ' ' + l.tam + '".');
        novas.push([rs[i].ref, res + l.q]);
      });
      const c = d.exists ? d.data() : {};
      ped.numero = c.p === per ? (c.n || 0) + 1 : 1;
      novas.forEach(([r, n]) => t.set(r, { n, pedido: ref.id }));   // reserva as peças
      t.set(cont, { n: ped.numero, p: per }); t.set(ref, ped);
    });
  } catch (e) {
    console.error(e); enviando = false;
    return aviso(e.code === 'permission-denied' ? 'Não foi possível registrar o pedido. Atualize a página e tente de novo.' : e.message.replace('Firebase: ', ''));
  }
  enviando = false;
  if (ent.tipo === 'Entrega') { perfil.end = ent.endereco; db.collection('clientes').doc(user.uid).set({ end: ent.endereco }, { merge: true }).catch(() => {}); }   // guarda o endereço para a próxima compra
  const entTxt = ent.tipo === 'Retirada' ? '*Retirada na loja*' + (RETIRADA.endereco ? '\n' + txtRetirada() : '') : '*Entrega*\n' + txtEnd(ent.endereco) + (ped.frete ? '\n*Frete:* ' + R$(ped.frete) : '');
  const msg = `*NOVO PEDIDO · VSC STORE*\nPedido nº ${fmtNum(ped.numero)}\n\n*Cliente*\n${ped.cliente.nome}\nWhatsApp: ${fmtTel(ped.cliente.tel)}\n\n*Itens*\n` + ped.itens.map(c => `${c.q}× ${c.nome} (${c.tam}) — ${R$(c.preco * c.q)}`).join('\n') + `\n\n${entTxt}\n\n*Pagamento:* ${forma}\n*Total:* ${R$(ped.total)}`;
  const wa = `https://wa.me/${LOJA.whatsapp}?text=${encodeURIComponent(msg)}`; if (!window.open(wa, '_blank')) location.href = wa;
  cart = []; $('qtd').textContent = 0; fechar(); aviso('Pedido enviado! Acompanhe em Minha conta.');
}
