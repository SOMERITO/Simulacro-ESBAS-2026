// ==========================================
// CONFIGURACIÓN FIREBASE (SDK Modular v10)
// ==========================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { 
    getAuth, 
    signInWithEmailAndPassword, 
    onAuthStateChanged, 
    signOut, 
    createUserWithEmailAndPassword 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";
import { 
    getFirestore, 
    collection, 
    getDocs, 
    doc, 
    setDoc, 
    addDoc, 
    deleteDoc, 
    getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";

// Tu configuración real de ESBAS-2026
const firebaseConfig = {
    apiKey: "AIzaSyC4eWmz68IlI0qEaW6zndkjFN_bwzlLjpY",
    authDomain: "esbas-2026.firebaseapp.com",
    projectId: "esbas-2026",
    storageBucket: "esbas-2026.firebasestorage.app",
    messagingSenderId: "524580412919",
    appId: "1:524580412919:web:9104e66780fc4c61c9e2f2",
    measurementId: "G-WL19S67089"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Variables de estado
let appData = { questions: [], users: [] };
let currentUser = null;
let currentUserRole = 'estudiante';

let currentSimulationQuestions = [];
let userAnswers = {};
let currentSimIndex = 0;
let activeModuleFilter = 'all';
let activeLessonFilter = 'all';

let formMemory = { lastModule: '', 'Módulo I': { num: '', name: '' }, 'Módulo II': { num: '', name: '' }, 'Módulo III': { num: '', name: '' } };
const moduleLessonsMap = { 'Módulo I': { start: 1, end: 9 }, 'Módulo II': { start: 10, end: 21 }, 'Módulo III': { start: 22, end: 33 } };

// TOASTS
window.showToast = function(message, type = 'success') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = type === 'success' ? `✅ ${message}` : `⚠️ ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4500); 
};

// ==========================================
// AUTENTICACIÓN FIREBASE
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        try {
            const userDoc = await getDoc(doc(db, "users", user.uid));
            currentUserRole = userDoc.exists() ? userDoc.data().role : 'estudiante';
        } catch(e) { currentUserRole = 'estudiante'; }

        document.getElementById('login-wrapper').style.display = 'none';
        document.getElementById('main-nav').style.display = 'flex';
        document.getElementById('main-container').style.display = 'block';
        
        if (currentUserRole === 'admin') document.body.classList.add('role-admin');
        else document.body.classList.remove('role-admin');

        showToast(`Bienvenido al sistema ESBAS`);
        fetchQuestions();
        if(currentUserRole === 'admin') fetchUsers();
    } else {
        document.body.classList.remove('role-admin');
        document.getElementById('login-wrapper').style.display = 'flex';
        document.getElementById('main-nav').style.display = 'none';
        document.getElementById('main-container').style.display = 'none';
    }
});

window.handleLogin = async function(e) {
    e.preventDefault();
    const inputUser = document.getElementById('login-user').value.trim().toLowerCase();
    const inputPass = document.getElementById('login-pass').value.trim();
    // Convertir nombre de usuario a formato email requerido por Firebase
    const email = inputUser.includes('@') ? inputUser : `${inputUser}@esbas.pe`;

    try {
        await signInWithEmailAndPassword(auth, email, inputPass);
    } catch (error) {
        showToast("Usuario o contraseña incorrectos.", "error");
    }
};

window.logout = function() {
    signOut(auth).then(() => {
        document.getElementById('login-user').value = '';
        document.getElementById('login-pass').value = '';
    });
};

// ==========================================
// GESTIÓN DE USUARIOS (Firestore)
// ==========================================
async function fetchUsers() {
    try {
        const querySnapshot = await getDocs(collection(db, "users"));
        appData.users = [];
        querySnapshot.forEach((doc) => { appData.users.push({ uid: doc.id, ...doc.data() }); });
        window.renderUsers();
    } catch (error) { console.error(error); }
}

window.renderUsers = function() {
    const tbody = document.getElementById('users-body');
    if(!tbody) return;
    tbody.innerHTML = '';
    appData.users.forEach(u => {
        const roleBadge = u.role === 'admin' ? '<span style="color:#f59e0b; font-weight:700;">Admin</span>' : 'Estudiante';
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:700;">${(u.email || '').split('@')[0].toUpperCase()}</td>
                <td style="font-family:monospace; color:var(--text-muted);">[Encriptado]</td>
                <td>${roleBadge}</td>
                <td><button class="action-btn btn-delete" onclick="deleteUserRecord('${u.uid}')">Borrar</button></td>
            </tr>
        `;
    });
};

