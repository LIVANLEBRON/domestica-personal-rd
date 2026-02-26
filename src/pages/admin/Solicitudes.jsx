import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

const EXP_LABELS = { sin_experiencia: 'Sin exp.', menos_1: '< 1 año', '1_3': '1-3 años', '3_5': '3-5 años', mas_5: '5+ años' };
const TRASLADO_LABELS = { no: '✅ Sin problema', si: '❌ Con dificultad', depende: '⚠️ Depende' };

export default function Solicitudes() {
    const [pendingEmployees, setPendingEmployees] = useState([]);
    const [loading, setLoading] = useState(true);
    const { showToast } = useToast();

    useEffect(() => { loadPending(); }, []);

    async function loadPending() {
        setLoading(true);
        try {
            const empSnap = await getDocs(collection(db, 'empleadas'));

            const pending = [];
            for (const d of empSnap.docs) {
                const empData = d.data();

                // Directamente verificar si el estado es pendiente.
                // Como las `empleadas` solo son empleadas, no necesitamos chequear roles en la BD de `usuarios`
                if (empData.estado === 'pendiente') {
                    pending.push({ id: d.id, ...empData });
                }
            }
            // Sort newest first
            pending.sort((a, b) => (b.creadoEn?.seconds || 0) - (a.creadoEn?.seconds || 0));
            setPendingEmployees(pending);
        } catch (err) {
            console.error('[loadPending] Error cargando solicitudes:', err);
            showToast('Error cargando solicitudes', 'error');
        }
        setLoading(false);
    }

    async function changeStatus(id, newStatus) {
        if (!confirm(`¿Estás seguro de ${newStatus === 'activo' ? 'Aprobar' : 'Rechazar'} esta solicitud?`)) return;

        try {
            await updateDoc(doc(db, 'usuarios', id), { estado: newStatus });
            await updateDoc(doc(db, 'empleadas', id), { estado: newStatus });

            setPendingEmployees(prev => prev.filter(e => e.id !== id));
            showToast(newStatus === 'activo' ? '✅ Empleada aprobada y activada' : '❌ Empleada rechazada', 'success');
        } catch (err) {
            console.error(err);
            showToast('Error al cambiar el estado', 'error');
        }
    }

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Solicitudes Pendientes</h1>
                    <p className="page-subtitle">Revisa y aprueba perfiles de nuevas empleadas</p>
                </div>
            </div>

            <div className="page-body">
                {loading ? (
                    <div className="empty-state">
                        <div className="loading-spinner" style={{ width: 40, height: 40, marginBottom: 16 }} />
                        <h3>Cargando solicitudes...</h3>
                    </div>
                ) : pendingEmployees.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">✨</div>
                        <h3>¡Todo al día!</h3>
                        <p>No hay solicitudes pendientes en este momento.</p>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                        {pendingEmployees.map(emp => (
                            <div key={emp.id} className="glass" style={{ borderRadius: 16, border: '1px solid rgba(245,158,11,0.3)', overflow: 'hidden' }}>
                                <div style={{ background: 'rgba(245,158,11,0.08)', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: 16, borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
                                    {emp.fotoURL ? (
                                        <img src={emp.fotoURL} style={{ width: 64, height: 64, borderRadius: '50%', objectFit: 'cover', border: '2px solid #F59E0B', flexShrink: 0 }} alt={emp.nombre} />
                                    ) : (
                                        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(135deg, #F59E0B, #D97706)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 24, flexShrink: 0 }}>{(emp.nombre || 'E')[0]}</div>
                                    )}
                                    <div style={{ flex: 1 }}>
                                        <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>{emp.nombre || '—'}</div>
                                        <div style={{ color: 'var(--text-muted)' }}>{emp.email || '—'}</div>
                                    </div>
                                    <span className="badge badge-pending" style={{ fontSize: 13, padding: '6px 14px' }}>⏳ Pendiente</span>
                                </div>

                                <div style={{ padding: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24 }}>
                                    {/* Column 1: Info Data */}
                                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignContent: 'start' }}>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>📞 Teléfono</span><br /><strong style={{ fontSize: 14 }}>{emp.telefono || '—'}</strong></div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>🎂 Edad</span><br /><strong style={{ fontSize: 14 }}>{emp.edad ? `${emp.edad} años` : '—'}</strong></div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>📍 Sector</span><br /><strong style={{ fontSize: 14 }}>{emp.sector || emp.direccion || '—'}</strong></div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>🌍 Nacionalidad</span><br /><strong style={{ fontSize: 14 }}>{emp.nacionalidad || '—'}</strong></div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>🎯 Experiencia</span><br /><strong style={{ fontSize: 14 }}>{EXP_LABELS[emp.experiencia] || '—'}</strong></div>
                                        <div><span style={{ color: 'var(--text-muted)', fontSize: 12 }}>🚌 Traslado</span><br /><strong style={{ fontSize: 14 }}>{TRASLADO_LABELS[emp.traslado] || '—'}</strong></div>

                                        <div style={{ gridColumn: '1 / -1', marginTop: 8 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>📝 Referencias</span><br />
                                            {emp.referencias ? (
                                                <div style={{ marginTop: 6, padding: 12, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 8, fontSize: 14 }}>
                                                    {emp.referencias}
                                                </div>
                                            ) : (
                                                <strong style={{ fontSize: 14 }}>No proporcionó referencias</strong>
                                            )}
                                        </div>
                                    </div>

                                    {/* Column 2: Documents / Actions */}
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                        <div style={{ flex: 1 }}>
                                            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>📷 Foto de Cédula</span>
                                            {emp.cedulaURL ? (
                                                <a href={emp.cedulaURL} target="_blank" rel="noreferrer" style={{ display: 'block', marginTop: 8 }}>
                                                    <img src={emp.cedulaURL} alt="Cédula" style={{ width: '100%', maxHeight: 220, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--border)', background: 'rgba(0,0,0,0.2)' }} />
                                                </a>
                                            ) : (
                                                <div style={{ marginTop: 8, padding: 20, textAlign: 'center', background: 'rgba(239,68,68,0.06)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', color: 'var(--text-muted)' }}>
                                                    ⚠️ Esta empleada no subió foto de cédula
                                                </div>
                                            )}
                                        </div>

                                        <div style={{ display: 'flex', gap: 12, marginTop: 'auto' }}>
                                            <button className="btn btn-success" style={{ flex: 1, padding: '14px', fontSize: 15 }} onClick={() => changeStatus(emp.id, 'activo')}>✅ Aprobar</button>
                                            <button className="btn btn-danger" style={{ flex: 1, padding: '14px', fontSize: 15 }} onClick={() => changeStatus(emp.id, 'bloqueado')}>❌ Rechazar</button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </>
    );
}
