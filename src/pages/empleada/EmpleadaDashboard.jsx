import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, addDoc, query, where, orderBy, runTransaction, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function EmpleadaDashboard() {
    const { user, userData } = useAuth();
    const { showToast } = useToast();
    const [tab, setTab] = useState('servicios');
    const [services, setServices] = useState([]);
    const [visitas, setVisitas] = useState([]);
    const [payments, setPayments] = useState([]);
    const [expandedSvc, setExpandedSvc] = useState(null);

    useEffect(() => { if (user) loadData(); }, [user]);

    async function loadData() {
        const jobSnap = await getDocs(query(collection(db, 'servicios'), where('empleadaId', '==', user.uid)));
        setServices(jobSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const visitSnap = await getDocs(query(collection(db, 'visitas'), where('empleadaId', '==', user.uid), orderBy('numeroVisita', 'asc')));
        setVisitas(visitSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const paySnap = await getDocs(query(collection(db, 'pagos'), where('empleadaId', '==', user.uid), orderBy('creadoEn', 'desc')));
        setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    function getVisitsForService(svcId) {
        return visitas.filter(v => v.servicioId === svcId);
    }

    function getProgress(svcId) {
        const svcVisits = getVisitsForService(svcId);
        if (svcVisits.length === 0) return { completed: 0, total: 0, percent: 0 };
        const completed = svcVisits.filter(v => v.estado === 'completada').length;
        return { completed, total: svcVisits.length, percent: Math.round((completed / svcVisits.length) * 100) };
    }

    async function completeVisit(visit) {
        try {
            await runTransaction(db, async (transaction) => {
                const visitRef = doc(db, 'visitas', visit.id);
                transaction.update(visitRef, { estado: 'completada', completadaEn: serverTimestamp() });
            });
            await addDoc(collection(db, 'ingresos'), {
                tipo: 'servicio', servicioId: visit.servicioId, visitaId: visit.id,
                descripcion: `Visita #${visit.numeroVisita} — ${visit.clienteNombre} (${visit.tipoServicio})`,
                monto: visit.precioPorVisita || 0, creadoEn: serverTimestamp()
            });
            showToast(`✅ Visita #${visit.numeroVisita} completada`, 'success');
            loadData();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    const statusBanner = () => {
        if (userData?.estado === 'pendiente') return <div className="status-banner pending">⏳ Tu cuenta está pendiente de aprobación.</div>;
        if (userData?.estado === 'bloqueado') return <div className="status-banner blocked">🚫 Tu cuenta ha sido bloqueada.</div>;
        return null;
    };

    const activeServices = services.filter(s => s.estado === 'activo');
    const completedServices = services.filter(s => s.estado === 'completado');
    const pendingVisits = visitas.filter(v => v.estado === 'pendiente');
    const completedVisits = visitas.filter(v => v.estado === 'completada');
    const totalHoras = completedVisits.reduce((s, v) => s + (v.horasPorVisita || 0), 0);

    return (
        <>
            <div className="page-header">
                <div><h1 className="page-title">Mis Trabajos</h1><p className="page-subtitle">Servicios, visitas y progreso</p></div>
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

                {/* Stats */}
                <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', marginBottom: 20 }}>
                    <div className="glass stat-card stat-green"><div className="stat-value">{activeServices.length}</div><div className="stat-label">Servicios activos</div></div>
                    <div className="glass stat-card stat-blue"><div className="stat-value">{pendingVisits.length}</div><div className="stat-label">Visitas pend.</div></div>
                    <div className="glass stat-card stat-purple"><div className="stat-value">{completedVisits.length}</div><div className="stat-label">Completadas</div></div>
                    <div className="glass stat-card stat-amber"><div className="stat-value">{totalHoras}h</div><div className="stat-label">Horas trabajadas</div></div>
                </div>

                {/* Tabs */}
                <div className="tabs">
                    <button className={`tab-btn${tab === 'servicios' ? ' active' : ''}`} onClick={() => setTab('servicios')}>📋 Servicios ({activeServices.length})</button>
                    <button className={`tab-btn${tab === 'visitas' ? ' active' : ''}`} onClick={() => setTab('visitas')}>📅 Próximas Visitas ({pendingVisits.length})</button>
                    <button className={`tab-btn${tab === 'historial' ? ' active' : ''}`} onClick={() => setTab('historial')}>✅ Historial ({completedServices.length})</button>
                    <button className={`tab-btn${tab === 'pagos' ? ' active' : ''}`} onClick={() => setTab('pagos')}>💰 Mis Pagos</button>
                </div>

                {/* TAB: SERVICIOS (with detail + progress) */}
                {tab === 'servicios' && (
                    <div>
                        {activeServices.length === 0 ? (
                            <div className="panel-section"><div className="empty-state"><div className="empty-icon">📋</div><h3>Sin servicios activos</h3></div></div>
                        ) : activeServices.map(s => {
                            const prog = getProgress(s.id);
                            const svcVisits = getVisitsForService(s.id);
                            const isExpanded = expandedSvc === s.id;

                            return (
                                <div key={s.id} className="panel-section" style={{ marginBottom: 12 }}>
                                    <div className="panel-section-body" style={{ cursor: 'pointer' }} onClick={() => setExpandedSvc(isExpanded ? null : s.id)}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                                            <div>
                                                <h4 style={{ margin: 0 }}>{s.clienteNombre}</h4>
                                                <div className="text-sm text-muted">📌 {s.tipoServicio} • 📍 {s.clienteDireccion || '—'} • 📞 {s.clienteTelefono || '—'}</div>
                                            </div>
                                            <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary-light)' }}>RD${(s.precioTotal || s.precio)?.toLocaleString()}</span>
                                        </div>

                                        {/* Service details grid */}
                                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))', gap: 8, marginBottom: 12, padding: 12, background: 'rgba(108,63,197,0.06)', borderRadius: 10 }}>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800 }}>{s.semanas || '—'}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Semanas</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800 }}>{s.frecuencia || '—'}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Vis/semana</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800 }}>{s.horasPorVisita || '—'}h</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Hrs/visita</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800 }}>{s.totalVisitas || '—'}</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total visitas</div>
                                            </div>
                                            <div style={{ textAlign: 'center' }}>
                                                <div style={{ fontSize: 18, fontWeight: 800 }}>{s.totalHoras || '—'}h</div>
                                                <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Total horas</div>
                                            </div>
                                        </div>

                                        {/* Progress bar */}
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                            <div style={{ flex: 1, height: 10, borderRadius: 5, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                                <div style={{
                                                    height: '100%', borderRadius: 5, transition: 'width 0.5s',
                                                    width: `${prog.percent}%`,
                                                    background: prog.percent === 100 ? '#10B981' : prog.percent > 50 ? '#3B82F6' : 'var(--primary)'
                                                }} />
                                            </div>
                                            <span style={{ fontWeight: 700, fontSize: 14, color: prog.percent === 100 ? '#10B981' : 'var(--text)', minWidth: 90, textAlign: 'right' }}>
                                                {prog.completed}/{prog.total} ({prog.percent}%)
                                            </span>
                                        </div>

                                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4, textAlign: 'right' }}>
                                            {isExpanded ? '▲ Ocultar visitas' : '▼ Ver visitas'}
                                        </div>
                                    </div>

                                    {/* Expanded visits */}
                                    {isExpanded && (
                                        <div style={{ padding: '0 16px 16px' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
                                                {svcVisits.map(v => {
                                                    const fechaStr = v.fechaProgramada?.toDate ? v.fechaProgramada.toDate().toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
                                                    return (
                                                        <div key={v.id} style={{
                                                            padding: 12, borderRadius: 8,
                                                            background: v.estado === 'completada' ? 'rgba(16,185,129,0.08)' : v.estado === 'cancelada' ? 'rgba(239,68,68,0.08)' : 'var(--glass)',
                                                            border: `1px solid ${v.estado === 'completada' ? 'rgba(16,185,129,0.2)' : v.estado === 'cancelada' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                                <span style={{ fontWeight: 700, fontSize: 13 }}>
                                                                    {v.estado === 'completada' ? '✅' : v.estado === 'cancelada' ? '❌' : '⏳'} Visita #{v.numeroVisita}
                                                                </span>
                                                                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{fechaStr}</span>
                                                            </div>
                                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                                                                ⏱️ {v.horasPorVisita}h • 💰 RD${(v.precioPorVisita || 0).toLocaleString()}
                                                            </div>
                                                            {v.estado === 'pendiente' && (
                                                                <button className="btn btn-success btn-sm" style={{ marginTop: 8, width: '100%' }} onClick={(e) => { e.stopPropagation(); completeVisit(v); }}>
                                                                    ✅ Marcar Completada
                                                                </button>
                                                            )}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}

                {/* TAB: PROXIMAS VISITAS */}
                {tab === 'visitas' && (
                    <div className="panel-section">
                        <div className="panel-section-body no-pad">
                            {pendingVisits.length === 0 ? (
                                <div className="empty-state"><div className="empty-icon">📅</div><h3>Sin visitas pendientes</h3></div>
                            ) : pendingVisits.sort((a, b) => {
                                const dA = a.fechaProgramada?.toDate?.() || new Date(9999, 0);
                                const dB = b.fechaProgramada?.toDate?.() || new Date(9999, 0);
                                return dA - dB;
                            }).map(v => {
                                const fechaStr = v.fechaProgramada?.toDate ? v.fechaProgramada.toDate().toLocaleDateString('es-DO', { weekday: 'long', day: 'numeric', month: 'long' }) : '—';
                                return (
                                    <div key={v.id} className="service-item">
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 700 }}>Visita #{v.numeroVisita} — {v.clienteNombre}</div>
                                            <div className="service-meta">
                                                <span>📌 {v.tipoServicio}</span>
                                                <span>📅 {fechaStr}</span>
                                                <span>⏱️ {v.horasPorVisita}h</span>
                                            </div>
                                        </div>
                                        <div className="flex gap-2" style={{ alignItems: 'center' }}>
                                            <span style={{ fontWeight: 700, color: 'var(--primary-light)' }}>RD${(v.precioPorVisita || 0).toLocaleString()}</span>
                                            <button className="btn btn-success btn-sm" onClick={() => completeVisit(v)}>✅ Completar</button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* TAB: HISTORIAL */}
                {tab === 'historial' && (
                    <div className="panel-section">
                        <div className="panel-section-body no-pad">
                            {completedServices.length === 0 ? (
                                <div className="empty-state"><div className="empty-icon">✅</div><h3>Sin servicios completados</h3></div>
                            ) : completedServices.map(s => {
                                const prog = getProgress(s.id);
                                return (
                                    <div key={s.id} className="service-item">
                                        <div style={{ flex: 1 }}>
                                            <strong>{s.clienteNombre}</strong>
                                            <div className="service-meta">
                                                <span>📌 {s.tipoServicio}</span>
                                                <span>✅ {prog.completed}/{prog.total} visitas</span>
                                                <span>⏱️ {s.totalHoras}h total</span>
                                            </div>
                                        </div>
                                        <span className="service-price">RD${(s.precioTotal || s.precio)?.toLocaleString()}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* TAB: PAGOS */}
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
