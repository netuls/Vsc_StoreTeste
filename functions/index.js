const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// REGIÃO: precisa ser a mesma do seu Firestore (Firebase Console > Firestore > Configurações > Local).
// Exemplos: 'southamerica-east1' (São Paulo), 'nam5' usa 'us-central1'. Deixe null se for us-central1.
const REGIAO = null;
const alvo = doc => REGIAO ? { document: doc, region: REGIAO } : doc;

// Envia um push (só "data", o sw.js monta a notificação) para todos os aparelhos do admin
async function enviarPush(title, body) {
  const tokens = (await db.collection('admTokens').get()).docs.map(d => d.id);
  if (!tokens.length) { console.log('Nenhum aparelho em admTokens: clique em "Ativar avisos" no painel.'); return { ok: 0, falhas: 0, aparelhos: 0 }; }
  const r = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title, body },
    webpush: { headers: { Urgency: 'high', TTL: '86400' } },
    android: { priority: 'high' }
  });
  console.log(`Push enviado: ${r.successCount} ok, ${r.failureCount} falha(s)`);
  await Promise.all(r.responses.map((x, i) => {
    if (x.success) return null;
    console.error('Falha no token', tokens[i], x.error && x.error.code);
    // remove aparelhos que não existem mais
    return /not-registered|invalid-registration/.test((x.error && x.error.code) || '') ? db.collection('admTokens').doc(tokens[i]).delete() : null;
  }));
  return { ok: r.successCount, falhas: r.failureCount, aparelhos: tokens.length };
}

// Pedido novo: avisa o administrador por push.
// O estoque NÃO é mexido aqui: o site reserva ao criar o pedido e o painel (admin.js) baixa/devolve ao confirmar/cancelar.
exports.novoPedido = onDocumentCreated(alvo('pedidos/{id}'), async ev => {
  const p = ev.data.data();
  const itens = (p.itens || []).map(i => `${i.nome} ${i.tam}×${i.q}`).join(', ');
  await enviarPush(
    `🛍️ Novo pedido · R$ ${Number(p.total).toFixed(2).replace('.', ',')}`,
    `${(p.cliente && p.cliente.nome) || 'Cliente'} · ${p.pagamento} · ${itens}`
  );
});

// Teste do painel (botão "Testar"): manda um push de verdade e devolve o resultado no próprio documento
exports.testePush = onDocumentCreated(alvo('admTestes/{id}'), async ev => {
  let resultado;
  try { resultado = await enviarPush('🔧 Teste de push', 'Se você recebeu isto, o servidor está enviando certo.'); }
  catch (e) { console.error('testePush', e); resultado = { ok: 0, falhas: 0, aparelhos: 0, erro: String(e.message || e).slice(0, 200) }; }
  await ev.data.ref.update({ resultado });
});
