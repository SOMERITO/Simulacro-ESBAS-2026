// VERSIÓN: V3
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
    toast.innerHTML = type === 'success' ? `✅ \({message}` : `⚠️\){message}`;
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

// LOGIN MEJORADO (V3)
window.handleLogin = async function(e) {
    e.preventDefault();
    const inputUser = document.getElementById('login-user').value.trim().toLowerCase();
    const inputPass = document.getElementById('login-pass').value.trim();
    const email = inputUser.includes('@') ? inputUser : `${inputUser}@esbas.pe`;

    try {
        await signInWithEmailAndPassword(auth, email, inputPass);
    } catch (error) {
        console.error("Error Auth:", error.code);
        if(error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
            showToast("Usuario no encontrado. Asegúrate de haberlo registrado en Firebase.", "error");
        } else if (error.code === 'auth/wrong-password') {
            showToast("La contraseña es incorrecta.", "error");
        } else {
            showToast("Fallo de acceso: " + error.message, "error");
        }
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
        const roleBadge = u.role === 'admin' ? 'Admin' : 'Estudiante';
        tbody.innerHTML += `
