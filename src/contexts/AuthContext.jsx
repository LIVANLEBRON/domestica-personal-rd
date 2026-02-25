import { createContext, useContext, useState, useEffect } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, signOut } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';

const AuthContext = createContext();
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [userData, setUserData] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const snap = await getDoc(doc(db, 'usuarios', firebaseUser.uid));
                if (snap.exists()) {
                    setUser(firebaseUser);
                    setUserData(snap.data());
                } else {
                    setUser(firebaseUser);
                    setUserData(null);
                }
            } else {
                setUser(null);
                setUserData(null);
            }
            setLoading(false);
        });
        return unsub;
    }, []);

    const login = (email, password) => signInWithEmailAndPassword(auth, email, password);

    const loginWithGoogle = async () => {
        const cred = await signInWithPopup(auth, googleProvider);
        const snap = await getDoc(doc(db, 'usuarios', cred.user.uid));
        if (!snap.exists()) {
            await setDoc(doc(db, 'usuarios', cred.user.uid), {
                nombre: cred.user.displayName || '',
                email: cred.user.email,
                rol: 'empleada',
                estado: 'pendiente',
                creadoEn: serverTimestamp()
            });
        }
        return cred;
    };

    const register = async (email, password, extraData) => {
        const cred = await createUserWithEmailAndPassword(auth, email, password);
        return { uid: cred.user.uid, user: cred.user };
    };

    const logout = () => signOut(auth);

    const refreshUserData = async () => {
        if (user) {
            const snap = await getDoc(doc(db, 'usuarios', user.uid));
            if (snap.exists()) setUserData(snap.data());
        }
    };

    return (
        <AuthContext.Provider value={{ user, userData, loading, login, loginWithGoogle, register, logout, refreshUserData }}>
            {children}
        </AuthContext.Provider>
    );
}
