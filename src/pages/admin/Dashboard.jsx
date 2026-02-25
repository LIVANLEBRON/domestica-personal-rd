import { useState, useEffect, useRef } from 'react';
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

export default function Dashboard() {
    const [employees, setEmployees] = useState([]);
    const [services, setServices] = useState([]);
    const [stats, setStats] = useState({ active: 0, pending: 0, services: 0, income: 0 });
    const [selectedEmp, setSelectedEmp] = useState(null);
    const [clientForm, setClientForm] = useState({ nombre: '', telefono: '', direccion: '' });
    const [serviceForm, setServiceForm] = useState({ tipo: 'limpieza', precio: '', notas: '' });
    const { showToast } = useToast();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        // Load employees (exclude admins)
        const empSnap = await getDocs(collection(db, 'empleadas'));
        const emps = [];
        for (const d of empSnap.docs) {
            const data = d.data();
            // Check if admin via usuarios collection
            const userSnap = await getDocs(query(collection(db, 'usuarios')));
            const userDoc = userSnap.docs.find(u => u.id === d.id);
            if (userDoc && userDoc.data().rol === 'admin') continue;
            emps.push({ id: d.id, ...data });
        }
        setEmployees(emps);

        // Stats
        const activeCount = emps.filter(e => e.estado === 'activo').length;
        const pendingCount = emps.filter(e => e.estado === 'pendiente').length;

        // Load recent services
        const svcSnap = await getDocs(query(collection(db, 'servicios'), orderBy('creadoEn', 'desc'), limit(10)));
        const svcs = svcSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        setServices(svcs);

        // Income
        const paySnap = await getDocs(collection(db, 'pagos'));
        let totalIncome = 0;
        paySnap.docs.forEach(d => {
            const p = d.data();
            totalIncome += parseFloat(p.ganancia || 0);
        });

        setStats({ active: activeCount, pending: pendingCount, services: svcs.length, income: totalIncome });
    }

    async function createService() {
        if (!selectedEmp) { showToast('Selecciona una empleada', 'warning'); return; }
        if (!clientForm.nombre || !serviceForm.precio) { showToast('Completa los datos', 'warning'); return; }
        try {
            await addDoc(collection(db, 'servicios'), {
                empleadaId: selectedEmp.id,
                empleadaNombre: selectedEmp.nombre,
                clienteNombre: clientForm.nombre,
                clienteTelefono: clientForm.telefono,
                clienteDireccion: clientForm.direccion,
                tipoServicio: serviceForm.tipo,
                precio: parseFloat(serviceForm.precio),
                notas: serviceForm.notas,
                estado: 'asignado',
                creadoEn: serverTimestamp()
            });
            showToast('✅ Servicio asignado', 'success');
            setSelectedEmp(null);
            setClientForm({ nombre: '', telefono: '', direccion: '' });
            setServiceForm({ tipo: 'limpieza', precio: '', notas: '' });
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
                            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" attribution='&copy; <a href="https://carto.com/">CARTO</a>' />
                            {mapEmployees.map(emp => (
                                <Marker key={emp.id} position={[emp.lat, emp.lng]} icon={emp.disponibilidad !== false ? greenIcon : redIcon}>
                                    <Popup>
                                        <div style={{ color: '#333' }}>
                                            <strong>{emp.nombre}</strong><br />
                                            {emp.sector || emp.direccion}<br />
                                            <button onClick={() => setSelectedEmp(emp)} style={{ marginTop: 6, padding: '4px 12px', cursor: 'pointer' }}>Seleccionar</button>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>
                </div>

                {/* Quick Assignment Flow */}
                <div className="panel-section">
                    <div className="panel-section-header"><h3>⚡ Asignación Rápida</h3></div>
                    <div className="panel-section-body">
                        <div className="assign-flow">
                            {/* Step 1: Select Employee */}
                            <div className="assign-step">
                                <div className="step-number">1</div>
                                <h4 style={{ marginBottom: 12 }}>Seleccionar Empleada</h4>
                                <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                                    {employees.filter(e => e.estado === 'activo').map(emp => (
                                        <div key={emp.id} className={`emp-card${selectedEmp?.id === emp.id ? ' selected' : ''}`} onClick={() => setSelectedEmp(emp)}>
                                            <div className="emp-avatar">{(emp.nombre || 'E')[0]}</div>
                                            <div className="emp-info">
                                                <div className="emp-name">{emp.nombre}</div>
                                                <div className="emp-location">{emp.sector || emp.direccion || '—'}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Step 2: Client Data */}
                            <div className="assign-step">
                                <div className="step-number">2</div>
                                <h4 style={{ marginBottom: 12 }}>Datos del Cliente</h4>
                                <div className="form-group">
                                    <input className="form-control" placeholder="Nombre del cliente" value={clientForm.nombre} onChange={e => setClientForm(p => ({ ...p, nombre: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <input className="form-control" placeholder="Teléfono" value={clientForm.telefono} onChange={e => setClientForm(p => ({ ...p, telefono: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <input className="form-control" placeholder="Dirección" value={clientForm.direccion} onChange={e => setClientForm(p => ({ ...p, direccion: e.target.value }))} />
                                </div>
                            </div>

                            {/* Step 3: Service */}
                            <div className="assign-step">
                                <div className="step-number">3</div>
                                <h4 style={{ marginBottom: 12 }}>Definir Servicio</h4>
                                <div className="form-group">
                                    <select className="form-control" value={serviceForm.tipo} onChange={e => setServiceForm(p => ({ ...p, tipo: e.target.value }))}>
                                        <option value="limpieza">🧹 Limpieza general</option>
                                        <option value="cocina">🍳 Cocina</option>
                                        <option value="lavado">👕 Lavado y planchado</option>
                                        <option value="cuidado_ninos">👶 Cuidado de niños</option>
                                        <option value="otro">📌 Otro</option>
                                    </select>
                                </div>
                                <div className="form-group">
                                    <input type="number" className="form-control" placeholder="Precio RD$" value={serviceForm.precio} onChange={e => setServiceForm(p => ({ ...p, precio: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <input className="form-control" placeholder="Notas (opcional)" value={serviceForm.notas} onChange={e => setServiceForm(p => ({ ...p, notas: e.target.value }))} />
                                </div>
                                <button className="btn btn-primary btn-block" onClick={createService}>✅ Asignar Servicio</button>
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
