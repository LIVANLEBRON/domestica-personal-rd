import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

export default function Clients() {
    const [clients, setClients] = useState([]);
    const [search, setSearch] = useState('');
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ nombre: '', telefono: '', email: '', direccion: '', notas: '' });
    const { showToast } = useToast();

    useEffect(() => { loadClients(); }, []);

    async function loadClients() {
        const snap = await getDocs(query(collection(db, 'clientes'), orderBy('creadoEn', 'desc')));
        setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    function openNew() {
        setEditId(null);
        setForm({ nombre: '', telefono: '', email: '', direccion: '', notas: '' });
        setShowForm(true);
    }

    function openEdit(c) {
        setEditId(c.id);
        setForm({ nombre: c.nombre || '', telefono: c.telefono || '', email: c.email || '', direccion: c.direccion || '', notas: c.notas || '' });
        setShowForm(true);
    }

    async function saveClient() {
        if (!form.nombre) { showToast('El nombre es obligatorio', 'warning'); return; }
        try {
            if (editId) {
                await updateDoc(doc(db, 'clientes', editId), { ...form });
                setClients(prev => prev.map(c => c.id === editId ? { ...c, ...form } : c));
                showToast('✅ Cliente actualizado', 'success');
            } else {
                const ref = await addDoc(collection(db, 'clientes'), { ...form, creadoEn: serverTimestamp() });
                setClients(prev => [{ id: ref.id, ...form, creadoEn: new Date() }, ...prev]);
                showToast('✅ Cliente agregado', 'success');
            }
            setShowForm(false);
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    async function deleteClient(id) {
        if (!confirm('¿Eliminar este cliente?')) return;
        await deleteDoc(doc(db, 'clientes', id));
        setClients(prev => prev.filter(c => c.id !== id));
        showToast('Cliente eliminado', 'success');
    }

    const filtered = clients.filter(c =>
        !search || (c.nombre || '').toLowerCase().includes(search.toLowerCase()) || (c.telefono || '').includes(search)
    );

    function exportClients() {
        const data = clients.map(c => ({ Nombre: c.nombre, Teléfono: c.telefono, Email: c.email, Dirección: c.direccion, Notas: c.notas }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Clientes');
        XLSX.writeFile(wb, `Clientes_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('📥 Excel descargado', 'success');
    }

    const update = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Clientes</h1>
                    <p className="page-subtitle">Base de datos de clientes registrados</p>
                </div>
                <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm" onClick={openNew}>➕ Nuevo Cliente</button>
                    <button className="btn btn-ghost btn-sm" onClick={exportClients}>📥 Excel</button>
                </div>
            </div>
            <div className="page-body">
                {/* Stats */}
                <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className="glass stat-card stat-blue">
                        <div className="stat-icon">👥</div>
                        <div className="stat-value">{clients.length}</div>
                        <div className="stat-label">Total Clientes</div>
                    </div>
                </div>

                {/* Search */}
                <div className="toolbar">
                    <div className="search-bar">
                        <span className="search-icon">🔍</span>
                        <input placeholder="Buscar por nombre o teléfono..." value={search} onChange={e => setSearch(e.target.value)} />
                    </div>
                </div>

                {/* Client List */}
                <div className="panel-section">
                    <div className="panel-section-body no-pad">
                        <div style={{ overflowX: 'auto' }}>
                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Nombre</th>
                                        <th>Teléfono</th>
                                        <th>Email</th>
                                        <th>Dirección</th>
                                        <th>Notas</th>
                                        <th>Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filtered.length === 0 ? (
                                        <tr><td colSpan="6" className="text-center text-muted" style={{ padding: 40 }}>
                                            {clients.length === 0 ? 'No hay clientes. ¡Agrega el primero!' : 'Sin resultados'}
                                        </td></tr>
                                    ) : filtered.map(c => (
                                        <tr key={c.id}>
                                            <td data-label="Nombre"><strong>{c.nombre}</strong></td>
                                            <td data-label="Teléfono">{c.telefono || '—'}</td>
                                            <td data-label="Email" className="text-sm">{c.email || '—'}</td>
                                            <td data-label="Dirección" className="text-sm">{c.direccion || '—'}</td>
                                            <td data-label="Notas" className="text-sm text-muted">{c.notas || '—'}</td>
                                            <td data-label="Acciones">
                                                <div className="flex gap-2">
                                                    <button className="btn btn-ghost btn-sm" onClick={() => openEdit(c)}>✏️ Editar</button>
                                                    <button className="btn btn-danger btn-sm" onClick={() => deleteClient(c.id)}>🗑️</button>
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

            {/* Modal Form */}
            <div className={`modal-overlay${showForm ? ' show' : ''}`} onClick={() => setShowForm(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3 className="modal-title">{editId ? '✏️ Editar Cliente' : '➕ Nuevo Cliente'}</h3>
                        <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
                    </div>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Nombre *</label>
                            <input className="form-control" value={form.nombre} onChange={update('nombre')} placeholder="Nombre del cliente" />
                        </div>
                        <div className="form-row">
                            <div className="form-group">
                                <label className="form-label">Teléfono</label>
                                <input type="tel" className="form-control" value={form.telefono} onChange={update('telefono')} placeholder="809-000-0000" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Email</label>
                                <input type="email" className="form-control" value={form.email} onChange={update('email')} placeholder="correo@ejemplo.com" />
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Dirección</label>
                            <input className="form-control" value={form.direccion} onChange={update('direccion')} placeholder="Dirección del hogar" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Notas</label>
                            <input className="form-control" value={form.notas} onChange={update('notas')} placeholder="Notas adicionales (opcional)" />
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                        <button className="btn btn-primary" onClick={saveClient}>{editId ? '💾 Guardar' : '➕ Agregar'}</button>
                    </div>
                </div>
            </div>
        </>
    );
}
