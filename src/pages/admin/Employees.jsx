import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, getDoc } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

export default function Employees() {
    const [employees, setEmployees] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos');
    const [modalEmp, setModalEmp] = useState(null);
    const { showToast } = useToast();

    useEffect(() => { loadEmployees(); }, []);

    async function loadEmployees() {
        const snap = await getDocs(collection(db, 'empleadas'));
        const emps = [];
        for (const d of snap.docs) {
            const empData = d.data();
            const userSnap = await getDoc(doc(db, 'usuarios', d.id));
            const userData = userSnap.exists() ? userSnap.data() : {};
            if (userData.rol === 'admin') continue;
            emps.push({ id: d.id, ...empData, ...userData });
        }
        setEmployees(emps);
    }

    async function changeStatus(id, newStatus) {
        await updateDoc(doc(db, 'usuarios', id), { estado: newStatus });
        await updateDoc(doc(db, 'empleadas', id), { estado: newStatus });
        setEmployees(prev => prev.map(e => e.id === id ? { ...e, estado: newStatus } : e));
        showToast(`Estado cambiado a "${newStatus}"`, 'success');
        if (modalEmp?.id === id) setModalEmp(null);
    }

    const expLabels = { sin_experiencia: 'Sin exp.', menos_1: '< 1 año', '1_3': '1-3 años', '3_5': '3-5 años', mas_5: '5+ años' };
    const trasladoLabels = { no: '✅ Sin problema', si: '❌ Con dificultad', depende: '⚠️ Depende' };

    const filtered = employees.filter(e => {
        if (statusFilter !== 'todos' && e.estado !== statusFilter) return false;
        if (search && !(e.nombre || '').toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    function exportEmployees() {
        const data = employees.map(e => ({
            Nombre: e.nombre, Email: e.email, Edad: e.edad, Teléfono: e.telefono,
            Sector: e.sector || e.direccion, Nacionalidad: e.nacionalidad,
            Experiencia: e.experiencia, Traslado: e.traslado, Estado: e.estado
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Empleadas');
        XLSX.writeFile(wb, `Empleadas_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('📥 Excel descargado', 'success');
    }

    return (
        <>
            <div className="page-header">
                <div><h1 className="page-title">Gestión de Empleadas</h1><p className="page-subtitle">Aprueba, rechaza y administra las empleadas registradas</p></div>
            </div>
            <div className="page-body">
                <div className="toolbar">
                    <div className="search-bar">
                        <span className="search-icon">🔍</span>
                        <input placeholder="Buscar por nombre..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="todos">Todos los estados</option>
                        <option value="pendiente">⏳ Pendientes</option>
                        <option value="activo">✅ Activas</option>
                        <option value="bloqueado">🚫 Bloqueadas</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={exportEmployees}>📥 Excel</button>
                </div>

                <div className="panel-section">
                    <div className="panel-section-body no-pad">
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Nombre</th><th>Edad</th><th>Sector</th><th>Teléfono</th><th>Experiencia</th><th>Traslado</th><th>Estado</th><th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr><td colSpan="8" className="text-center text-muted" style={{ padding: 40 }}>No se encontraron empleadas</td></tr>
                                    ) : filtered.map(e => (
                                        <tr key={e.id}>
                                            <td data-label="Nombre"><strong>{e.nombre || '—'}</strong><br /><span className="text-sm text-muted">{e.email || ''}</span></td>
                                            <td data-label="Edad">{e.edad || '—'}</td>
                                            <td data-label="Sector" className="text-sm">{e.sector || e.direccion || '—'}</td>
                                            <td data-label="Teléfono">{e.telefono || '—'}</td>
                                            <td data-label="Experiencia">{expLabels[e.experiencia] || '—'}</td>
                                            <td data-label="Traslado" className="text-sm">{trasladoLabels[e.traslado] || '—'}</td>
                                            <td data-label="Estado"><span className={`badge badge-${e.estado === 'activo' ? 'active' : e.estado === 'pendiente' ? 'pending' : 'blocked'}`}>{e.estado}</span></td>
                                            <td data-label="Acciones">
                                                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                                                    {e.estado === 'pendiente' && <>
                                                        <button className="btn btn-success btn-sm" onClick={() => changeStatus(e.id, 'activo')}>✅ Aprobar</button>
                                                        <button className="btn btn-danger btn-sm" onClick={() => changeStatus(e.id, 'bloqueado')}>❌ Rechazar</button>
                                                    </>}
                                                    {e.estado === 'activo' && <button className="btn btn-danger btn-sm" onClick={() => changeStatus(e.id, 'bloqueado')}>🚫 Bloquear</button>}
                                                    {e.estado === 'bloqueado' && <button className="btn btn-success btn-sm" onClick={() => changeStatus(e.id, 'activo')}>♻️ Reactivar</button>}
                                                    <button className="btn btn-primary btn-sm" onClick={() => setModalEmp(e)}>👁️ Ver Perfil</button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>

            {/* Modal */}
            <div className={`modal-overlay${modalEmp ? ' show' : ''}`} onClick={() => setModalEmp(null)}>
                {modalEmp && (
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">{modalEmp.nombre}</h3>
                            <button className="modal-close" onClick={() => setModalEmp(null)}>✕</button>
                        </div>
                        <div className="modal-body">
                            {/* Profile Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20, padding: 16, background: 'var(--glass)', borderRadius: 12, border: '1px solid var(--border)' }}>
                                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #6C3FC5, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 22, flexShrink: 0 }}>{(modalEmp.nombre || 'E')[0]}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 18 }}>{modalEmp.nombre}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{modalEmp.email || '—'}</div>
                                    <span className={`badge badge-${modalEmp.estado === 'activo' ? 'active' : modalEmp.estado === 'pendiente' ? 'pending' : 'blocked'}`} style={{ marginTop: 4 }}>{modalEmp.estado}</span>
                                </div>
                            </div>

                            {/* Info Grid */}
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                                <div><strong className="text-sm text-muted">📞 Teléfono</strong><br />{modalEmp.telefono || '—'}</div>
                                <div><strong className="text-sm text-muted">🎂 Edad</strong><br />{modalEmp.edad ? `${modalEmp.edad} años` : '—'}</div>
                                <div><strong className="text-sm text-muted">🌍 Nacionalidad</strong><br />{modalEmp.nacionalidad || '—'}</div>
                                <div><strong className="text-sm text-muted">📍 Sector</strong><br />{modalEmp.sector || modalEmp.direccion || '—'}</div>
                                <div><strong className="text-sm text-muted">🎯 Experiencia</strong><br />{expLabels[modalEmp.experiencia] || '—'}</div>
                                <div><strong className="text-sm text-muted">🚌 Traslado</strong><br />{trasladoLabels[modalEmp.traslado] || '—'}</div>
                                <div><strong className="text-sm text-muted">🟢 Disponibilidad</strong><br />{modalEmp.disponibilidad !== false ? '🟢 Disponible' : '🔴 Ocupada'}</div>
                                <div><strong className="text-sm text-muted">📌 Coordenadas</strong><br />{modalEmp.lat ? `${modalEmp.lat.toFixed?.(4) || modalEmp.lat}, ${modalEmp.lng.toFixed?.(4) || modalEmp.lng}` : 'No registradas'}</div>
                            </div>

                            {/* Referencias */}
                            {modalEmp.referencias && (
                                <div style={{ marginTop: 16, padding: 12, background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10 }}>
                                    <strong className="text-sm text-muted">📝 Referencias</strong><br />
                                    <span style={{ fontSize: 14 }}>{modalEmp.referencias}</span>
                                </div>
                            )}

                            {/* Cédula */}
                            {modalEmp.cedulaURL && (
                                <div style={{ marginTop: 16 }}>
                                    <strong className="text-sm text-muted">📷 Foto de Cédula</strong><br />
                                    <a href={modalEmp.cedulaURL} target="_blank" rel="noreferrer">
                                        <img src={modalEmp.cedulaURL} style={{ maxWidth: '100%', maxHeight: 250, borderRadius: 10, marginTop: 8, border: '1px solid var(--border)' }} alt="Cédula" />
                                    </a>
                                </div>
                            )}
                            {!modalEmp.cedulaURL && (
                                <div style={{ marginTop: 16, padding: 16, textAlign: 'center', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13 }}>
                                    ⚠️ Esta empleada no subió foto de cédula
                                </div>
                            )}
                        </div>
                        <div className="modal-footer" style={{ flexWrap: 'wrap', gap: 8 }}>
                            {modalEmp.estado === 'pendiente' && <button className="btn btn-success" onClick={() => changeStatus(modalEmp.id, 'activo')}>✅ Aprobar Empleada</button>}
                            {modalEmp.estado === 'pendiente' && <button className="btn btn-danger" onClick={() => changeStatus(modalEmp.id, 'bloqueado')}>❌ Rechazar</button>}
                            {modalEmp.estado === 'activo' && <button className="btn btn-danger" onClick={() => changeStatus(modalEmp.id, 'bloqueado')}>🚫 Bloquear</button>}
                            {modalEmp.estado === 'bloqueado' && <button className="btn btn-success" onClick={() => changeStatus(modalEmp.id, 'activo')}>♻️ Reactivar</button>}
                            <button className="btn btn-ghost" onClick={() => setModalEmp(null)}>Cerrar</button>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}
