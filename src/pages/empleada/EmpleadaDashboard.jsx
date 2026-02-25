import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, where, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function EmpleadaDashboard() {
    const { user, userData } = useAuth();
    const { showToast } = useToast();
    const [tab, setTab] = useState('pendientes');
    const [jobs, setJobs] = useState([]);
    const [payments, setPayments] = useState([]);

    useEffect(() => {
        if (user) loadData();
    }, [user]);

    async function loadData() {
        // Load jobs assigned to this employee
        const jobSnap = await getDocs(query(collection(db, 'servicios'), where('empleadaId', '==', user.uid)));
        setJobs(jobSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Load payments
        const paySnap = await getDocs(query(collection(db, 'pagos'), where('empleadaId', '==', user.uid), orderBy('creadoEn', 'desc')));
        setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    async function updateJobStatus(id, newStatus) {
        await updateDoc(doc(db, 'servicios', id), { estado: newStatus });
        setJobs(prev => prev.map(j => j.id === id ? { ...j, estado: newStatus } : j));
        showToast(`Servicio actualizado: ${newStatus}`, 'success');
    }

    const pendientes = jobs.filter(j => j.estado === 'asignado');
    const enProgreso = jobs.filter(j => j.estado === 'en_progreso' || j.estado === 'aceptado');
    const completados = jobs.filter(j => j.estado === 'completado');

    const statusBanner = () => {
        if (userData?.estado === 'pendiente') return <div className="status-banner pending">⏳ Tu cuenta está pendiente de aprobación. El admin revisará tu registro.</div>;
        if (userData?.estado === 'bloqueado') return <div className="status-banner blocked">🚫 Tu cuenta ha sido bloqueada. Contacta al admin.</div>;
        return null;
    };

    const renderJobs = (list, actions) => {
        if (list.length === 0) return <div className="empty-state"><div className="empty-icon">📋</div><h3>Sin trabajos</h3><p>No hay servicios en esta categoría</p></div>;
        return (
            <div className="job-cards">
                {list.map(j => (
                    <div key={j.id} className="job-card">
                        <div className="job-card-header">
                            <h4>{j.clienteNombre}</h4>
                            <span className={`badge badge-${j.estado === 'completado' ? 'completed' : j.estado === 'en_progreso' || j.estado === 'aceptado' ? 'inprogress' : 'assigned'}`}>{j.estado}</span>
                        </div>
                        <div className="job-detail"><span className="job-detail-icon">📌</span> {j.tipoServicio}</div>
                        <div className="job-detail"><span className="job-detail-icon">📍</span> {j.clienteDireccion || 'Sin dirección'}</div>
                        <div className="job-detail"><span className="job-detail-icon">📞</span> {j.clienteTelefono || '—'}</div>
                        {j.notas && <div className="job-detail"><span className="job-detail-icon">📝</span> {j.notas}</div>}
                        <div className="job-card-footer">
                            <span className="job-price">RD${j.precio?.toLocaleString()}</span>
                            <div className="flex gap-2">{actions(j)}</div>
                        </div>
                    </div>
                ))}
            </div>
        );
    };

    return (
        <>
            <div className="page-header">
                <div><h1 className="page-title">Mis Trabajos</h1><p className="page-subtitle">Gestiona tus servicios asignados</p></div>
            </div>
            <div className="page-body">
                {statusBanner()}

                <div className="empleada-header">
                    <div className="empleada-avatar">{(userData?.nombre || 'E')[0].toUpperCase()}</div>
                    <div>
                        <h3>{userData?.nombre || 'Empleada'}</h3>
                        <div className="text-sm text-muted">{userData?.email}</div>
                    </div>
                </div>

                <div className="tabs">
                    <button className={`tab-btn${tab === 'pendientes' ? ' active' : ''}`} onClick={() => setTab('pendientes')}>📩 Pendientes ({pendientes.length})</button>
                    <button className={`tab-btn${tab === 'progreso' ? ' active' : ''}`} onClick={() => setTab('progreso')}>🔄 En Progreso ({enProgreso.length})</button>
                    <button className={`tab-btn${tab === 'completados' ? ' active' : ''}`} onClick={() => setTab('completados')}>✅ Completados ({completados.length})</button>
                    <button className={`tab-btn${tab === 'pagos' ? ' active' : ''}`} onClick={() => setTab('pagos')}>💰 Mis Pagos ({payments.length})</button>
                </div>

                {tab === 'pendientes' && renderJobs(pendientes, (j) => (
                    <>
                        <button className="btn btn-success btn-sm" onClick={() => updateJobStatus(j.id, 'aceptado')}>Aceptar</button>
                        <button className="btn btn-danger btn-sm" onClick={() => updateJobStatus(j.id, 'cancelado')}>Rechazar</button>
                    </>
                ))}

                {tab === 'progreso' && renderJobs(enProgreso, (j) => (
                    <>
                        {j.estado === 'aceptado' && <button className="btn btn-primary btn-sm" onClick={() => updateJobStatus(j.id, 'en_progreso')}>▶️ Iniciar</button>}
                        {j.estado === 'en_progreso' && <button className="btn btn-success btn-sm" onClick={() => updateJobStatus(j.id, 'completado')}>✅ Completar</button>}
                    </>
                ))}

                {tab === 'completados' && renderJobs(completados, () => null)}

                {tab === 'pagos' && (
                    <div className="panel-section">
                        <div className="panel-section-body no-pad">
                            {payments.length === 0 ? (
                                <div className="empty-state"><div className="empty-icon">💰</div><h3>Sin pagos</h3><p>No tienes pagos registrados</p></div>
                            ) : payments.map(p => (
                                <div key={p.id} className="payment-item">
                                    <div>
                                        <strong>{p.clienteNombre}</strong>
                                        <div className="payment-date">RD${p.pagoEmpleada?.toLocaleString()} de RD${p.montoTotal?.toLocaleString()}</div>
                                    </div>
                                    <span className="payment-amount">RD${p.pagoEmpleada?.toLocaleString()}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
