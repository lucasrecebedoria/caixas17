// Helpers
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const fmtBRL = (v) => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const toEmail = (matricula) => `${matricula}@movebuss.local`;
const ADM_MATS = new Set(["4144","70029","6266"]);

document.getElementById('year').textContent = new Date().getFullYear();

// Init Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

// UI state
const views = {
  login: $('#viewLogin'),
  register: $('#viewRegister'),
  dashboard: $('#viewDashboard'),
};
const cards = {
  abastecimento: $('#cardAbastecimento'),
  relatorios: $('#cardRelatorios'),
};
const printArea = $('#printArea');

function show(el){el.classList.remove('hidden')}
function hide(el){el.classList.add('hidden')}
function toast(msg){alert(msg)}

function setBadge(user){
  const badge = $('#userBadge');
  if(!user){hide(badge); return}
  const m = user.matricula;
  const cls = ADM_MATS.has(m) ? 'gold' : 'green';
  badge.className = `user-badge ${cls}`;
  badge.innerHTML = `${user.nome} · Matrícula ${user.matricula}`;
  show(badge);
}

function setTopbarForAuth(signed){
  [$('#btnChangePassword'), $('#btnLogout')].forEach(b => signed ? show(b) : hide(b));
}

function setMenuVisible(showing){
  $('#sideMenu').style.display = showing ? 'flex' : 'none';
}
setMenuVisible(false);

// ROUTING
$('#btnToggleMenu').addEventListener('click', () => {
  const sm = $('#sideMenu');
  sm.style.display = sm.style.display === 'none' ? 'flex' : 'none';
});
$('#sideMenu .sidemenu-item[data-view="abastecimento"]').addEventListener('click', () => {
  show(cards.abastecimento); hide(cards.relatorios);
});
$('#sideMenu .sidemenu-item[data-view="relatorios"]').addEventListener('click', () => {
  hide(cards.abastecimento); show(cards.relatorios); fetchRelatorios();
});

$('#goRegister').addEventListener('click', ()=>{hide(views.login); show(views.register)});
$('#goLogin').addEventListener('click', ()=>{hide(views.register); show(views.login)});

// AUTH
$('#formRegister').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const matricula = $('#regMatricula').value.trim();
  const nome = $('#regNome').value.trim();
  const senha = $('#regSenha').value;
  if(!/^\d{3,}$/.test(matricula)) return toast('Matrícula inválida');
  const email = toEmail(matricula);
  try{
    const cred = await auth.createUserWithEmailAndPassword(email, senha);
    // Save profile
    await db.collection('usuarios').doc(cred.user.uid).set({
      uid: cred.user.uid, matricula, nome, admin: ADM_MATS.has(matricula),
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
    toast('Conta criada com sucesso. Faça login.');
    hide(views.register); show(views.login);
    $('#loginMatricula').value = matricula;
  }catch(err){ toast(err.message) }
});

$('#formLogin').addEventListener('submit', async (e)=>{
  e.preventDefault();
  const matricula = $('#loginMatricula').value.trim();
  const senha = $('#loginSenha').value;
  const email = toEmail(matricula);
  try{
    await auth.signInWithEmailAndPassword(email, senha);
  }catch(err){ toast(err.message) }
});

$('#btnLogout').addEventListener('click', ()=> auth.signOut());
$('#btnChangePassword').addEventListener('click', async ()=>{
  const user = auth.currentUser;
  if(!user) return;
  const nova = prompt('Nova senha (mín. 6 caracteres)');
  if(!nova) return;
  try{ await user.updatePassword(nova); toast('Senha alterada'); }catch(e){ toast(e.message) }
});

let profile = null;
let caixa = null; // estado do caixa do usuário logado

