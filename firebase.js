// ============================================================
//  firebase.js — Firebase configuration & real-time data layer
//  IMPORTANT: Replace the firebaseConfig values with your own
//  Firebase project credentials from console.firebase.google.com
// ============================================================

const firebaseConfig = {
    apiKey: "AIzaSyAZ79E3d5MtZVNzK_VSPABLg3ZgXg13NcM",
    authDomain: "routine-hub-4cacb.firebaseapp.com",
    projectId: "routine-hub-4cacb",
    storageBucket: "routine-hub-4cacb.firebasestorage.app",
    messagingSenderId: "488749907746",
    appId: "1:488749907746:web:8d48f8d29095ada7afaf7b"
  };  

  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  
  const auth = firebase.auth();
  const db   = firebase.firestore();
  
  // Google Auth Provider
  const googleProvider = new firebase.auth.GoogleAuthProvider();
  googleProvider.addScope('email');
  googleProvider.addScope('profile');
  
  // ============================================================
  //  Active Firestore listeners — stored so we can unsubscribe
  // ============================================================
  const listeners = {};
  
  // ============================================================
  //  AUTH HELPERS
  // ============================================================
  
  async function signInWithGoogle() {
    try {
      const result = await auth.signInWithPopup(googleProvider);
      const user   = result.user;
      await ensureUserProfile(user);
      return { success: true, user };
    } catch (err) {
      console.error('Google sign-in error:', err);
      return { success: false, error: err.message };
    }
  }
  
  async function signInWithEmail(email, password) {
    try {
      const cred = await auth.signInWithEmailAndPassword(email, password);
      return { success: true, user: cred.user };
    } catch (err) {
      return { success: false, error: friendlyAuthError(err.code) };
    }
  }
  
  async function registerWithEmail(email, password, firstName, lastName) {
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, password);
      const user = cred.user;
      const displayName = `${firstName} ${lastName}`.trim();
  
      // Update Firebase Auth profile
      await user.updateProfile({ displayName });
  
      // Create Firestore user doc
      await ensureUserProfile(user, { firstName, lastName });
      return { success: true, user };
    } catch (err) {
      return { success: false, error: friendlyAuthError(err.code) };
    }
  }
  
  async function signOut() {
    unsubscribeAll();
    await auth.signOut();
  }
  
  async function resetPassword(email) {
    try {
      await auth.sendPasswordResetEmail(email);
      return { success: true };
    } catch (err) {
      return { success: false, error: friendlyAuthError(err.code) };
    }
  }
  
  // ============================================================
  //  USER PROFILE in Firestore
  // ============================================================
  
  async function ensureUserProfile(user, extra = {}) {
    const ref  = db.collection('users').doc(user.uid);
    const snap = await ref.get();
  
    if (!snap.exists) {
      // Parse display name into first/last
      const parts     = (user.displayName || '').split(' ');
      const firstName = extra.firstName || parts[0] || '';
      const lastName  = extra.lastName  || parts.slice(1).join(' ') || '';
  
      await ref.set({
        uid:         user.uid,
        email:       user.email,
        firstName,
        lastName,
        displayName: user.displayName || `${firstName} ${lastName}`.trim(),
        photoURL:    user.photoURL || '',
        createdAt:   firebase.firestore.FieldValue.serverTimestamp(),
      });
    } else if (user.photoURL && !snap.data().photoURL) {
      // Update photo if it was missing (Google login provides it)
      await ref.update({ photoURL: user.photoURL });
    }
  }
  
  async function getUserProfile(uid) {
    const snap = await db.collection('users').doc(uid).get();
    return snap.exists ? snap.data() : null;
  }
  
  // ============================================================
  //  REAL-TIME FIRESTORE CRUD HELPERS
  // ============================================================
  
  // Returns a user-scoped collection reference
  function userCol(uid, colName) {
    return db.collection('users').doc(uid).collection(colName);
  }
  
  // ---------- TASKS ----------
  function listenTasks(uid, callback) {
    listeners.tasks = userCol(uid, 'tasks')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const tasks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(tasks);
      }, err => console.error('Tasks listener error:', err));
  }
  
  async function addTaskDB(uid, task) {
    return userCol(uid, 'tasks').add({
      ...task,
      done:      false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function updateTaskDB(uid, taskId, updates) {
    return userCol(uid, 'tasks').doc(taskId).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function deleteTaskDB(uid, taskId) {
    return userCol(uid, 'tasks').doc(taskId).delete();
  }
  
  // ---------- EVENTS ----------
  function listenEvents(uid, callback) {
    listeners.events = userCol(uid, 'events')
      .orderBy('date', 'asc')
      .onSnapshot(snap => {
        const events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(events);
      }, err => console.error('Events listener error:', err));
  }
  
  async function addEventDB(uid, event) {
    return userCol(uid, 'events').add({
      ...event,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function deleteEventDB(uid, eventId) {
    return userCol(uid, 'events').doc(eventId).delete();
  }
  
  // ---------- SCHEDULE ----------
  function listenSchedule(uid, callback) {
    listeners.schedule = userCol(uid, 'schedule')
      .orderBy('start', 'asc')
      .onSnapshot(snap => {
        const blocks = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(blocks);
      }, err => console.error('Schedule listener error:', err));
  }
  
  async function addScheduleDB(uid, block) {
    return userCol(uid, 'schedule').add({
      ...block,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function deleteScheduleDB(uid, blockId) {
    return userCol(uid, 'schedule').doc(blockId).delete();
  }
  
  // ---------- PRIORITIES ----------
  function listenPriorities(uid, callback) {
    listeners.priorities = userCol(uid, 'priorities')
      .orderBy('order', 'asc')
      .onSnapshot(snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(items);
      }, err => console.error('Priorities listener error:', err));
  }
  
  async function addPriorityDB(uid, item) {
    const snap = await userCol(uid, 'priorities').get();
    return userCol(uid, 'priorities').add({
      ...item,
      order:     snap.size,
      done:      false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function updatePriorityDB(uid, id, updates) {
    return userCol(uid, 'priorities').doc(id).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function deletePriorityDB(uid, id) {
    return userCol(uid, 'priorities').doc(id).delete();
  }
  
  // ---------- HABITS ----------
  function listenHabits(uid, callback) {
    listeners.habits = userCol(uid, 'habits')
      .orderBy('createdAt', 'asc')
      .onSnapshot(snap => {
        const habits = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(habits);
      }, err => console.error('Habits listener error:', err));
  }
  
  async function addHabitDB(uid, habit) {
    return userCol(uid, 'habits').add({
      ...habit,
      streak:       0,
      completedDays: [],
      createdAt:    firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function updateHabitDB(uid, habitId, updates) {
    return userCol(uid, 'habits').doc(habitId).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function deleteHabitDB(uid, habitId) {
    return userCol(uid, 'habits').doc(habitId).delete();
  }
  
  // ---------- NOTES ----------
  function listenNotes(uid, callback) {
    listeners.notes = userCol(uid, 'notes')
      .orderBy('updatedAt', 'desc')
      .onSnapshot(snap => {
        const notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(notes);
      }, err => console.error('Notes listener error:', err));
  }
  
  async function addNoteDB(uid, note) {
    return userCol(uid, 'notes').add({
      ...note,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function updateNoteDB(uid, noteId, updates) {
    return userCol(uid, 'notes').doc(noteId).update({
      ...updates,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function deleteNoteDB(uid, noteId) {
    return userCol(uid, 'notes').doc(noteId).delete();
  }
  
  // ---------- REMINDERS ----------
  function listenReminders(uid, callback) {
    listeners.reminders = userCol(uid, 'reminders')
      .orderBy('time', 'asc')
      .onSnapshot(snap => {
        const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        callback(items);
      }, err => console.error('Reminders listener error:', err));
  }
  
  async function addReminderDB(uid, reminder) {
    return userCol(uid, 'reminders').add({
      ...reminder,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  }
  
  async function deleteReminderDB(uid, reminderId) {
    return userCol(uid, 'reminders').doc(reminderId).delete();
  }
  
  // ============================================================
  //  UNSUBSCRIBE ALL LISTENERS (called on sign-out)
  // ============================================================
  function unsubscribeAll() {
    Object.values(listeners).forEach(unsub => {
      if (typeof unsub === 'function') unsub();
    });
    Object.keys(listeners).forEach(k => delete listeners[k]);
  }
  
  // ============================================================
  //  FRIENDLY AUTH ERROR MESSAGES
  // ============================================================
  function friendlyAuthError(code) {
    const map = {
      'auth/email-already-in-use':    'This email is already registered. Try signing in.',
      'auth/invalid-email':           'Please enter a valid email address.',
      'auth/weak-password':           'Password must be at least 6 characters.',
      'auth/user-not-found':          'No account found with this email.',
      'auth/wrong-password':          'Incorrect password. Please try again.',
      'auth/too-many-requests':       'Too many attempts. Please wait a moment.',
      'auth/network-request-failed':  'Network error. Check your connection.',
      'auth/popup-closed-by-user':    'Sign-in popup was closed.',
      'auth/invalid-credential':      'Invalid credentials. Check email and password.',
    };
    return map[code] || 'An error occurred. Please try again.';
  }