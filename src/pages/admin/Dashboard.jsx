import { useState, useEffect } from 'react';
import { collection, getDocs, doc, updateDoc, query, orderBy, limit } from 'firebase/firestore';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { useNavigate } from 'react-router-dom';
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

const EXP_LABELS = { sin_experiencia: 'Sin exp.', menos_1: '< 1 año', '1_3': '1-3 años', '3_5': '3-5 años', mas_5: '5+ años' };
const TRASLADO_LABELS = { no: '✅ Sin problema', si: '❌ Con dificultad', depende: '⚠️ Depende' };

export default function Dashboard() {
    const [employees, setEmployees] = useState([]);
    const [services, setServices] = useState([]);
    const [stats, setStats] = useState({ active: 0, pending: 0, services: 0, income: 0 });
    const { showToast } = useToast();
    const navigate = useNavigate();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        const empSnap = await getDocs(collection(db, 'empleadas'));
        const userSnap = await getDocs(collection(db, 'usuarios'));
        const userMap = {};
        userSnap.docs.forEach(u => { userMap[u.id] = u.data(); });
        const emps = [];
        for (const d of empSnap.docs) {
            if (userMap[d.id]?.rol === 'admin') continue;
            emps.push({ id: d.id, ...d.data(), ...userMap[d.id] });
        }
        setEmployees(emps);

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

    async function changeStatus(id, newStatus) {
        await updateDoc(doc(db, 'usuarios', id), { estado: newStatus });
        await updateDoc(doc(db, 'empleadas', id), { estado: newStatus });
        setEmployees(prev => prev.map(e => e.id === id ? { ...e, estado: newStatus } : e));
        setStats(prev => ({
            ...prev,
            pending: prev.pending - 1,
            active: newStatus === 'activo' ? prev.active + 1 : prev.active
        }));
        showToast(newStatus === 'activo' ? '✅ Empleada aprobada' : '❌ Empleada rechazada', 'success');
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

    const activeEmployees = employees.filter(e => e.estado === 'activo');
    const pendingEmployees = employees.filter(e => e.estado === 'pendiente');

    // Agrupar y ajustar coordenadas idénticas para que no se oculten unas debajo de otras
    const positionCounts = {};
    const mapEmployees = activeEmployees.filter(e => e.lat && e.lng).map(e => {
        const key = `${e.lat},${e.lng}`;
        if (positionCounts[key]) {
            positionCounts[key] += 1;
            // Add a tiny offset to overlapping markers
            const offset = positionCounts[key] * 0.0015;
            return { ...e, lat: e.lat + offset, lng: e.lng + offset };
        } else {
            positionCounts[key] = 1;
            return e;
        }
    });

    const unmappedCount = activeEmployees.length - mapEmployees.length;

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Dashboard</h1>
                    <p className="page-subtitle">Panel de control general</p>
                </div>
                <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm" onClick={() => navigate('/admin/asignacion')}>⚡ Nueva Asignación</button>
                    <button className="btn btn-ghost btn-sm" onClick={exportExcel}>📥 Excel</button>
                </div>
            </div>
            <div className="page-body">
                {/* Stats */}
                <div className="stats-row">
                    <div className="glass stat-card stat-purple"><div className="stat-icon">👩</div><div className="stat-value">{stats.active}</div><div className="stat-label">Empleadas Activas</div></div>
                    <div className="glass stat-card stat-amber" style={{ cursor: 'pointer', border: stats.pending > 0 ? '2px solid #F59E0B' : undefined }} onClick={() => navigate('/admin/solicitudes')}><div className="stat-icon">🔔</div><div className="stat-value">{stats.pending}</div><div className="stat-label">Pendientes</div></div>
                    <div className="glass stat-card stat-green"><div className="stat-icon">📋</div><div className="stat-value">{stats.services}</div><div className="stat-label">Servicios</div></div>
                    <div className="glass stat-card stat-blue"><div className="stat-icon">💰</div><div className="stat-value">RD${stats.income.toLocaleString()}</div><div className="stat-label">Ingresos</div></div>
                </div>

                {/* Map */}
                <div className="panel-section">
                    <div className="panel-section-header" style={{ flexWrap: 'wrap', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <h3 style={{ margin: 0 }}>🗺️ Mapa de Empleadas</h3>
                            {unmappedCount > 0 && (
                                <span className="badge" style={{ background: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.2)' }}>
                                    ⚠️ {unmappedCount} sin ubicación
                                </span>
                            )}
                        </div>
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
                                        <div style={{ color: '#333', minWidth: 220, fontFamily: 'Inter, sans-serif' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                                                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'linear-gradient(135deg, #6C3FC5, #a855f7)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>{(emp.nombre || 'E')[0]}</div>
                                                <div>
                                                    <div style={{ fontWeight: 700, fontSize: 15, color: '#111' }}>{emp.nombre}</div>
                                                    <div style={{ fontSize: 11, color: '#666' }}>{emp.disponibilidad !== false ? '🟢 Disponible' : '🔴 Ocupada'}</div>
                                                </div>
                                            </div>
                                            <div style={{ fontSize: 12, lineHeight: 1.8, color: '#444', borderTop: '1px solid #eee', paddingTop: 6 }}>
                                                <div>📍 <strong>Sector:</strong> {emp.sector || emp.direccion || '—'}</div>
                                                <div>📞 <strong>Tel:</strong> {emp.telefono || '—'}</div>
                                                <div>🎯 <strong>Exp:</strong> {EXP_LABELS[emp.experiencia] || '—'}</div>
                                                <div>🚌 <strong>Traslado:</strong> {emp.traslado === 'no' ? '✅ Sin problema' : emp.traslado === 'si' ? '❌ Con dificultad' : '⚠️ Depende'}</div>
                                            </div>
                                            <button onClick={() => navigate(`/admin/asignacion?empId=${emp.id}`)} style={{ marginTop: 8, padding: '8px 0', width: '100%', background: 'linear-gradient(135deg, #6C3FC5, #a855f7)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: 13 }}>⚡ Asignarle un servicio</button>
                                        </div>
                                    </Popup>
                                </Marker>
                            ))}
                        </MapContainer>
                    </div>
                </div>

                {/* Recent Services */}
                <div className="panel-section">
                    <div className="panel-section-header">
                        <h3>📋 Servicios Recientes</h3>
                        <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin/servicios')}>Ver todos →</button>
                    </div>
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