auth.onAuthStateChanged(async (u)=>{
  if(!u){
    profile = null; caixa = null;
    setTopbarForAuth(false); setMenuVisible(false);
    hide(views.dashboard); show(views.login);
    return;
  }
  // load profile
  const ref = db.collection('usuarios').doc(u.uid);
  const doc = await ref.get();
  if(!doc.exists){
    await ref.set({uid: u.uid, matricula: '0000', nome: 'Usuário', admin: false});
  }
  profile = (await ref.get()).data();
  setTopbarForAuth(true); setMenuVisible(true);
  setBadge(profile);
  // set recebedor matricula
  $('#matRecebedor').value = profile.matricula;
  // show dashboard
  hide(views.login); hide(views.register); show(views.dashboard);
  await loadCaixa();
  updateCaixaUI();
  // default to Abastecimento or Relatórios
  if(caixa?.aberto) { show(cards.abastecimento); hide(cards.relatorios) } else { hide(cards.abastecimento); show(cards.relatorios) }
});

// CAIXA
async function loadCaixa(){
  const doc = await db.collection('caixa').doc(profile.uid).get();
  caixa = doc.exists ? doc.data() : {aberto:false};
}
function updateCaixaUI(){
  const st = $('#caixaStatus');
  if(caixa?.aberto){
    st.textContent = `Aberto em ${new Date(caixa.abertoEm?.toDate?.()||caixa.abertoEm||Date.now()).toLocaleString('pt-BR')} por matrícula ${caixa.matriculaRecebedor}`;
    show($('#btnFecharCaixa')); hide($('#btnAbrirCaixa'));
    show(cards.abastecimento);
  }else{
    st.textContent = 'Fechado';
    hide($('#btnFecharCaixa')); show($('#btnAbrirCaixa'));
    hide(cards.abastecimento);
  }
}
$('#btnAbrirCaixa').addEventListener('click', async ()=>{
  const now = firebase.firestore.Timestamp.now();
  await db.collection('caixa').doc(profile.uid).set({
    aberto:true, abertoEm: now, matriculaRecebedor: profile.matricula, sangrias: [], total:0, totalPosSangria:0
  }, {merge:true});
  await loadCaixa(); updateCaixaUI(); toast('Caixa aberto');
});
$('#btnFecharCaixa').addEventListener('click', async ()=>{
  if(!confirm('Tem certeza que deseja fechar o caixa?')) return;
  await db.collection('caixa').doc(profile.uid).set({aberto:false, fechadoEm: firebase.firestore.Timestamp.now()}, {merge:true});
  await loadCaixa(); updateCaixaUI(); toast('Caixa fechado');
});

// Abastecimento form logic
$('#qtdBordos').addEventListener('input', ()=>{
  const q = parseInt($('#qtdBordos').value||'0',10);
  const val = q * 5;
  $('#valor').value = val.toFixed(2);
});

// Default date today
$('#dataCaixa').valueAsDate = new Date();

$('#formAbastecimento').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!caixa?.aberto){ return toast('Abra o caixa para gerar recibos.'); }
  // collect
  const dado = {
    tipoValidador: $('#tipoValidador').value,
    qtdBordos: parseInt($('#qtdBordos').value,10),
    valor: Number($('#valor').value),
    prefixo: '55' + $('#prefixo').value.padStart(3,'0'),
    dataCaixa: $('#dataCaixa').value,
    matMotorista: $('#matMotorista').value.trim(),
    matRecebedor: $('#matRecebedor').value.trim(),
    criadoPorUid: profile.uid,
    criadoPorMatricula: profile.matricula,
    criadoPorNome: profile.nome,
    criadoEm: firebase.firestore.Timestamp.now(),
    dia: $('#dataCaixa').value,                 // YYYY-MM-DD
    mes: $('#dataCaixa').value.slice(0,7),      // YYYY-MM
    tipo: 'abastecimento',
  };
  if(!dado.tipoValidador || !dado.qtdBordos || !dado.matMotorista || !/^\d{3}$/.test($('#prefixo').value)){
    return toast('Preencha todos os campos corretamente.');
  }
  try{
    // create relatorio
    const ref = db.collection('relatorios').doc();
    await ref.set(dado);
    // update caixa totals
    const cxRef = db.collection('caixa').doc(profile.uid);
    await db.runTransaction(async (tx)=>{
      const d = (await tx.get(cxRef)).data() || {total:0,totalPosSangria:0,sangrias:[]};
      const total = (d.total||0) + dado.valor;
      const totalPosSangria = (d.totalPosSangria||0) + dado.valor - (d.sangrias||[]).filter(s=>s.aprovado).reduce((a,b)=>a+(b.valor||0),0);
      tx.set(cxRef, {total, totalPosSangria}, {merge:true});
    });
    // Print
    printRecibo(dado);
    // Reset form
    $('#formAbastecimento').reset();
    $('#dataCaixa').valueAsDate = new Date();
    $('#valor').value='';
    fetchRelatorios();
  }catch(e){ toast(e.message) }
});

