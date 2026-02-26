import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import * as XLSX from 'xlsx';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

// Fix Leaflet default icon
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const greenIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });
const redIcon = new L.Icon({ iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-red.png', shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png', iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41] });

const SERVICE_TYPES = [
    { value: 'limpieza', label: '🧹 Limpieza general', price: 1500 },
    { value: 'cocina', label: '🍳 Cocina', price: 2000 },
    { value: 'lavado', label: '👕 Lavado y planchado', price: 1200 },
    { value: 'cuidado_ninos', label: '👶 Cuidado de niños', price: 2500 },
    { value: 'limpieza_profunda', label: '🧼 Limpieza profunda', price: 3000 },
    { value: 'jardineria', label: '🌿 Jardinería', price: 1800 },
    { value: 'planchado', label: '👔 Solo planchado', price: 800 },
    { value: 'otro', label: '📌 Otro', price: 0 },
];

export default function Dashboard() {
    const [employees, setEmployees] = useState([]);
    const [clients, setClients] = useState([]);
    const [services, setServices] = useState([]);
    const [stats, setStats] = useState({ active: 0, pending: 0, services: 0, income: 0 });
    const [selectedEmp, setSelectedEmp] = useState(null);
    const [selectedClient, setSelectedClient] = useState(null);
    const [clientSearch, setClientSearch] = useState('');
    const [empSearch, setEmpSearch] = useState('');
    const [serviceForm, setServiceForm] = useState({ tipo: 'limpieza', precio: '', notas: '' });
    const [newClientMode, setNewClientMode] = useState(false);
    const [newClient, setNewClient] = useState({ nombre: '', telefono: '', direccion: '' });
    const { showToast } = useToast();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        // Load employees (exclude admins)
        const empSnap = await getDocs(collection(db, 'empleadas'));
        const emps = [];
        const userSnap = await getDocs(collection(db, 'usuarios'));
        const userMap = {};
        userSnap.docs.forEach(u => { userMap[u.id] = u.data(); });
        for (const d of empSnap.docs) {
            if (userMap[d.id]?.rol === 'admin') continue;
            emps.push({ id: d.id, ...d.data(), ...userMap[d.id] });
        }
        setEmployees(emps);

        // Load clients
        const cliSnap = await getDocs(query(collection(db, 'clientes'), orderBy('creadoEn', 'desc')));
        setClients(cliSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        // Stats & services
        const activeCount = emps.filter(e => e.estado === 'activo').length;
        const pendingCount = emps.filter(e => e.estado === 'pendiente').length;
        const svcSnap = await getDocs(query(collection(db, 'servicios'), orderBy('creadoEn', 'desc'), limit(10)));
        const svcs = svcSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setServices(svcs);

        const paySnap = await getDocs(collection(db, 'pagos'));
        let totalIncome = 0;
        paySnap.docs.forEach(d => { totalIncome += parseFloat(d.data().ganancia || 0); });
        setStats({ active: activeCount, pending: pendingCount, services: svcs.length, income: totalIncome });
    }

    function selectServiceType(tipo) {
        const found = SERVICE_TYPES.find(s => s.value === tipo);
        setServiceForm(p => ({ ...p, tipo, precio: found?.price ? String(found.price) : p.precio }));
    }

    async function createService() {
        if (!selectedEmp) { showToast('⚠️ Selecciona una empleada primero', 'warning'); return; }
        const clientName = selectedClient ? selectedClient.nombre : newClient.nombre;
        const clientPhone = selectedClient ? selectedClient.telefono : newClient.telefono;
        const clientDir = selectedClient ? selectedClient.direccion : newClient.direccion;
        if (!clientName) { showToast('⚠️ Ingresa los datos del cliente', 'warning'); return; }
        if (!serviceForm.precio) { showToast('⚠️ Ingresa el precio', 'warning'); return; }

        try {
            // If new client, save to clients collection too
            if (!selectedClient && newClient.nombre) {
                await addDoc(collection(db, 'clientes'), {
                    nombre: newClient.nombre, telefono: newClient.telefono, direccion: newClient.direccion,
                    creadoEn: serverTimestamp()
                });
            }

            await addDoc(collection(db, 'servicios'), {
                empleadaId: selectedEmp.id,
                empleadaNombre: selectedEmp.nombre,
                clienteNombre: clientName,
                clienteTelefono: clientPhone,
                clienteDireccion: clientDir,
                tipoServicio: serviceForm.tipo,
                precio: parseFloat(serviceForm.precio),
                notas: serviceForm.notas,
                estado: 'asignado',
                creadoEn: serverTimestamp()
            });
            showToast('✅ Servicio asignado exitosamente', 'success');
            setSelectedEmp(null); setSelectedClient(null);
            setNewClient({ nombre: '', telefono: '', direccion: '' });
            setServiceForm({ tipo: 'limpieza', precio: '', notas: '' });
            setNewClientMode(false);
            loadData();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    function exportExcel() {
        const data = employees.map(e => ({
            Nombre: e.nombre, Email: e.email, Teléfono: e.telefono,
            Sector: e.sector || e.direccion, Experiencia: e.experiencia, Estado: e.estado
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Empleadas');
        XLSX.writeFile(wb, `Dashboard_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('📥 Excel descargado', 'success');
    }

    const mapEmployees = employees.filter(e => e.lat && e.lng && e.estado === 'activo');
    const activeEmps = employees.filter(e => e.estado === 'activo');
    const filteredEmps = activeEmps.filter(e => !empSearch || (e.nombre || '').toLowerCase().includes(empSearch.toLowerCase()));
    const filteredClients = clients.filter(c => !clientSearch || (c.nombre || '').toLowerCase().includes(clientSearch.toLowerCase()) || (c.telefono || '').includes(clientSearch));

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Panel de control y asignación rápida</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={exportExcel}>📥 Exportar Excel</button>
            </div>
            <div className="page-body">
                {/* Stats */}
                <div className="stats-row">
                    <div className="glass stat-card stat-purple"><div className="stat-icon">👩</div><div className="stat-value">{stats.active}</div><div className="stat-label">Empleadas Activas</div></div>
                    <div className="glass stat-card stat-amber"><div className="stat-icon">⏳</div><div className="stat-value">{stats.pending}</div><div className="stat-label">Pendientes</div></div>
                    <div className="glass stat-card stat-green"><div className="stat-icon">📋</div><div className="stat-value">{stats.services}</div><div className="stat-label">Servicios</div></div>
                    <div className="glass stat-card stat-blue"><div className="stat-icon">💰</div><div className="stat-value">RD${stats.income.toLocaleString()}</div><div className="stat-label">Ingresos</div></div>
                </div>

                {/* Map */}
                <div className="panel-section">
                    <div className="panel-section-header">
                        <h3>🗺️ Mapa de Empleadas</h3>
                        <div className="map-legend">
                            <span><span className="legend-dot available" /> Disponible</span>
                            <span><span className="legend-dot busy" /> Ocupada</span>
                        </div>
                    </div>
                    <div className="map-container">
                        <MapContainer center={[18.7357, -70.1627]} zoom={8} style={{ height: '100%', width: '100%' }}>
                            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; CARTO' />
                            {mapEmployees.map(emp => (
                                <Marker key={emp.id} position={[emp.lat, emp.lng]} icon={emp.disponibilidad !== false ? greenIcon : redIcon}>
                                    <Popup>
                                        <div style={{ color: '#333', minWidth: 150 }}>
                                            <strong>{emp.nombre}</strong><br />
                                            📍 {emp.sector || emp.direccion}<br />
                                            📞 {emp.telefono || '—'}<br />
                                            <button onClick={() => { setSelectedEmp(emp); }} style={{ marginTop: 6, padding: '6px 16px', background: '#6C3FC5', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}>✅ Seleccionar</button>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>
                </div>

                {/* ── IMPROVED ASSIGNMENT FLOW ── */}
                <div className="panel-section">
                    <div className="panel-section-header"><h3>⚡ Asignación de Servicio</h3></div>
                    <div className="panel-section-body">

                        {/* SELECTED SUMMARY BAR */}
                        <div style={{
                            display: 'flex', gap: 16, marginBottom: 24, padding: 16,
                            background: 'rgba(108,63,197,0.08)', border: '1px solid rgba(108,63,197,0.2)',
                            borderRadius: 12, alignItems: 'center', flexWrap: 'wrap'
                        }}>
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 4 }}>👩 Empleada seleccionada</div>
                                {selectedEmp ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #10B981, #059669)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: 14, color: '#fff'
                                        }}>{(selectedEmp.nombre || 'E')[0]}</div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedEmp.nombre}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedEmp.sector || selectedEmp.direccion || '—'} • {selectedEmp.telefono || ''}</div>
                                        </div>
                                        <button onClick={() => setSelectedEmp(null)} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>✕ Quitar</button>
                                    </div>
                                ) : (
                                    <div style={{ color: 'var(--warning)', fontWeight: 600, fontSize: 13 }}>⚠️ Ninguna — selecciona abajo</div>
                                )}
                            </div>
                            <div style={{ width: 1, height: 40, background: 'var(--border)' }} />
                            <div style={{ flex: 1, minWidth: 200 }}>
                                <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 1, color: 'var(--text-muted)', marginBottom: 4 }}>👤 Cliente</div>
                                {selectedClient ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 36, height: 36, borderRadius: '50%',
                                            background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontWeight: 700, fontSize: 14, color: '#fff'
                                        }}>{(selectedClient.nombre || 'C')[0]}</div>
                                        <div>
                                            <div style={{ fontWeight: 700, fontSize: 14 }}>{selectedClient.nombre}</div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedClient.direccion || '—'} • {selectedClient.telefono || ''}</div>
                                        </div>
                                        <button onClick={() => { setSelectedClient(null); setNewClientMode(false); }} style={{ marginLeft: 'auto', background: 'none', border: '1px solid rgba(239,68,68,0.3)', color: 'var(--danger)', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 11 }}>✕ Quitar</button>
                                    </div>
                                ) : newClientMode ? (
                                    <div style={{ color: 'var(--info)', fontWeight: 600, fontSize: 13 }}>📝 Nuevo cliente (abajo)</div>
                                ) : (
                                    <div style={{ color: 'var(--warning)', fontWeight: 600, fontSize: 13 }}>⚠️ Ninguno — selecciona abajo</div>
                                )}
                            </div>
                        </div>

                        <div className="assign-flow">
                            {/* ── STEP 1: Select Employee ── */}
                            <div className="assign-step">
                                <div className="step-number">1</div>
                                <h4 style={{ marginBottom: 8 }}>Seleccionar Empleada</h4>
                                <input className="form-control" placeholder="🔍 Buscar empleada..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} style={{ marginBottom: 10, fontSize: 12 }} />
                                <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                                    {filteredEmps.length === 0 ? (
                                        <div className="text-center text-muted text-sm" style={{ padding: 20 }}>No hay empleadas activas</div>
                                    ) : filteredEmps.map(emp => (
                                        <div key={emp.id}
                                            className="emp-card"
                                            onClick={() => setSelectedEmp(emp)}
                                            style={selectedEmp?.id === emp.id ? {
                                                borderColor: '#10B981', background: 'rgba(16,185,129,0.12)',
                                                boxShadow: '0 0 0 2px rgba(16,185,129,0.3)'
                                            } : {}}
                                        >
                                            <div className="emp-avatar" style={selectedEmp?.id === emp.id ? { background: 'linear-gradient(135deg, #10B981, #059669)' } : {}}>
                                                {selectedEmp?.id === emp.id ? '✓' : (emp.nombre || 'E')[0]}
                                            </div>
                                            <div className="emp-info">
                                                <div className="emp-name">{emp.nombre}</div>
                                                <div className="emp-location">{emp.sector || emp.direccion || '—'}</div>
                                            </div>
                                            {selectedEmp?.id === emp.id && (
                                                <span style={{ color: '#10B981', fontWeight: 700, fontSize: 11 }}>SELECCIONADA ✓</span>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* ── STEP 2: Select Client ── */}
                            <div className="assign-step">
                                <div className="step-number">2</div>
                                <h4 style={{ marginBottom: 8 }}>Cliente</h4>
                                <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                                    <button className={`tab-btn${!newClientMode ? ' active' : ''}`} style={{ flex: 1, padding: '6px 10px', fontSize: 11 }} onClick={() => setNewClientMode(false)}>📋 Existente</button>
                                    <button className={`tab-btn${newClientMode ? ' active' : ''}`} style={{ flex: 1, padding: '6px 10px', fontSize: 11 }} onClick={() => { setNewClientMode(true); setSelectedClient(null); }}>➕ Nuevo</button>
                                </div>

                                {!newClientMode ? (
                                    <>
                                        <input className="form-control" placeholder="🔍 Buscar cliente..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} style={{ marginBottom: 10, fontSize: 12 }} />
                                        <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                                            {filteredClients.length === 0 ? (
                                                <div className="text-center text-muted text-sm" style={{ padding: 20 }}>
                                                    {clients.length === 0 ? 'No hay clientes. Usa el tab "Nuevo".' : 'Sin resultados'}
                                                </div>
                                            ) : filteredClients.map(c => (
                                                <div key={c.id}
                                                    className="emp-card"
                                                    onClick={() => setSelectedClient(c)}
                                                    style={selectedClient?.id === c.id ? {
                                                        borderColor: '#3B82F6', background: 'rgba(59,130,246,0.12)',
                                                        boxShadow: '0 0 0 2px rgba(59,130,246,0.3)'
                                                    } : {}}
                                                >
                                                    <div className="emp-avatar" style={{ background: selectedClient?.id === c.id ? 'linear-gradient(135deg, #3B82F6, #2563EB)' : 'linear-gradient(135deg, #6B7280, #4B5563)' }}>
                                                        {selectedClient?.id === c.id ? '✓' : (c.nombre || 'C')[0]}
                                                    </div>
                                                    <div className="emp-info">
                                                        <div className="emp-name">{c.nombre}</div>
                                                        <div className="emp-location">{c.telefono || '—'} • {c.direccion || '—'}</div>
                                                    </div>
                                                    {selectedClient?.id === c.id && (
                                                        <span style={{ color: '#3B82F6', fontWeight: 700, fontSize: 11 }}>SELECCIONADO ✓</span>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="form-group">
                                            <input className="form-control" placeholder="Nombre del cliente *" value={newClient.nombre} onChange={e => setNewClient(p => ({ ...p, nombre: e.target.value }))} style={{ fontSize: 13 }} />
                                        </div>
                                        <div className="form-group">
                                            <input className="form-control" placeholder="📞 Teléfono" value={newClient.telefono} onChange={e => setNewClient(p => ({ ...p, telefono: e.target.value }))} style={{ fontSize: 13 }} />
                                        </div>
                                        <div className="form-group">
                                            <input className="form-control" placeholder="📍 Dirección" value={newClient.direccion} onChange={e => setNewClient(p => ({ ...p, direccion: e.target.value }))} style={{ fontSize: 13 }} />
                                        </div>
                                        <div className="text-sm text-muted" style={{ marginTop: 4 }}>💡 Este cliente se guardará automáticamente</div>
                                    </>
                                )}
                            </div>

                            {/* ── STEP 3: Define Service ── */}
                            <div className="assign-step">
                                <div className="step-number">3</div>
                                <h4 style={{ marginBottom: 8 }}>Servicio</h4>

                                {/* Service type grid */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
                                    {SERVICE_TYPES.map(s => (
                                        <button key={s.value}
                                            onClick={() => selectServiceType(s.value)}
                                            style={{
                                                padding: '8px 10px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                                                fontSize: 12, fontWeight: 600, fontFamily: 'inherit',
                                                border: serviceForm.tipo === s.value ? '2px solid var(--primary)' : '1px solid var(--border)',
                                                background: serviceForm.tipo === s.value ? 'var(--primary-glow)' : 'var(--glass)',
                                                color: serviceForm.tipo === s.value ? 'var(--primary-light)' : 'var(--text-muted)',
                                                transition: 'all 0.2s'
                                            }}
                                        >
                                            {s.label}
                                            {s.price > 0 && <div style={{ fontSize: 10, opa: 0.7 }}>RD${s.price.toLocaleString()}</div>}
                                        </button>
                                    ))}
                                </div>

                                <div className="form-group">
                                    <label className="form-label" style={{ fontSize: 11 }}>Precio RD$</label>
                                    <input type="number" className="form-control" placeholder="Ej: 1500" value={serviceForm.precio} onChange={e => setServiceForm(p => ({ ...p, precio: e.target.value }))} style={{ fontSize: 14, fontWeight: 700 }} />
                                </div>
                                <div className="form-group">
                                    <input className="form-control" placeholder="Notas (opcional)" value={serviceForm.notas} onChange={e => setServiceForm(p => ({ ...p, notas: e.target.value }))} style={{ fontSize: 12 }} />
                                </div>

                                <button className="btn btn-primary btn-block" onClick={createService}
                                    style={{ marginTop: 4, padding: '12px 20px', fontSize: 14 }}
                                    disabled={!selectedEmp || (!selectedClient && !newClient.nombre)}
                                >
                                    ✅ Asignar Servicio
                                </button>
                                {(!selectedEmp || (!selectedClient && !newClient.nombre)) && (
                                    <div className="text-sm text-muted" style={{ textAlign: 'center', marginTop: 6 }}>
                                        {!selectedEmp ? '👆 Selecciona una empleada' : '👆 Selecciona o crea un cliente'}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Recent Services */}
                <div className="panel-section">
                    <div className="panel-section-header"><h3>📋 Servicios Recientes</h3></div>
                    <div className="panel-section-body no-pad">
                        {services.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">📋</div><h3>Sin servicios</h3><p>No hay servicios registrados aún</p></div>
                        ) : services.map(s => (
                            <div key={s.id} className="service-item">
                                <div>
                                    <strong>{s.clienteNombre}</strong>
                                    <div className="service-meta">
                                        <span>👩 {s.empleadaNombre}</span>
                                        <span>📌 {s.tipoServicio}</span>
                                    </div>
                                </div>
                                <div className="service-actions">
                                    <span className={`badge badge-${s.estado === 'completado' ? 'completed' : s.estado === 'en_progreso' ? 'inprogress' : 'assigned'}`}>{s.estado}</span>
                                    <span className="service-price">RD${s.precio?.toLocaleString()}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
