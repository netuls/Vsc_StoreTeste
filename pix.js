// ── Pix (BR Code / Copia e Cola) ──
function pixCRC(s) {
  let c = 0xFFFF;
  for (let i = 0; i < s.length; i++) {
    c ^= s.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF;
  }
  return c.toString(16).toUpperCase().padStart(4, '0');
}
function gerarPix(chave, nome, cidade, valor, txid) {
  const f = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const limpa = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9 ]/g, '').toUpperCase().trim();
  const conta = f('00', 'br.gov.bcb.pix') + f('01', chave);
  const tx = String(txid || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 25) || '***';
  let p = f('00', '01') + f('26', conta) + f('52', '0000') + f('53', '986');
  if (valor > 0) p += f('54', Number(valor).toFixed(2));
  p += f('58', 'BR') + f('59', limpa(nome).slice(0, 25)) + f('60', limpa(cidade).slice(0, 15)) + f('62', f('05', tx));
  p += '6304';
  return p + pixCRC(p);
}