// Sangria
$('#formSangria').addEventListener('submit', async (e)=>{
  e.preventDefault();
  if(!caixa?.aberto) return toast('Abra o caixa para solicitar sangria.');
  const valor = parseFloat($('#sangriaValor').value);
  const motivo = $('#sangriaMotivo').value.trim();
  if(!valor || valor<=0) return toast('Valor inválido');
  const sangria = {
    valor, motivo, criadoEm: firebase.firestore.Timestamp.now(),
    criadoPorUid: profile.uid, criadoPorMatricula: profile.matricula, aprovado: false, dia: new Date().toISOString().slice(0,10)
  };
  try{
    await db.collection('relatorios').add({tipo:'sangria', ...sangria});
    await db.collection('caixa').doc(profile.uid).set({
      sangrias: firebase.firestore.FieldValue.arrayUnion(sangria)
    }, {merge:true});
    toast('Sangria registrada. Aguarde aprovação de um admin nos relatórios.');
    $('#formSangria').reset();
    fetchRelatorios();
  }catch(e){ toast(e.message) }
});

// Print thermal receipt
function printRecibo(data){
  // Build receipt DOM
  const el = printArea;
  el.innerHTML = `
    <h1>RECIBO DE PAGAMENTO MANUAL</h1>
    <div class="sep"></div>
    <div class="line"><span>Tipo de validador:</span><span>${data.tipoValidador}</span></div>
    <div class="line"><span>PREFIXO:</span><span>${data.prefixo}</span></div>
    <div class="line"><span>QUANTIDADE BORDOS:</span><span>${data.qtdBordos}</span></div>
    <div class="line"><span>VALOR:</span><span>R$ ${Number(data.valor).toFixed(2)}</span></div>
    <div class="line"><span>MATRICULA MOTORISTA:</span><span>${data.matMotorista}</span></div>
    <div class="line"><span>MATRICULA RECEBEDOR:</span><span>${data.matRecebedor}</span></div>
    <div class="line"><span>DATA RECEBIMENTO:</span><span>${new Date().toLocaleString('pt-BR')}</span></div>
    <div class="sep"></div>
    <div>ASSINATURA RECEBEDOR:</div>
    <div style="height:40px"></div>
    <div>_____________________________</div>
  `;
  show(el);
  window.print();
  hide(el);
}

// RELATÓRIOS
async function fetchRelatorios(){
  const dia = $('#filterDia').value || null;
  let q = db.collection('relatorios').orderBy('criadoEm', 'desc').limit(200);
  if(dia){ q = db.collection('relatorios').where('dia', '==', dia).orderBy('criadoEm','desc'); }
  const snap = await q.get();
  const docs = snap.docs.map(d=>({id:d.id, ...d.data()}));
  renderRelatorios(docs);
}

