// Firebase imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.6.11/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.6.11/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/9.6.11/firebase-firestore.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyAxQliXm59BRg9zsVpK5qthB0nowqU0GEg",
  authDomain: "lancamentomanual-6cac4.firebaseapp.com",
  projectId: "lancamentomanual-6cac4",
  storageBucket: "lancamentomanual-6cac4.firebasestorage.app",
  messagingSenderId: "710102934933",
  appId: "1:710102934933:web:a5dc954d01d40518a5c29c",
  measurementId: "G-MLLXPXR7EC"
};

// Init
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Navegação
const appDiv = document.getElementById("app");
document.getElementById("btnAbastecimento").addEventListener("click", renderAbastecimento);
document.getElementById("btnRelatorios").addEventListener("click", renderRelatorios);
document.getElementById("btnLogout").addEventListener("click", () => signOut(auth));

// ------------------ Abastecimento ------------------
function renderAbastecimento() {
  appDiv.innerHTML = `
    <h2>Lançar Abastecimento</h2>
    <form id="formAbastecimento">
      <label>Tipo de Validador:</label>
      <select id="tipoValidador">
        <option>PRODATA</option>
        <option>DIGICON</option>
      </select><br>
      <label>Qtd Bordos:</label>
      <input type="number" id="qtdBordos" /><br>
      <label>Prefixo:</label>
      <input type="number" id="prefixo" /><br>
      <label>Matrícula Motorista:</label>
      <input type="text" id="matMotorista" /><br>
      <button type="submit">Salvar</button>
    </form>
  `;
  document.getElementById("formAbastecimento").addEventListener("submit", salvarAbastecimento);
}

async function salvarAbastecimento(e) {
  e.preventDefault();
  const dados = {
    tipoValidador: document.getElementById("tipoValidador").value,
    quantidadeBordos: parseInt(document.getElementById("qtdBordos").value),
    valor: parseInt(document.getElementById("qtdBordos").value) * 5,
    prefixo: "55" + document.getElementById("prefixo").value,
    dataCaixa: new Date().toLocaleDateString("pt-BR"),
    matriculaMotorista: document.getElementById("matMotorista").value,
    matriculaRecebedor: "4144" // fixo admin
  };
  await addDoc(collection(db, "relatorios"), dados);
  alert("Abastecimento salvo!");
}

// ------------------ Relatórios ------------------
function renderRelatorios() {
  appDiv.innerHTML = `
    <h2>Relatórios</h2>
    <div>
      <button id="btnDetalhado">Relatório Detalhado</button>
      <button id="btnResumido">Relatório Resumido</button>
    </div>
    <div id="relatorioArea"></div>
  `;
  document.getElementById("btnDetalhado").addEventListener("click", renderRelatorioDetalhado);
  document.getElementById("btnResumido").addEventListener("click", renderRelatorioResumido);
}

async function renderRelatorioDetalhado() {
  const relDiv = document.getElementById("relatorioArea");
  const snapshot = await getDocs(collection(db, "relatorios"));
  let html = "<h3>Detalhado</h3><table><tr><th>Data</th><th>Validador</th><th>Qtd</th><th>Valor</th><th>Prefixo</th><th>Motorista</th><th>Recebedor</th></tr>";
  snapshot.forEach(doc => {
    const d = doc.data();
    html += `<tr><td>${d.dataCaixa}</td><td>${d.tipoValidador}</td><td>${d.quantidadeBordos}</td><td>${d.valor}</td><td>${d.prefixo}</td><td>${d.matriculaMotorista}</td><td>${d.matriculaRecebedor}</td></tr>`;
  });
  html += "</table>";
  relDiv.innerHTML = html;
}

async function renderRelatorioResumido() {
  const relDiv = document.getElementById("relatorioArea");
  const snapshot = await getDocs(collection(db, "relatorios"));
  let total = 0;
  snapshot.forEach(doc => {
    total += doc.data().valor || 0;
  });
  let html = "<h3>Resumido</h3>";
  html += `<p>Valor Lançado: R$ ${total}</p>`;
  html += `<p>Valor Pós-Sangria: (a implementar sangria)</p>`;
  relDiv.innerHTML = html;
}

// Render inicial
renderAbastecimento();