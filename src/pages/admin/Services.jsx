import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, addDoc, query, orderBy, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

export default function Services() {
    const [services, setServices] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos');
    const [expandedId, setExpandedId] = useState(null);
    const [visitsByService, setVisitsByService] = useState({});
    const { showToast } = useToast();

    useEffect(() => { loadServices(); }, []);

    async function loadServices() {
        const snap = await getDocs(query(collection(db, 'servicios'), orderBy('creadoEn', 'desc')));
        const svcs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        setServices(svcs);

        // Load all visits grouped by service
        const visitSnap = await getDocs(query(collection(db, 'visitas'), orderBy('numeroVisita', 'asc')));
        const grouped = {};
        visitSnap.docs.forEach(d => {
            const v = { id: d.id, ...d.data() };
            if (!grouped[v.servicioId]) grouped[v.servicioId] = [];
            grouped[v.servicioId].push(v);
        });
        setVisitsByService(grouped);
    }

    function getProgress(svcId) {
        const visits = visitsByService[svcId] || [];
        if (visits.length === 0) return { completed: 0, total: 0, percent: 0 };
        const completed = visits.filter(v => v.estado === 'completada').length;
        return { completed, total: visits.length, percent: Math.round((completed / visits.length) * 100) };
    }

    async function completeVisit(visit) {
        try {
            // Use transaction: update visit + auto-create income
            await runTransaction(db, async (transaction) => {
                const visitRef = doc(db, 'visitas', visit.id);
                transaction.update(visitRef, {
                    estado: 'completada',
                    completadaEn: serverTimestamp()
                });
            });

            // Create auto-income (outside transaction since addDoc isn't supported in transactions)
            await addDoc(collection(db, 'ingresos'), {
                tipo: 'servicio',
                servicioId: visit.servicioId,
                visitaId: visit.id,
                descripcion: `Visita #${visit.numeroVisita} — ${visit.clienteNombre} (${visit.tipoServicio})`,
                monto: visit.precioPorVisita || 0,
                creadoEn: serverTimestamp()
            });

            showToast(`✅ Visita #${visit.numeroVisita} completada — ingreso registrado`, 'success');
            loadServices();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    async function cancelVisit(visit) {
        await updateDoc(doc(db, 'visitas', visit.id), { estado: 'cancelada' });
        showToast(`Visita #${visit.numeroVisita} cancelada`, 'success');
        loadServices();
    }

    async function changeServiceStatus(id, newStatus) {
        await updateDoc(doc(db, 'servicios', id), { estado: newStatus });
        setServices(prev => prev.map(s => s.id === id ? { ...s, estado: newStatus } : s));
        showToast(`Servicio → ${newStatus}`, 'success');
    }

    async function deleteService(id) {
        if (!confirm('¿Eliminar servicio y todas sus visitas?')) return;
        // Delete visits first
        const visits = visitsByService[id] || [];
        for (const v of visits) {
            await deleteDoc(doc(db, 'visitas', v.id));
        }
        await deleteDoc(doc(db, 'servicios', id));
        showToast('Servicio eliminado', 'success');
        loadServices();
    }

    function exportServices() {
        // Sheet 1: Servicios
        const svcData = services.map(s => {
            const p = getProgress(s.id);
            return {
                Cliente: s.clienteNombre, Empleada: s.empleadaNombre, Tipo: s.tipoServicio,
                'Precio Total': s.precioTotal || s.precio, Estado: s.estado,
                Semanas: s.semanas, 'Visitas/Semana': s.frecuencia, 'Horas/Visita': s.horasPorVisita,
                'Total Visitas': s.totalVisitas, 'Total Horas': s.totalHoras,
                'Completadas': p.completed, 'Progreso %': p.percent
            };
        });

        // Sheet 2: Visitas
        const allVisits = Object.values(visitsByService).flat();
        const visitData = allVisits.map(v => ({
            Servicio: v.tipoServicio, Cliente: v.clienteNombre, Empleada: v.empleadaNombre,
            '#': v.numeroVisita, Estado: v.estado, Pagada: v.pagada ? 'Sí' : 'No',
            'Precio/Visita': v.precioPorVisita,
            'Fecha Programada': v.fechaProgramada?.toDate ? v.fechaProgramada.toDate().toLocaleDateString('es-DO') : '—'
        }));

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(svcData), 'Servicios');
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitData), 'Visitas');
        XLSX.writeFile(wb, `Servicios_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('📥 Excel descargado (2 hojas)', 'success');
    }

    const filtered = services.filter(s => {
        if (statusFilter !== 'todos' && s.estado !== statusFilter) return false;
        if (search && !(s.clienteNombre || '').toLowerCase().includes(search.toLowerCase()) && !(s.empleadaNombre || '').toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const statusBadge = (s) => s === 'completado' ? 'completed' : s === 'activo' ? 'inprogress' : s === 'cancelado' ? 'blocked' : 'assigned';
    const visitBadge = (s) => s === 'completada' ? 'completed' : s === 'cancelada' ? 'blocked' : 'pending';

    return (
        <>
            <div className="page-header">
                <div><h1 className="page-title">Servicios</h1><p className="page-subtitle">Gestión de servicios y visitas</p></div>
                <button className="btn btn-ghost btn-sm" onClick={exportServices}>📥 Excel</button>
            </div>
            <div className="page-body">
                {/* Stats */}
                <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
                    <div className="glass stat-card stat-green"><div className="stat-icon">✅</div><div className="stat-value">{services.filter(s => s.estado === 'activo').length}</div><div className="stat-label">Activos</div></div>
                    <div className="glass stat-card stat-blue"><div className="stat-icon">📋</div><div className="stat-value">{services.length}</div><div className="stat-label">Total</div></div>
                    <div className="glass stat-card stat-purple"><div className="stat-icon">🔢</div><div className="stat-value">{Object.values(visitsByService).flat().length}</div><div className="stat-label">Visitas</div></div>
                    <div className="glass stat-card stat-amber"><div className="stat-icon">✓</div><div className="stat-value">{Object.values(visitsByService).flat().filter(v => v.estado === 'completada').length}</div><div className="stat-label">Completadas</div></div>
                </div>

                {/* Toolbar */}
                <div className="toolbar">
                    <div className="search-bar">
                        <span className="search-icon">🔍</span>
                        <input placeholder="Buscar por cliente o empleada..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="todos">Todos</option>
                        <option value="activo">Activos</option>
                        <option value="completado">Completados</option>
                        <option value="cancelado">Cancelados</option>
                        <option value="asignado">Asignados (legacy)</option>
                    </select>
                </div>

                {/* Service List */}
                <div className="panel-section">
                    <div className="panel-section-body no-pad">
                        {filtered.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">📋</div><h3>Sin servicios</h3><p>No hay servicios que coincidan</p></div>
                        ) : filtered.map(s => {
                            const prog = getProgress(s.id);
                            const visits = visitsByService[s.id] || [];
                            const isExpanded = expandedId === s.id;
                            const hasVisits = visits.length > 0;

                            return (
                                <div key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                                    {/* Service row */}
                                    <div className="service-item" style={{ cursor: hasVisits ? 'pointer' : 'default' }}
                                        onClick={() => hasVisits && setExpandedId(isExpanded ? null : s.id)}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                                                <strong>{s.clienteNombre}</strong>
                                                <span className={`badge badge-${statusBadge(s.estado)}`}>{s.estado}</span>
                                            </div>
                                            <div className="service-meta">
                                                <span>👩 {s.empleadaNombre}</span>
                                                <span>📌 {s.tipoServicio}</span>
                                                {s.semanas && <span>📅 {s.semanas}sem × {s.frecuencia}/sem × {s.horasPorVisita}h</span>}
                                            </div>
                                            {/* Progress bar */}
                                            {hasVisits && (
                                                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{ flex: 1, height: 8, borderRadius: 4, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
                                                        <div style={{
                                                            height: '100%', borderRadius: 4, transition: 'width 0.5s',
                                                            width: `${prog.percent}%`,
                                                            background: prog.percent === 100 ? '#10B981' : prog.percent > 50 ? '#3B82F6' : 'var(--primary)'
                                                        }} />
                                                    </div>
                                                    <span style={{ fontSize: 12, fontWeight: 700, color: prog.percent === 100 ? '#10B981' : 'var(--text-muted)', minWidth: 70, textAlign: 'right' }}>
                                                        {prog.completed}/{prog.total} ({prog.percent}%)
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <div className="service-actions">
                                            <span className="service-price">RD${(s.precioTotal || s.precio)?.toLocaleString()}</span>
                                            {hasVisits && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{isExpanded ? '▲' : '▼'} {visits.length} visitas</span>}
                                            <select className="filter-select" style={{ minWidth: 'auto', fontSize: 11, padding: '4px 8px' }}
                                                value={s.estado} onChange={e => { e.stopPropagation(); changeServiceStatus(s.id, e.target.value); }}
                                                onClick={e => e.stopPropagation()}>
                                                <option value="activo">Activo</option>
                                                <option value="completado">Completado</option>
                                                <option value="cancelado">Cancelado</option>
                                            </select>
                                            <button className="btn btn-danger btn-sm" onClick={e => { e.stopPropagation(); deleteService(s.id); }}>🗑️</button>
                                        </div>
                                    </div>

                                    {/* Expanded visits */}
                                    {isExpanded && (
                                        <div style={{ padding: '0 20px 16px', background: 'rgba(0,0,0,0.15)' }}>
                                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 10 }}>
                                                {visits.map(v => {
                                                    const fechaStr = v.fechaProgramada?.toDate ? v.fechaProgramada.toDate().toLocaleDateString('es-DO', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
                                                    return (
                                                        <div key={v.id} style={{
                                                            padding: 14, borderRadius: 10,
                                                            background: v.estado === 'completada' ? 'rgba(16,185,129,0.08)' : v.estado === 'cancelada' ? 'rgba(239,68,68,0.08)' : 'var(--glass)',
                                                            border: `1px solid ${v.estado === 'completada' ? 'rgba(16,185,129,0.2)' : v.estado === 'cancelada' ? 'rgba(239,68,68,0.2)' : 'var(--border)'}`,
                                                        }}>
                                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                                                <span style={{ fontWeight: 700, fontSize: 14 }}>Visita #{v.numeroVisita}</span>
                                                                <span className={`badge badge-${visitBadge(v.estado)}`}>{v.estado}</span>
                                                            </div>
                                                            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                                                                📅 {fechaStr} • ⏱️ {v.horasPorVisita}h • 💰 RD${(v.precioPorVisita || 0).toLocaleString()}
                                                                {v.pagada && <span style={{ color: '#10B981', marginLeft: 8 }}>✓ Pagada</span>}
                                                            </div>
                                                            {v.estado === 'pendiente' && (
                                                                <div style={{ display: 'flex', gap: 6 }}>
                                                                    <button className="btn btn-success btn-sm" onClick={() => completeVisit(v)}>✅ Completar</button>
                                                                    <button className="btn btn-danger btn-sm" onClick={() => cancelVisit(v)}>✕ Cancelar</button>
                                                                </div>
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
                </div>
            </div>
        </>
    );
}
