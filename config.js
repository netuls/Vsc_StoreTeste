// Preencha com os dados do seu projeto Firebase (Configurações do projeto > Seus apps)
const LOJA = {
  nome: 'VSC STORE',
  whatsapp: '5585999999999',            // DDI+DDD+número, só dígitos: recebe o aviso do pedido
  adminEmail: 'admin@vscstore.com',   // e-mail "interno" do admin (não precisa existir); você digita só a senha
  pix: { chave: 'SUA-CHAVE-PIX', nome: 'VSC STORE', cidade: 'FORTALEZA' },
  vapidKey: 'BNaHE-_lkQ2iOO7qHef6OxD64PsrmDU2OQuKR1RkglRZb-PwTnsf2buliBpBpIPVabqd7EwOwFPfQzLifF48l4s',                         // Firebase > Configurações > Cloud Messaging > Certificados push da Web > Gerar par de chaves
  firebase: { apiKey:'AIzaSyDdPEozokykjC1JhFoV9zMcsiN6aErZiD8', authDomain:'vsc-store.firebaseapp.com', projectId:'vsc-store', storageBucket:'vsc-store.firebasestorage.app', messagingSenderId:'322783996630', appId:'1:322783996630:web:557a703cb1dac8d839b777' }
};
firebase.initializeApp(LOJA.firebase);
const db = firebase.firestore(), auth = firebase.auth();
const R$ = v => 'R$ ' + Number(v).toFixed(2).replace('.', ',');

// ── Pix copia-e-cola (BR Code) ──
function pixPayload(valor, txid) {
  const t = (i, v) => i + String(v.length).padStart(2, '0') + v;
  const lim = (s, n) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().slice(0, n);
  const p = t('00','01') + t('26', t('00','br.gov.bcb.pix') + t('01', LOJA.pix.chave)) + t('52','0000') + t('53','986') +
    t('54', valor.toFixed(2)) + t('58','BR') + t('59', lim(LOJA.pix.nome,25)) + t('60', lim(LOJA.pix.cidade,15)) +
    t('62', t('05', (txid || '***').replace(/\W/g,'').slice(0,25) || '***')) + '6304';
  let c = 0xFFFF;
  for (let i = 0; i < p.length; i++) { c ^= p.charCodeAt(i) << 8; for (let j = 0; j < 8; j++) c = (c & 0x8000) ? ((c << 1) ^ 0x1021) & 0xFFFF : (c << 1) & 0xFFFF; }
  return p + c.toString(16).toUpperCase().padStart(4, '0');
}

// ── PWA: registra o service worker (requer HTTPS, como no GitHub Pages/Firebase Hosting) ──
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('sw.js?cfg=' + encodeURIComponent(JSON.stringify(LOJA.firebase))).catch(() => {}));
