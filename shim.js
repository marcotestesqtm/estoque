/* Camada que dá ao app o mesmo "banco" e "usuário" que ele tinha dentro do Claude,
   mas usando Firebase (Auth do Google + Firestore). Não depende do Claude. */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, doc, collection,
  getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, onSnapshot, query, where, orderBy, limit }
  from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

const pronto = !Object.values(firebaseConfig).some(v => String(v).includes("COLE_AQUI"));
const emit = n => window.dispatchEvent(new Event(n));
window.__standalone = true;

if (!pronto) {
  window.__auth = { configurado: false };
  window.claude = { use: async () => null };
  emit("claude-ready");
} else {
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const fs = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });

  const limpa = o => JSON.parse(JSON.stringify(o)); // Firestore não aceita undefined
  const erro = e => { const c = e && e.code; throw { code: c === "permission-denied" ? "invalid_argument" : c || "erro", message: e && e.message }; };
  const dsnap = s => ({ id: s.id, exists: s.exists(), data: () => s.data(), metadata: s.metadata });
  const qsnap = s => ({ docs: s.docs.map(dsnap), size: s.size, empty: s.empty });

  function consulta(q) {
    return {
      where: (f, o, v) => consulta(query(q, where(f, o, v))),
      orderBy: (f, d) => consulta(query(q, orderBy(f, d || "asc"))),
      limit: n => consulta(query(q, limit(n))),
      get: () => getDocs(q).then(qsnap).catch(erro),
      onSnapshot: (cb, err) => onSnapshot(q, s => cb(qsnap(s)), e => err && err(e))
    };
  }
  function docRef(path) {
    const r = doc(fs, path);
    return {
      id: r.id, path,
      get: () => getDoc(r).then(dsnap).catch(erro),
      set: d => setDoc(r, limpa(d)).catch(erro),
      update: d => updateDoc(r, limpa(d)).catch(erro),
      delete: () => deleteDoc(r).catch(erro),
      onSnapshot: (cb, err) => onSnapshot(r, s => cb(dsnap(s)), e => err && err(e)),
      collection: c => colRef(path + "/" + c)
    };
  }
  function colRef(path) {
    const c = collection(fs, path);
    return {
      ...consulta(c), path,
      doc: id => docRef(path + "/" + (id || doc(c).id)),
      add: async d => { const r = await addDoc(c, limpa(d)).catch(erro); return docRef(path + "/" + r.id); }
    };
  }
  const db = { doc: docRef, collection: colRef };

  let usuario = null, ehDono = false;
  async function inicia(u) {
    usuario = u; ehDono = false;
    if (!u) return;
    const perfil = { name: u.displayName || "", email: u.email || "" };
    try { await setDoc(doc(fs, "perfis/" + u.uid), perfil); } catch (e) {}
    try {
      const o = await getDoc(doc(fs, "config/owner"));
      if (!o.exists()) { try { await setDoc(doc(fs, "config/owner"), { uid: u.uid, email: u.email || "" }); ehDono = true; } catch (e) {} }
      else ehDono = o.data().uid === u.uid;
    } catch (e) {}
  }

  const user = {
    isOwner: async () => ehDono, canEdit: async () => ehDono, can: async () => true,
    id: async () => usuario.uid,
    me: async () => ({ id: usuario.uid, name: usuario.displayName || "", email: usuario.email || "", isOwner: ehDono, canEdit: ehDono }),
    name: async () => usuario.displayName || "",
    profiles: async ids => {
      const out = {};
      await Promise.all([].concat(ids).map(async id => {
        try { const s = await getDoc(doc(fs, "perfis/" + id)); const d = s.exists() ? s.data() : {};
          out[id] = { id, name: d.name || "", email: d.email || null, isMe: usuario && id === usuario.uid, guest: false }; }
        catch (e) { out[id] = { id, name: "", email: null, isMe: false, guest: false }; }
      }));
      return out;
    },
    search: async q => {
      const s = await getDocs(query(collection(fs, "perfis"), limit(200)));
      const t = String(q || "").trim().toLowerCase();
      return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !t || (p.email || "").toLowerCase().includes(t) || (p.name || "").toLowerCase().includes(t)).slice(0, 20);
    }
  };

  const downloads = {
    save: async ({ filename, data }) => {
      const blob = data instanceof Blob ? data : new Blob([data]);
      try {
        const f = new File([blob], filename, { type: blob.type || "text/csv" });
        if (navigator.canShare && navigator.canShare({ files: [f] }) && /android|iphone|ipad/i.test(navigator.userAgent)) { await navigator.share({ files: [f], title: filename }); return { status: "saved" }; }
      } catch (e) { if (e && e.name === "AbortError") throw { code: "declined" }; }
      const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
      return { status: "saved" };
    }
  };

  window.__auth = {
    configurado: true,
    entrar: () => signInWithPopup(auth, new GoogleAuthProvider()),
    sair: () => signOut(auth)
  };
  window.claude = { use: async n => (n === "db" ? (usuario ? db : null) : n === "user" ? (usuario ? user : null) : n === "downloads" ? downloads : null) };

  let primeira = true;
  onAuthStateChanged(auth, async u => { await inicia(u); if (primeira) { primeira = false; emit("claude-ready"); } });
}