window.saveUser = async function(e) {
    e.preventDefault();
    const username = document.getElementById('u-name').value.trim().toLowerCase();
    const password = document.getElementById('u-pass').value.trim();
    const role = document.getElementById('u-role').value;
    const email = `${username}@esbas.pe`;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await setDoc(doc(db, "users", userCredential.user.uid), { email: email, role: role, createdAt: new Date() });
        
        document.getElementById('u-name').value = '';
        document.getElementById('u-pass').value = '';
        showToast("Usuario registrado.");
        fetchUsers();
    } catch (error) { showToast(error.message, "error"); }
};

window.deleteUserRecord = async function(uid) {
    if(confirm("Se eliminarán sus permisos. ¿Continuar?")) {
        await deleteDoc(doc(db, "users", uid));
        fetchUsers();
        showToast("Usuario eliminado del listado.");
    }
};

// ==========================================
// CRUD PREGUNTAS (Firestore)
// ==========================================
window.setCloudStatus = function(status) {
    document.querySelectorAll('.cloud-status').forEach(indicator => {
        indicator.className = 'cloud-status admin-only ' + status;
        if(status === 'success') indicator.innerHTML = '☁️ Sincronizado';
        if(status === 'syncing') indicator.innerHTML = '🔄 Guardando...';
        if(status === 'error') indicator.innerHTML = '⚠️ Error';
    });
};

async function fetchQuestions() {
    window.setCloudStatus('syncing');
    try {
        const querySnapshot = await getDocs(collection(db, "questions"));
        appData.questions = [];
        querySnapshot.forEach((doc) => { appData.questions.push({ id: doc.id, ...doc.data() }); });
        window.updateIndexesAndCounters();
        window.renderRepo();
        window.renderTable();
        window.setCloudStatus('success');
    } catch (error) {
        window.setCloudStatus('error');
        showToast("Error de conexión a la base de datos.", "error");
    }
}

window.saveQuestion = async function(e) {
    if(e) e.preventDefault();
    const form = document.getElementById('questionForm');
    if (!form.checkValidity()) {
        const invalidElement = form.querySelector(':invalid');
        if (invalidElement) {
            const stepContainer = invalidElement.closest('.form-step');
            if (stepContainer) {
                window.goToStep(parseInt(stepContainer.id.replace('step-', '')));
                showToast("Completa los campos obligatorios.", "error");
                setTimeout(() => invalidElement.focus(), 300);
            }
        }
        return; 
    }

    const id = document.getElementById('q-id').value;
    const currentModule = document.getElementById('q-module').value;
    const currentLessonNum = document.getElementById('q-lesson').value;
    const currentQNum = document.getElementById('q-num').value;
    const currentLessonName = document.getElementById('q-lesson-name').value;
    const qText = document.getElementById('q-text').value.trim();
    const optA = document.getElementById('q-opt-a').value.trim();
    const optB = document.getElementById('q-opt-b').value.trim();
    const optC = document.getElementById('q-opt-c').value.trim();
    const optD = document.getElementById('q-opt-d').value.trim();
    
    const checkedRadio = document.querySelector('input[name="q-correct"]:checked');
    if(!checkedRadio) { showToast("Selecciona la respuesta correcta.", "error"); return; }

    const optsLower = [optA, optB, optC, optD].map(o => o.toLowerCase());
    if (new Set(optsLower).size < 4) { showToast("Error: Tienes alternativas idénticas.", "error"); return; }

    const nuevaPregunta = {
        modulo: currentModule, leccion_num: Number(currentLessonNum), leccion_nombre: currentLessonName,
        pregunta_num: Number(currentQNum), pregunta: qText,
        opciones: { a: optA, b: optB, c: optC, d: optD }, respuesta: checkedRadio.value
    };

    window.setCloudStatus('syncing');
    try {
        if (id) await setDoc(doc(db, "questions", id), nuevaPregunta);
        else await addDoc(collection(db, "questions"), nuevaPregunta);
        
        formMemory.lastModule = currentModule;
        formMemory[currentModule].num = currentLessonNum;
        formMemory[currentModule].name = currentLessonName;

        window.closeModal();
        fetchQuestions();
    } catch(error) {
        showToast("Error al guardar.", "error");
        window.setCloudStatus('error');
    }
};

window.deleteQuestion = async function(id) {
    if(confirm("¿Estás seguro de eliminar permanentemente esta pregunta?")) {
        window.setCloudStatus('syncing');
        try {
            await deleteDoc(doc(db, "questions", id));
            fetchQuestions();
        } catch (error) { window.setCloudStatus('error'); }
    }
};