function renderRelatorios(docs){
  const isAdmin = !!profile && ADM_MATS.has(profile.matricula);
  // group by dia then by matricula
  const byDay = {};
  for(const d of docs){
    const day = d.dia || (d.criadoEm?.toDate? d.criadoEm.toDate().toISOString().slice(0,10):'desconhecido');
    if(!byDay[day]) byDay[day]={};
    const key = d.tipo==='abastecimento' ? (d.criadoPorMatricula || 'n/a') : 'SANGRIAS';
    if(!byDay[day][key]) byDay[day][key]=[];
    byDay[day][key].push(d);
  }
  const wrap = $('#listaRelatorios');
  wrap.innerHTML='';
  const days = Object.keys(byDay).sort().reverse();
  for(const day of days){
    const group = byDay[day];
    const dayEl = document.createElement('div');
    dayEl.className = 'card';
    const head = document.createElement('div');
    head.className = 'row space-between';
    const totalDia = Object.values(group).flat().reduce((a,b)=> a + (b.tipo==='abastecimento'? (b.valor||0) : 0), 0);
    head.innerHTML = `<h4>${day}</h4><div>Total do dia: <b>${fmtBRL(totalDia)}</b></div>`;
    dayEl.appendChild(head);

    for(const matricula of Object.keys(group)){
      const list = document.createElement('div');
      const title = document.createElement('div');
      title.className='row space-between';
      title.innerHTML = `<div class="muted">Matrícula: <b>${matricula}</b></div>`;
      dayEl.appendChild(title);
      for(const r of group[matricula]){
        if(!isAdmin && r.criadoPorUid !== profile.uid) continue; // normal users see only own
        const row = document.createElement('div');
        row.className='row space-between';
        let inner = '';
        if(r.tipo === 'abastecimento'){
          inner = `
            <div>Validador <b>${r.tipoValidador}</b> · Prefixo <b>${r.prefixo}</b> · Bordos <b>${r.qtdBordos}</b> · Valor <b>${fmtBRL(r.valor)}</b></div>
            <div class="row">
              ${isAdmin? `<button class="btn outline" data-edit="${r.id}">Editar</button>
              <button class="btn danger" data-del="${r.id}">Excluir</button>`:''}
            </div>
          `;
        }else if(r.tipo === 'sangria'){
          inner = `
            <div>Sangria solicitada · Valor <b>${fmtBRL(r.valor)}</b> · Motivo: ${r.motivo||'-'} · ${r.aprovado?'Aprovada':'Pendente'}</div>
            ${isAdmin? `<label class="inline">Aprovar
              <input type="checkbox" data-aprovar="${r.id}" ${r.aprovado?'checked':''} />
            </label>`:''}
          `;
        }
        row.innerHTML = inner;
        dayEl.appendChild(row);
      }
    }
    wrap.appendChild(dayEl);
  }

  // admin actions
  if(isAdmin){
    wrap.querySelectorAll('[data-del]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        if(!confirm('Excluir este lançamento?')) return;
        const id = e.currentTarget.getAttribute('data-del');
        await db.collection('relatorios').doc(id).delete();
        fetchRelatorios();
      });
    });
    wrap.querySelectorAll('[data-edit]').forEach(btn=>{
      btn.addEventListener('click', async (e)=>{
        const id = e.currentTarget.getAttribute('data-edit');
        const doc = await db.collection('relatorios').doc(id).get();
        const r = doc.data();
        const novoValor = prompt('Novo valor (R$):', r.valor);
        if(novoValor!==null){
          await db.collection('relatorios').doc(id).set({valor: Number(novoValor)}, {merge:true});
          fetchRelatorios();
        }
      });
    });
    wrap.querySelectorAll('[data-aprovar]').forEach(chk=>{
      chk.addEventListener('change', async (e)=>{
        const id = e.currentTarget.getAttribute('data-aprovar');
        const aprovado = e.currentTarget.checked;
        await db.collection('relatorios').doc(id).set({aprovado}, {merge:true});
        fetchRelatorios();
      });
    });
  }
}

// Guard: only show Abastecimento when caixa aberto
function guardAbastecimento(){
  if(!caixa?.aberto){ hide(cards.abastecimento); }
}
setInterval(guardAbastecimento, 3000); // lightweight guard

