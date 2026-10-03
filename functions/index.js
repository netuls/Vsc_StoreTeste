const { onDocumentCreated, onDocumentUpdated } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// Tira (sinal = -1) ou devolve (+1) ao estoque os itens de um pedido
async function ajustaEstoque(itens, sinal) {
  await db.runTransaction(async tx => {
    const refs = [...new Set(itens.map(i => i.id))].map(id => db.collection('produtos').doc(id));
    const snaps = await Promise.all(refs.map(r => tx.get(r)));
    snaps.forEach(s => {
      if (!s.exists || !s.data().estoque) return;          // produto sem controle de estoque
      const est = { ...s.data().estoque };
      itens.filter(i => i.id === s.id).forEach(i => { if (i.tam in est) est[i.tam] = Math.max(0, est[i.tam] + sinal * i.q); });
      tx.update(s.ref, { estoque: est });
    });
  });
}

// Pedido novo: baixa o estoque e avisa o administrador por push
exports.novoPedido = onDocumentCreated('pedidos/{id}', async ev => {
  const p = ev.data.data();
  try { await ajustaEstoque(p.itens || [], -1); } catch (e) { console.error('estoque', e); }
  const tokens = (await db.collection('admTokens').get()).docs.map(d => d.id);
  if (!tokens.length) return;
  const itens = (p.itens || []).map(i => `${i.nome} ${i.tam}×${i.q}`).join(', ');
  const r = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { title: `🛍️ Novo pedido · R$ ${Number(p.total).toFixed(2).replace('.', ',')}`, body: `${(p.cliente && p.cliente.nome) || 'Cliente'} · ${p.pagamento} · ${itens}` },
    webpush: { headers: { Urgency: 'high' } }
  });
  await Promise.all(r.responses.map((x, i) =>   // remove aparelhos que não existem mais
    !x.success && /not-registered|invalid-registration/.test(x.error.code) ? db.collection('admTokens').doc(tokens[i]).delete() : null));
});

// Pedido cancelado devolve as peças ao estoque (e se for reaberto, baixa de novo)
exports.statusPedido = onDocumentUpdated('pedidos/{id}', async ev => {
  const a = ev.data.before.data(), b = ev.data.after.data();
  if (a.status !== 'Cancelado' && b.status === 'Cancelado') await ajustaEstoque(b.itens || [], +1);
  else if (a.status === 'Cancelado' && b.status !== 'Cancelado') await ajustaEstoque(b.itens || [], -1);
});
