import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function Admins() {
    const { userData, user } = useAuth();
    const { showToast } = useToast();
    const [admins, setAdmins] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newAdmin, setNewAdmin] = useState({ email: '', nombre: '' });
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadAdmins();
    }, []);

    const loadAdmins = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'usuarios'));
            const adminList = [];
            snap.forEach(d => {
                if (d.data().rol === 'admin') {
                    adminList.push({ id: d.id, ...d.data() });
                }
            });
            setAdmins(adminList);
        } catch (error) {
            console.error('Error cargando admins', error);
            showToast('Error al cargar administradores', 'error');
        }
        setLoading(false);
    };

    const handlePromoteAdmin = async (e) => {
        e.preventDefault();
        if (!newAdmin.email.trim() || !newAdmin.nombre.trim()) {
            return showToast('Llena todos los campos', 'error');
        }

        setSaving(true);
        try {
            // Find user id by email
            const snap = await getDocs(collection(db, 'usuarios'));
            let targetUserId = null;
            snap.forEach(d => {
                if (d.data().email.toLowerCase() === newAdmin.email.toLowerCase()) {
                    targetUserId = d.id;
                }
            });

            if (targetUserId) {
                // Update existing user
                await setDoc(doc(db, 'usuarios', targetUserId), {
                    rol: 'admin',
                    nombre: newAdmin.nombre
                }, { merge: true });
                showToast('Administrador promovido exitosamente', 'success');
            } else {
                showToast('No se encontró un usuario con ese correo. Pídele que inicie sesión primero.', 'error');
            }

            setIsModalOpen(false);
            setNewAdmin({ email: '', nombre: '' });
            loadAdmins();
        } catch (error) {
            console.error('Error promoviendo admin', error);
            showToast('Error al procesar solicitud', 'error');
        }
        setSaving(false);
    };

    const handleRemoveAdmin = async (adminId) => {
        if (adminId === user.uid) {
            return showToast('No puedes quitarte tu propio acceso de administrador', 'error');
        }

        if (!confirm('¿Seguro que deseas remover a este administrador? Volverá a ser empleada.')) return;

        try {
            await setDoc(doc(db, 'usuarios', adminId), {
                rol: 'empleada'
            }, { merge: true });
            showToast('Administrador removido', 'success');
            loadAdmins();
        } catch (error) {
            console.error('Error removiendo admin', error);
            showToast('Error al remover administrador', 'error');
        }
    };

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Administradores</h1>
                    <p className="page-subtitle">Gestiona qué cuentas tienen acceso total al sistema</p>
                </div>
                <button className="btn btn-primary" onClick={() => setIsModalOpen(true)}>
                    + Añadir Admin
                </button>
            </div>

            <div className="page-body">
                {loading ? (
                    <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>Cargando administradores...</div>
                ) : (
                    <div className="profile-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
                        {admins.map(admin => (
                            <div key={admin.id} className="profile-section" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
                                {admin.fotoURL ? (
                                    <img src={admin.fotoURL} alt={admin.nombre} style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', marginBottom: 12, border: '3px solid var(--primary)' }} />
                                ) : (
                                    <div style={{ width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, marginBottom: 12 }}>
                                        {(admin.nombre || 'A')[0].toUpperCase()}
                                    </div>
                                )}
                                <h3 style={{ margin: '0 0 4px 0' }}>{admin.nombre || 'Administrador'}</h3>
                                <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 16 }}>{admin.email}</p>

                                {admin.id !== user.uid && (
                                    <button className="btn btn-danger btn-sm" onClick={() => handleRemoveAdmin(admin.id)}>
                                        Quitar Acceso
                                    </button>
                                )}
                                {admin.id === user.uid && (
                                    <span className="badge" style={{ background: 'rgba(59,130,246,0.1)', color: '#3b82f6' }}>✅ Este eres tú</span>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {isModalOpen && (
                <div className="modal-overlay">
                    <div className="modal-content">
                        <h3>Añadir Nuevo Administrador</h3>
                        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
                            El usuario debe haber iniciado sesión con Google en la app al menos una vez para registrar su correo.
                        </p>
                        <form onSubmit={handlePromoteAdmin}>
                            <div className="form-group">
                                <label className="form-label">Nombre del Administrador</label>
                                <input
                                    className="form-control"
                                    placeholder="Ej. Juan Pérez"
                                    value={newAdmin.nombre}
                                    onChange={e => setNewAdmin({ ...newAdmin, nombre: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Correo de Google (Exacto)</label>
                                <input
                                    type="email"
                                    className="form-control"
                                    placeholder="ejemplo@gmail.com"
                                    value={newAdmin.email}
                                    onChange={e => setNewAdmin({ ...newAdmin, email: e.target.value })}
                                    required
                                />
                            </div>
                            <div className="modal-actions mt-4">
                                <button type="button" className="btn btn-ghost" onClick={() => setIsModalOpen(false)}>Cancelar</button>
                                <button type="submit" className="btn btn-primary" disabled={saving}>
                                    {saving ? 'Guardando...' : 'Dar Acceso de Admin'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    );
}