// ==========================================
// UI Y NAVEGACIÓN
// ==========================================
window.switchView = function(viewName) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-links button').forEach(el => el.classList.remove('active'));
    document.getElementById(`view-${viewName}`).classList.add('active');
    document.getElementById(`btn-${viewName}`).classList.add('active');
    if(viewName === 'repo') window.renderRepo();
    if(viewName === 'config') window.renderTable();
    if(viewName === 'users') window.renderUsers();
};

window.updateIndexesAndCounters = function() {
    appData.questions.sort((a,b) => {
        if(a.modulo !== b.modulo) return (a.modulo || '').localeCompare(b.modulo || '');
        if(parseInt(a.leccion_num) !== parseInt(b.leccion_num)) return parseInt(a.leccion_num || 0) - parseInt(b.leccion_num || 0);
        return parseInt(a.pregunta_num || 0) - parseInt(b.pregunta_num || 0);
    });

    document.getElementById('global-count-badge').innerText = `${appData.questions.length} Preguntas`;
    const modContainer = document.getElementById('moduleFilters');
    modContainer.innerHTML = `<button class="filter-btn ${activeModuleFilter==='all'?'active':''}" onclick="setModuleFilter('all')">Todos <span class="badge-count">${appData.questions.length}</span></button>`;
    ['Módulo I', 'Módulo II', 'Módulo III'].forEach(mod => {
        const count = appData.questions.filter(q => q.modulo === mod).length;
        modContainer.innerHTML += `<button class="filter-btn ${activeModuleFilter===mod?'active':''}" onclick="setModuleFilter('${mod}')">${mod} <span class="badge-count">${count}</span></button>`;
    });
};

window.setModuleFilter = function(moduleName) {
    activeModuleFilter = moduleName;
    activeLessonFilter = 'all';
    window.updateIndexesAndCounters(); 

    const lessonContainer = document.getElementById('lessonFiltersContainer');
    if(moduleName === 'all') {
        lessonContainer.classList.remove('active');
    } else {
        const range = moduleLessonsMap[moduleName];
        const modCount = appData.questions.filter(q => q.modulo === moduleName).length;
        let html = `<button class="lesson-btn active" onclick="setLessonFilter('all', this)">Todas <span class="badge-count">${modCount}</span></button>`;
        if(range) {
            for(let i = range.start; i <= range.end; i++) {
                const count = appData.questions.filter(q => q.modulo === moduleName && parseInt(q.leccion_num) === i).length;
                html += `<button class="lesson-btn" onclick="setLessonFilter('${i}', this)">L-${i} <span class="badge-count">${count}</span></button>`;
            }
        }
        lessonContainer.innerHTML = html;
        lessonContainer.classList.add('active');
    }
    window.renderRepo();
};

window.setLessonFilter = function(lessonNumberStr, btnElement) {
    activeLessonFilter = lessonNumberStr;
    document.querySelectorAll('.lesson-btn').forEach(b => b.classList.remove('active'));
    btnElement.classList.add('active');
    window.renderRepo();
};

window.renderRepo = function() {
    const container = document.getElementById('repo-container');
    const searchTxt = (document.getElementById('searchInput').value || '').toLowerCase();
    container.innerHTML = '';

    const filtered = appData.questions.filter(q => {
        const numRaw = String(q.leccion_num).replace(/\D/g, ''); 
        const matchesModule = activeModuleFilter === 'all' || q.modulo === activeModuleFilter;
        const matchesLesson = activeLessonFilter === 'all' || numRaw === activeLessonFilter;
        const fullStr = `Lección ${numRaw} ${q.leccion_nombre || ''} ${q.pregunta || ''}`.toLowerCase();
        return matchesModule && matchesLesson && fullStr.includes(searchTxt);
    });

    if (filtered.length === 0) {
        container.innerHTML = `<div class="empty-state"><text>📂</text><h3>Sin resultados</h3></div>`;
        return;
    }

    filtered.forEach((q, i) => {
        const numRaw = String(q.leccion_num).replace(/\D/g, ''); 
        const lessonBadge = q.leccion_nombre ? `L${numRaw} - ${q.leccion_nombre}` : `L${numRaw}`;
        const correctText = q.opciones ? q.opciones[q.respuesta] : 'N/A';
        const pNum = q.pregunta_num || "?"; 
        const delay = i > 15 ? 0 : i * 0.05;
        const editBtn = `<button class="btn-card-edit admin-only" onclick="event.stopPropagation(); openModal('edit', '${q.id}')">✏️ Editar</button>`;

        container.innerHTML += `
            <div class="flashcard-wrapper" style="animation-delay: ${delay}s" onclick="this.classList.toggle('flipped')">
                <div class="flashcard">
                    <div class="flashcard-front">
                        <span class="q-number-badge">Pregunta #${pNum}</span>
                        ${editBtn}
                        <div class="meta-tags"><span class="tag">${q.modulo || 'Sin módulo'}</span><span class="tag tag-lesson">${lessonBadge}</span></div>
                        <div style="font-size: 1.1rem; font-weight: 500; padding-right: 6rem; line-height: 1.4;">${q.pregunta || 'Sin enunciado'}</div>
                        <div class="flip-hint"><span>👆</span> Clic para voltear</div>
                    </div>
                    <div class="flashcard-back">
                        <div style="color: var(--success); font-weight: 700; font-size: 0.9rem; text-transform: uppercase; margin-bottom: 0.5rem; letter-spacing: 1px;">Pregunta #${pNum} | Clave Correcta</div>
                        <div style="font-size: 1.25rem; font-weight: 600; color: var(--text-dark);">${(q.respuesta || 'N/A').toUpperCase()}) ${correctText}</div>
                    </div>
                </div>
            </div>
        `;
    });
};

