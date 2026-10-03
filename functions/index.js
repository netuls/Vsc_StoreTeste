const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Pedido novo: avisa o administrador por push.
// O estoque NÃO é mexido aqui: o site reserva ao criar o pedido e o painel (admin.js)
// baixa/devolve ao confirmar/cancelar, tudo em transação.
//
// Se o seu Firestore NÃO estiver na região padrão (us-central1), troque o primeiro argumento por:
// { document: 'pedidos/{id}', region: 'southamerica-east1' }   // use a região do seu banco
exports.novoPedido = onDocumentCreated('pedidos/{id}', async ev => {
  const p = ev.data.data();
  const tokens = (await db.collection('admTokens').get()).docs.map(d => d.id);
  if (!tokens.length) { console.log('Nenhum aparelho em admTokens: ative os avisos no painel.'); return; }

  const itens = (p.itens || []).map(i => `${i.nome} ${i.tam}×${i.q}`).join(', ');
  const r = await admin.messaging().sendEachForMulticast({
    tokens,
    data: {
      title: `🛍️ Novo pedido · R$ ${Number(p.total).toFixed(2).replace('.', ',')}`,
      body: `${(p.cliente && p.cliente.nome) || 'Cliente'} · ${p.pagamento} · ${itens}`
    },
    webpush: { headers: { Urgency: 'high' } }
  });

  console.log(`Push enviado: ${r.successCount} ok, ${r.failureCount} falha(s)`);
  await Promise.all(r.responses.map((x, i) => {
    if (x.success) return null;
    console.error('Falha no token', tokens[i], x.error && x.error.code);
    // remove aparelhos que não existem mais
    return /not-registered|invalid-registration/.test((x.error && x.error.code) || '') ? db.collection('admTokens').doc(tokens[i]).delete() : null;
  }));
});
