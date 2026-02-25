import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

export default function Services() {
    const [services, setServices] = useState([]);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('todos');
    const { showToast } = useToast();

    useEffect(() => { loadServices(); }, []);

    async function loadServices() {
        const snap = await getDocs(query(collection(db, 'servicios'), orderBy('creadoEn', 'desc')));
        setServices(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    async function changeStatus(id, newStatus) {
        await updateDoc(doc(db, 'servicios', id), { estado: newStatus });
        setServices(prev => prev.map(s => s.id === id ? { ...s, estado: newStatus } : s));
        showToast(`Estado cambiado a "${newStatus}"`, 'success');
    }

    async function deleteService(id) {
        if (!confirm('¿Eliminar este servicio?')) return;
        await deleteDoc(doc(db, 'servicios', id));
        setServices(prev => prev.filter(s => s.id !== id));
        showToast('Servicio eliminado', 'success');
    }

    const filtered = services.filter(s => {
        if (statusFilter !== 'todos' && s.estado !== statusFilter) return false;
        if (search && !(s.clienteNombre || '').toLowerCase().includes(search.toLowerCase()) && !(s.empleadaNombre || '').toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    function exportServices() {
        const data = services.map(s => ({
            Cliente: s.clienteNombre, 'Tel. Cliente': s.clienteTelefono, Dirección: s.clienteDireccion,
            Empleada: s.empleadaNombre, Tipo: s.tipoServicio, Precio: s.precio, Estado: s.estado, Notas: s.notas
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Servicios');
        XLSX.writeFile(wb, `Servicios_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('📥 Excel descargado', 'success');
    }

    const statusBadge = (s) => s === 'completado' ? 'completed' : s === 'en_progreso' ? 'inprogress' : s === 'cancelado' ? 'blocked' : 'assigned';

    return (
        <>
            <div className="page-header">
                <div><h1 className="page-title">Servicios</h1><p className="page-subtitle">Historial y gestión de servicios</p></div>
            </div>
            <div className="page-body">
                <div className="toolbar">
                    <div className="search-bar">
                        <span className="search-icon">🔍</span>
                        <input placeholder="Buscar por cliente o empleada..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                    <select className="filter-select" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                        <option value="todos">Todos</option>
                        <option value="asignado">Asignados</option>
                        <option value="en_progreso">En Progreso</option>
                        <option value="completado">Completados</option>
                        <option value="cancelado">Cancelados</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={exportServices}>📥 Excel</button>
                </div>

                <div className="panel-section">
                    <div className="panel-section-body no-pad">
                        {filtered.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">📋</div><h3>Sin servicios</h3><p>No hay servicios que coincidan</p></div>
                        ) : filtered.map(s => (
                            <div key={s.id} className="service-item">
                                <div style={{ flex: 1 }}>
                                    <strong>{s.clienteNombre}</strong>
                                    <div className="service-meta">
                                        <span>👩 {s.empleadaNombre}</span>
                                        <span>📌 {s.tipoServicio}</span>
                                        <span>📞 {s.clienteTelefono || '—'}</span>
                                    </div>
                                    {s.notas && <div className="text-sm text-muted mt-2">📝 {s.notas}</div>}
                                </div>
                                <div className="service-actions">
                                    <span className={`badge badge-${statusBadge(s.estado)}`}>{s.estado}</span>
                                    <span className="service-price">RD${s.precio?.toLocaleString()}</span>
                                    <select className="filter-select" style={{ minWidth: 'auto', fontSize: 11, padding: '4px 8px' }} value={s.estado} onChange={e => changeStatus(s.id, e.target.value)}>
                                        <option value="asignado">Asignado</option>
                                        <option value="en_progreso">En Progreso</option>
                                        <option value="completado">Completado</option>
                                        <option value="cancelado">Cancelado</option>
                                    </select>
                                    <button className="btn btn-danger btn-sm" onClick={() => deleteService(s.id)}>🗑️</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