window.renderTable = function() {
    const tbody = document.getElementById('table-body');
    tbody.innerHTML = '';
    appData.questions.forEach(q => {
        const numRaw = String(q.leccion_num).replace(/\D/g, '');
        const lessonBadge = q.leccion_nombre ? `L${numRaw} - ${q.leccion_nombre}` : `L${numRaw}`;
        tbody.innerHTML += `
            <tr>
                <td style="font-weight:700; color:var(--primary-red);">#${q.pregunta_num || '?'}</td>
                <td><span class="tag">${q.modulo || 'N/A'}</span></td>
                <td>${lessonBadge}</td>
                <td>${(q.pregunta || '').substring(0, 50)}...</td>
                <td>
                    <button class="action-btn btn-edit" onclick="openModal('edit', '${q.id}')">Editar</button>
                    <button class="action-btn btn-delete" onclick="deleteQuestion('${q.id}')">Borrar</button>
                </td>
            </tr>
        `;
    });
};

// FORM Y WIZARD
window.handleModuleMemory = function(selectedModule) {
    if (!selectedModule) return;
    if (formMemory[selectedModule].num !== '') {
        document.getElementById('q-lesson').value = formMemory[selectedModule].num;
        document.getElementById('q-lesson-name').value = formMemory[selectedModule].name;
    }
};

window.autoFillLessonName = function() {
    const numInput = document.getElementById('q-lesson').value.trim();
    if(!numInput) return;
    const existing = appData.questions.find(q => String(q.leccion_num).replace(/\D/g, '') === numInput && (q.leccion_nombre || '').trim() !== '');
    if(existing) document.getElementById('q-lesson-name').value = existing.leccion_nombre;
};

window.autoIncrementQuestionNumber = function() {
    const mod = document.getElementById('q-module').value;
    const lec = document.getElementById('q-lesson').value.trim();
    if (!document.getElementById('q-id').value && mod && lec) {
        const questionsInLesson = appData.questions.filter(q => q.modulo === mod && String(q.leccion_num) === lec);
        if (questionsInLesson.length === 0) document.getElementById('q-num').value = 1;
        else {
            const maxNum = Math.max(...questionsInLesson.map(q => parseInt(q.pregunta_num) || 0));
            document.getElementById('q-num').value = maxNum + 1;
        }
    }
};

window.goToStep = function(step) {
    document.querySelectorAll('.form-step').forEach(el => el.classList.remove('active'));
    document.getElementById(`step-${step}`).classList.add('active');
    document.querySelectorAll('.wizard-dot').forEach((el, index) => {
        if(index < step) el.classList.add('active'); else el.classList.remove('active');
    });
};

window.openModal = function(mode, id = null) {
    document.getElementById('modal-form').classList.add('active');
    window.goToStep(1); 
    
    if (mode === 'new') {
        document.getElementById('modal-title').innerText = "Registrar Pregunta";
        document.getElementById('q-id').value = '';
        
        if (formMemory.lastModule !== '') {
            document.getElementById('q-module').value = formMemory.lastModule;
            document.getElementById('q-lesson').value = formMemory[formMemory.lastModule].num;
            document.getElementById('q-lesson-name').value = formMemory[formMemory.lastModule].name;
            window.autoIncrementQuestionNumber(); 
        } else {
            document.getElementById('q-module').value = '';
            document.getElementById('q-lesson').value = '';
            document.getElementById('q-lesson-name').value = '';
            document.getElementById('q-num').value = '';
        }
        
        document.getElementById('q-text').value = '';
        document.getElementById('q-opt-a').value = '';
        document.getElementById('q-opt-b').value = '';
        document.getElementById('q-opt-c').value = '';
        document.getElementById('q-opt-d').value = '';
        document.querySelectorAll('input[name="q-correct"]').forEach(r => r.checked = false);

    } else if (mode
