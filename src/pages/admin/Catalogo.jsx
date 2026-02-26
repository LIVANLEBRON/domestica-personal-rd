import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

const ICONOS = ['🧹', '🍳', '👕', '👶', '🧼', '🌿', '👔', '🏠', '🧽', '🪣', '🛁', '🪟', '🧺', '🍽️', '🐕', '🌸', '📌'];

export default function Catalogo() {
    const [servicios, setServicios] = useState([]);
    const [showForm, setShowForm] = useState(false);
    const [editId, setEditId] = useState(null);
    const [form, setForm] = useState({ nombre: '', icono: '🧹', precioBase: '', descripcion: '', activo: true });
    const { showToast } = useToast();

    useEffect(() => { loadServicios(); }, []);

    async function loadServicios() {
        const snap = await getDocs(query(collection(db, 'catalogoServicios'), orderBy('creadoEn', 'desc')));
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // If empty, seed with defaults
        if (list.length === 0) {
            const defaults = [
                { nombre: 'Limpieza general', icono: '🧹', precioBase: 1500, descripcion: 'Limpieza completa del hogar', activo: true },
                { nombre: 'Cocina', icono: '🍳', precioBase: 2000, descripcion: 'Preparación de alimentos y limpieza de cocina', activo: true },
                { nombre: 'Lavado y planchado', icono: '👕', precioBase: 1200, descripcion: 'Lavado, secado y planchado de ropa', activo: true },
                { nombre: 'Cuidado de niños', icono: '👶', precioBase: 2500, descripcion: 'Cuidado y supervisión de niños', activo: true },
                { nombre: 'Limpieza profunda', icono: '🧼', precioBase: 3000, descripcion: 'Limpieza exhaustiva de todas las áreas', activo: true },
                { nombre: 'Jardinería', icono: '🌿', precioBase: 1800, descripcion: 'Mantenimiento de jardín y áreas verdes', activo: true },
                { nombre: 'Solo planchado', icono: '👔', precioBase: 800, descripcion: 'Servicio exclusivo de planchado', activo: true },
            ];
            for (const d of defaults) {
                await addDoc(collection(db, 'catalogoServicios'), { ...d, creadoEn: serverTimestamp() });
            }
            loadServicios();
            return;
        }
        setServicios(list);
    }

    function openNew() {
        setEditId(null);
        setForm({ nombre: '', icono: '🧹', precioBase: '', descripcion: '', activo: true });
        setShowForm(true);
    }

    function openEdit(s) {
        setEditId(s.id);
        setForm({ nombre: s.nombre || '', icono: s.icono || '🧹', precioBase: String(s.precioBase || ''), descripcion: s.descripcion || '', activo: s.activo !== false });
        setShowForm(true);
    }

    async function saveServicio() {
        if (!form.nombre) { showToast('El nombre es obligatorio', 'warning'); return; }
        try {
            const data = { nombre: form.nombre, icono: form.icono, precioBase: parseFloat(form.precioBase) || 0, descripcion: form.descripcion, activo: form.activo };
            if (editId) {
                await updateDoc(doc(db, 'catalogoServicios', editId), data);
                showToast('✅ Servicio actualizado', 'success');
            } else {
                await addDoc(collection(db, 'catalogoServicios'), { ...data, creadoEn: serverTimestamp() });
                showToast('✅ Servicio creado', 'success');
            }
            setShowForm(false);
            loadServicios();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    async function toggleActivo(s) {
        await updateDoc(doc(db, 'catalogoServicios', s.id), { activo: !s.activo });
        setServicios(prev => prev.map(x => x.id === s.id ? { ...x, activo: !x.activo } : x));
        showToast(s.activo ? '⏸️ Servicio desactivado' : '✅ Servicio activado', 'success');
    }

    async function deleteServicio(id) {
        if (!confirm('¿Eliminar este tipo de servicio?')) return;
        await deleteDoc(doc(db, 'catalogoServicios', id));
        setServicios(prev => prev.filter(s => s.id !== id));
        showToast('🗑️ Servicio eliminado', 'success');
    }

    const update = (field) => (e) => setForm(p => ({ ...p, [field]: e.target.value }));

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Catálogo de Servicios</h1>
                    <p className="page-subtitle">Crea, edita y administra los tipos de servicio disponibles</p>
                </div>
                <button className="btn btn-primary btn-sm" onClick={openNew}>➕ Nuevo Servicio</button>
            </div>
            <div className="page-body">
                {/* Stats */}
                <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className="glass stat-card stat-purple">
                        <div className="stat-icon">📋</div>
                        <div className="stat-value">{servicios.length}</div>
                        <div className="stat-label">Total Servicios</div>
                    </div>
                    <div className="glass stat-card stat-green">
                        <div className="stat-icon">✅</div>
                        <div className="stat-value">{servicios.filter(s => s.activo !== false).length}</div>
                        <div className="stat-label">Activos</div>
                    </div>
                    <div className="glass stat-card stat-amber">
                        <div className="stat-icon">⏸️</div>
                        <div className="stat-value">{servicios.filter(s => s.activo === false).length}</div>
                        <div className="stat-label">Inactivos</div>
                    </div>
                </div>

                {/* Service Cards Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
                    {servicios.map(s => (
                        <div key={s.id} className="glass" style={{
                            padding: 20, borderRadius: 14,
                            border: s.activo !== false ? '1px solid var(--border)' : '1px solid rgba(239,68,68,0.2)',
                            opacity: s.activo !== false ? 1 : 0.6,
                            transition: 'all 0.3s'
                        }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                                <div style={{
                                    width: 48, height: 48, borderRadius: 12,
                                    background: 'var(--primary-glow)', display: 'flex',
                                    alignItems: 'center', justifyContent: 'center', fontSize: 24
                                }}>{s.icono || '📌'}</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontWeight: 700, fontSize: 15 }}>{s.nombre}</div>
                                    <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                        {s.activo !== false
                                            ? <span style={{ color: '#10B981' }}>● Activo</span>
                                            : <span style={{ color: '#EF4444' }}>● Inactivo</span>
                                        }
                                    </div>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary-light)' }}>
                                    RD${(s.precioBase || 0).toLocaleString()}
                                </div>
                            </div>
                            {s.descripcion && (
                                <div className="text-sm text-muted" style={{ marginBottom: 12 }}>{s.descripcion}</div>
                            )}
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => openEdit(s)}>✏️ Editar</button>
                                <button className="btn btn-ghost btn-sm" onClick={() => toggleActivo(s)}>
                                    {s.activo !== false ? '⏸️ Desactivar' : '✅ Activar'}
                                </button>
                                <button className="btn btn-danger btn-sm" onClick={() => deleteServicio(s.id)}>🗑️</button>
                            </div>
                        </div>
                    ))}
                </div>

                {servicios.length === 0 && (
                    <div className="panel-section">
                        <div className="empty-state">
                            <div className="empty-icon">📋</div>
                            <h3>Cargando catálogo...</h3>
                            <p>Se están creando los servicios predeterminados</p>
                        </div>
                    </div>
                )}
            </div>

            {/* Modal Form */}
            <div className={`modal-overlay${showForm ? ' show' : ''}`} onClick={() => setShowForm(false)}>
                <div className="modal" onClick={e => e.stopPropagation()}>
                    <div className="modal-header">
                        <h3 className="modal-title">{editId ? '✏️ Editar Servicio' : '➕ Nuevo Servicio'}</h3>
                        <button className="modal-close" onClick={() => setShowForm(false)}>✕</button>
                    </div>
                    <div className="modal-body">
                        <div className="form-group">
                            <label className="form-label">Ícono</label>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                                {ICONOS.map(ic => (
                                    <button key={ic} onClick={() => setForm(p => ({ ...p, icono: ic }))}
                                        style={{
                                            width: 40, height: 40, borderRadius: 8, fontSize: 20,
                                            border: form.icono === ic ? '2px solid var(--primary)' : '1px solid var(--border)',
                                            background: form.icono === ic ? 'var(--primary-glow)' : 'var(--glass)',
                                            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                                        }}
                                    >{ic}</button>
                                ))}
                            </div>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Nombre del servicio *</label>
                            <input className="form-control" value={form.nombre} onChange={update('nombre')} placeholder="Ej: Limpieza general" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Precio base RD$</label>
                            <input type="number" className="form-control" value={form.precioBase} onChange={update('precioBase')} placeholder="Ej: 1500" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Descripción</label>
                            <input className="form-control" value={form.descripcion} onChange={update('descripcion')} placeholder="Descripción breve del servicio" />
                        </div>
                        <div className="form-group">
                            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                                <input type="checkbox" checked={form.activo} onChange={e => setForm(p => ({ ...p, activo: e.target.checked }))} />
                                <span className="form-label" style={{ margin: 0 }}>Servicio activo</span>
                            </label>
                        </div>
                    </div>
                    <div className="modal-footer">
                        <button className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
                        <button className="btn btn-primary" onClick={saveServicio}>{editId ? '💾 Guardar' : '➕ Crear'}</button>
                    </div>
                </div>
            </div>
        </>
    );
}
