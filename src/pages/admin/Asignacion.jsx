import { useState, useEffect, useRef } from 'react';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp, Timestamp } from 'firebase/firestore';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

const EXP_LABELS = { sin_experiencia: 'Sin exp.', menos_1: '< 1 año', '1_3': '1-3 años', '3_5': '3-5 años', mas_5: '5+ años' };

export default function Asignacion() {
    const [employees, setEmployees] = useState([]);
    const [clients, setClients] = useState([]);
    const [serviceTypes, setServiceTypes] = useState([]);
    const [selectedEmp, setSelectedEmp] = useState(null);
    const [selectedClient, setSelectedClient] = useState(null);
    const [empSearch, setEmpSearch] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [serviceForm, setServiceForm] = useState({
        tipo: '', precio: '', notas: '',
        semanas: 1, frecuencia: 1, horasPorVisita: 4, fechaInicio: ''
    });
    const [newClientMode, setNewClientMode] = useState(false);
    const [newClient, setNewClient] = useState({ nombre: '', telefono: '', direccion: '' });
    const [step, setStep] = useState(1);
    const [creating, setCreating] = useState(false);
    const { showToast } = useToast();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const preselectedRef = useRef(false);

    useEffect(() => { loadData(); }, []);

    useEffect(() => {
        const empId = searchParams.get('empId');
        if (empId && employees.length > 0 && !preselectedRef.current) {
            const found = employees.find(e => e.id === empId);
            if (found) { setSelectedEmp(found); setStep(2); preselectedRef.current = true; }
        }
    }, [employees, searchParams]);

    async function loadData() {
        const empSnap = await getDocs(collection(db, 'empleadas'));
        const userSnap = await getDocs(collection(db, 'usuarios'));
        const userMap = {};
        userSnap.docs.forEach(u => { userMap[u.id] = u.data(); });
        const emps = [];
        for (const d of empSnap.docs) {
            if (userMap[d.id]?.rol === 'admin') continue;
            const emp = { id: d.id, ...d.data(), ...userMap[d.id] };
            if (emp.estado === 'activo') emps.push(emp);
        }
        setEmployees(emps);

        const cliSnap = await getDocs(query(collection(db, 'clientes'), orderBy('creadoEn', 'desc')));
        setClients(cliSnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const catSnap = await getDocs(collection(db, 'catalogoServicios'));
        const cats = catSnap.docs.filter(d => d.data().activo !== false).map(d => ({ id: d.id, ...d.data() }));
        setServiceTypes(cats);
        if (cats.length > 0 && !serviceForm.tipo) {
            setServiceForm(p => ({ ...p, tipo: cats[0].nombre, precio: String(cats[0].precioBase || '') }));
        }
    }

    function selectServiceType(nombre) {
        const found = serviceTypes.find(s => s.nombre === nombre);
        setServiceForm(p => ({ ...p, tipo: nombre, precio: found?.precioBase ? String(found.precioBase) : p.precio }));
    }

    // Calculations
    const totalVisitas = (serviceForm.semanas || 1) * (serviceForm.frecuencia || 1);
    const totalHoras = totalVisitas * (serviceForm.horasPorVisita || 1);
    const precioTotal = parseFloat(serviceForm.precio) || 0;
    const precioPorVisita = totalVisitas > 0 ? Math.round(precioTotal / totalVisitas) : 0;

    function sendWhatsApp(emp, cName, cPhone, cDir) {
        const empPhone = (emp.telefono || '').replace(/[^0-9]/g, '');
        const found = serviceTypes.find(s => s.nombre === serviceForm.tipo);
        const svcLabel = found ? `${found.icono} ${found.nombre}` : serviceForm.tipo;
        if (!empPhone) { showToast('⚠️ Empleada no tiene teléfono', 'warning'); return; }
        const whatsappPhone = empPhone.startsWith('1') ? empPhone : `1${empPhone}`;
        const msg = `Hola ${emp.nombre} 👋\n\n` +
            `🏠 *Doméstica Personal RD* te tiene un nuevo servicio:\n\n` +
            `📌 *Servicio:* ${svcLabel}\n` +
            `👤 *Cliente:* ${cName}\n` +
            `📍 *Dirección:* ${cDir || 'Por confirmar'}\n` +
            `📞 *Tel. Cliente:* ${cPhone || '—'}\n` +
            `💰 *Precio Total:* RD$${precioTotal.toLocaleString()}\n` +
            `📅 *Duración:* ${serviceForm.semanas} semana(s), ${serviceForm.frecuencia} visita(s)/semana\n` +
            `⏰ *Horas/visita:* ${serviceForm.horasPorVisita}h\n` +
            `🔢 *Total visitas:* ${totalVisitas}\n` +
            (serviceForm.notas ? `📝 *Notas:* ${serviceForm.notas}\n` : '') +
            `\n¿Puedes aceptar? Responde *SÍ* o *NO*.\n\n¡Gracias! 🙏`;
        window.open(`https://wa.me/${whatsappPhone}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    async function createService() {
        if (!selectedEmp) { showToast('⚠️ Selecciona una empleada', 'warning'); return; }
        const cName = selectedClient ? selectedClient.nombre : newClient.nombre;
        const cPhone = selectedClient ? selectedClient.telefono : newClient.telefono;
        const cDir = selectedClient ? selectedClient.direccion : newClient.direccion;
        if (!cName) { showToast('⚠️ Ingresa datos del cliente', 'warning'); return; }
        if (!precioTotal) { showToast('⚠️ Ingresa el precio', 'warning'); return; }
        if (!serviceForm.fechaInicio) { showToast('⚠️ Selecciona fecha de inicio', 'warning'); return; }

        setCreating(true);
        try {
            // Save new client if needed
            if (!selectedClient && newClient.nombre) {
                await addDoc(collection(db, 'clientes'), {
                    nombre: newClient.nombre, telefono: newClient.telefono, direccion: newClient.direccion,
                    creadoEn: serverTimestamp()
                });
            }

            const fechaInicioDate = new Date(serviceForm.fechaInicio + 'T08:00:00');

            // Create service document
            const svcRef = await addDoc(collection(db, 'servicios'), {
                empleadaId: selectedEmp.id,
                empleadaNombre: selectedEmp.nombre,
                clienteNombre: cName,
                clienteTelefono: cPhone,
                clienteDireccion: cDir,
                tipoServicio: serviceForm.tipo,
                precioTotal: precioTotal,
                precio: precioTotal, // backward compat
                precioPorVisita: precioPorVisita,
                semanas: parseInt(serviceForm.semanas),
                frecuencia: parseInt(serviceForm.frecuencia),
                horasPorVisita: parseFloat(serviceForm.horasPorVisita),
                totalVisitas: totalVisitas,
                totalHoras: totalHoras,
                fechaInicio: Timestamp.fromDate(fechaInicioDate),
                notas: serviceForm.notas,
                estado: 'activo',
                creadoEn: serverTimestamp()
            });

            // Generate visit documents
            let visitNum = 0;
            for (let week = 0; week < serviceForm.semanas; week++) {
                for (let day = 0; day < serviceForm.frecuencia; day++) {
                    visitNum++;
                    const visitDate = new Date(fechaInicioDate);
                    // Spread visits across the week (Mon, Wed, Fri pattern for 3/week, etc.)
                    const daysInWeek = 7;
                    const daySpacing = Math.floor(daysInWeek / serviceForm.frecuencia);
                    visitDate.setDate(visitDate.getDate() + (week * 7) + (day * daySpacing));

                    await addDoc(collection(db, 'visitas'), {
                        servicioId: svcRef.id,
                        empleadaId: selectedEmp.id,
                        empleadaNombre: selectedEmp.nombre,
                        clienteNombre: cName,
                        tipoServicio: serviceForm.tipo,
                        numeroVisita: visitNum,
                        totalVisitas: totalVisitas,
                        horasPorVisita: parseFloat(serviceForm.horasPorVisita),
                        precioPorVisita: precioPorVisita,
                        fechaProgramada: Timestamp.fromDate(visitDate),
                        estado: 'pendiente',
                        pagada: false,
                        completadaEn: null,
                        creadoEn: serverTimestamp()
                    });
                }
            }

            showToast(`✅ Servicio creado con ${totalVisitas} visitas`, 'success');
            setStep(4);
        } catch (err) {
            showToast('Error: ' + err.message, 'error');
        } finally { setCreating(false); }
    }

    function resetAll() {
        setSelectedEmp(null); setSelectedClient(null);
        setNewClient({ nombre: '', telefono: '', direccion: '' });
        setServiceForm({
            tipo: serviceTypes[0]?.nombre || '', precio: String(serviceTypes[0]?.precioBase || ''),
            notas: '', semanas: 1, frecuencia: 1, horasPorVisita: 4, fechaInicio: ''
        });
        setNewClientMode(false); setStep(1);
    }

    const filteredEmps = employees.filter(e => !empSearch || (e.nombre || '').toLowerCase().includes(empSearch.toLowerCase()) || (e.sector || '').toLowerCase().includes(empSearch.toLowerCase()));
    const filteredClients = clients.filter(c => !clientSearch || (c.nombre || '').toLowerCase().includes(clientSearch.toLowerCase()) || (c.telefono || '').includes(clientSearch));

    const clientName = selectedClient ? selectedClient.nombre : newClient.nombre;
    const clientPhone = selectedClient ? selectedClient.telefono : newClient.telefono;
    const clientDir = selectedClient ? selectedClient.direccion : newClient.direccion;

    return (
        <>
            <div className="page-header">
                <div>
                    <h1 className="page-title">⚡ Asignación de Servicio</h1>
                    <p className="page-subtitle">Asigna servicios con visitas programadas y notifica por WhatsApp</p>
                </div>
                <button className="btn btn-ghost btn-sm" onClick={() => navigate('/admin')}>← Dashboard</button>
            </div>
            <div className="page-body">

                {/* PROGRESS BAR */}
                <div style={{ display: 'flex', gap: 0, marginBottom: 28, background: 'var(--glass)', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    {['Empleada', 'Cliente', 'Servicio', 'Confirmar'].map((label, i) => (
                        <div key={i} onClick={() => { if (i + 1 <= step) setStep(i + 1); }} style={{
                            flex: 1, padding: '14px 8px', textAlign: 'center', cursor: i + 1 <= step ? 'pointer' : 'default',
                            background: step === i + 1 ? 'var(--primary-glow)' : step > i + 1 ? 'rgba(16,185,129,0.1)' : 'transparent',
                            borderBottom: step === i + 1 ? '3px solid var(--primary)' : step > i + 1 ? '3px solid #10B981' : '3px solid transparent',
                            transition: 'all 0.3s'
                        }}>
                            <div style={{
                                width: 28, height: 28, borderRadius: '50%', margin: '0 auto 4px',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontSize: 13, fontWeight: 700,
                                background: step > i + 1 ? '#10B981' : step === i + 1 ? 'var(--primary)' : 'var(--glass)',
                                color: step >= i + 1 ? '#fff' : 'var(--text-muted)'
                            }}>{step > i + 1 ? '✓' : i + 1}</div>
                            <div style={{ fontSize: 12, fontWeight: 600, color: step >= i + 1 ? 'var(--text)' : 'var(--text-muted)' }}>{label}</div>
                        </div>
                    ))}
                </div>

                {/* ── STEP 1: SELECT EMPLOYEE ── */}
                {step === 1 && (
                    <div className="panel-section">
                        <div className="panel-section-header"><h3>👩 Seleccionar Empleada</h3></div>
                        <div className="panel-section-body">
                            <input className="form-control" placeholder="🔍 Buscar por nombre o sector..." value={empSearch} onChange={e => setEmpSearch(e.target.value)} style={{ marginBottom: 16 }} />
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12, maxHeight: 500, overflowY: 'auto' }}>
                                {filteredEmps.length === 0 ? (
                                    <div className="text-center text-muted" style={{ padding: 40, gridColumn: '1/-1' }}>
                                        {employees.length === 0 ? 'No hay empleadas activas' : 'Sin resultados'}
                                    </div>
                                ) : filteredEmps.map(emp => (
                                    <div key={emp.id} onClick={() => { setSelectedEmp(emp); setStep(2); }}
                                        className="glass" style={{
                                            padding: 16, borderRadius: 12, cursor: 'pointer',
                                            border: selectedEmp?.id === emp.id ? '2px solid #10B981' : '1px solid var(--border)',
                                            background: selectedEmp?.id === emp.id ? 'rgba(16,185,129,0.1)' : undefined,
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
                                            <div style={{
                                                width: 44, height: 44, borderRadius: '50%', flexShrink: 0,
                                                background: selectedEmp?.id === emp.id ? 'linear-gradient(135deg, #10B981, #059669)' : 'linear-gradient(135deg, #6C3FC5, #a855f7)',
                                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                                color: '#fff', fontWeight: 700, fontSize: 18
                                            }}>{selectedEmp?.id === emp.id ? '✓' : (emp.nombre || 'E')[0]}</div>
                                            <div>
                                                <div style={{ fontWeight: 700, fontSize: 15 }}>{emp.nombre}</div>
                                                <div style={{ fontSize: 11, color: emp.disponibilidad !== false ? '#10B981' : '#EF4444' }}>
                                                    {emp.disponibilidad !== false ? '🟢 Disponible' : '🔴 Ocupada'}
                                                </div>
                                            </div>
                                        </div>
                                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4px 12px', fontSize: 12, color: 'var(--text-muted)' }}>
                                            <div>📍 {emp.sector || emp.direccion || '—'}</div>
                                            <div>📞 {emp.telefono || '—'}</div>
                                            <div>🎯 {EXP_LABELS[emp.experiencia] || '—'}</div>
                                            <div>🚌 {emp.traslado === 'no' ? 'Sin problema' : emp.traslado === 'si' ? 'Con dificultad' : 'Depende'}</div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STEP 2: SELECT CLIENT ── */}
                {step === 2 && (
                    <div className="panel-section">
                        <div className="panel-section-header">
                            <h3>👤 Seleccionar Cliente</h3>
                            <div style={{ display: 'flex', gap: 6 }}>
                                <button className={`btn btn-sm ${!newClientMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setNewClientMode(false)}>📋 Existente</button>
                                <button className={`btn btn-sm ${newClientMode ? 'btn-primary' : 'btn-ghost'}`} onClick={() => { setNewClientMode(true); setSelectedClient(null); }}>➕ Nuevo</button>
                            </div>
                        </div>
                        <div className="panel-section-body">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: 12, marginBottom: 16, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
                                <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#10B981', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>✓</div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>Empleada seleccionada</div>
                                    <div style={{ fontWeight: 700 }}>{selectedEmp?.nombre} <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>• {selectedEmp?.telefono || '—'}</span></div>
                                </div>
                                <button className="btn btn-ghost btn-sm" onClick={() => setStep(1)}>Cambiar</button>
                            </div>

                            {!newClientMode ? (
                                <>
                                    <input className="form-control" placeholder="🔍 Buscar cliente..." value={clientSearch} onChange={e => setClientSearch(e.target.value)} style={{ marginBottom: 12 }} />
                                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10, maxHeight: 400, overflowY: 'auto' }}>
                                        {filteredClients.length === 0 ? (
                                            <div className="text-center text-muted" style={{ padding: 30, gridColumn: '1/-1' }}>
                                                {clients.length === 0 ? 'No hay clientes. Usa "➕ Nuevo".' : 'Sin resultados'}
                                            </div>
                                        ) : filteredClients.map(c => (
                                            <div key={c.id} onClick={() => { setSelectedClient(c); setStep(3); }}
                                                className="glass" style={{
                                                    padding: 14, borderRadius: 10, cursor: 'pointer',
                                                    border: selectedClient?.id === c.id ? '2px solid #3B82F6' : '1px solid var(--border)',
                                                    background: selectedClient?.id === c.id ? 'rgba(59,130,246,0.1)' : undefined
                                                }}
                                            >
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                                    <div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: selectedClient?.id === c.id ? '#3B82F6' : 'linear-gradient(135deg, #6B7280, #4B5563)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14 }}>{selectedClient?.id === c.id ? '✓' : (c.nombre || 'C')[0]}</div>
                                                    <div>
                                                        <div style={{ fontWeight: 700, fontSize: 14 }}>{c.nombre}</div>
                                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📞 {c.telefono || '—'} • 📍 {c.direccion || '—'}</div>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            ) : (
                                <div style={{ maxWidth: 500 }}>
                                    <div className="form-group">
                                        <label className="form-label">Nombre del cliente *</label>
                                        <input className="form-control" placeholder="Nombre completo" value={newClient.nombre} onChange={e => setNewClient(p => ({ ...p, nombre: e.target.value }))} />
                                    </div>
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Teléfono</label>
                                            <input type="tel" className="form-control" placeholder="809-000-0000" value={newClient.telefono} onChange={e => setNewClient(p => ({ ...p, telefono: e.target.value }))} />
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Dirección</label>
                                            <input className="form-control" placeholder="Dirección del hogar" value={newClient.direccion} onChange={e => setNewClient(p => ({ ...p, direccion: e.target.value }))} />
                                        </div>
                                    </div>
                                    <div className="sticky-bottom-bar">
                                        <button className="btn btn-ghost" onClick={() => setStep(1)}>← Volver</button>
                                        <button className="btn btn-primary" disabled={!newClient.nombre} onClick={() => setStep(3)}>Continuar →</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* ── STEP 3: DEFINE SERVICE WITH VISITS ── */}
                {step === 3 && (
                    <div className="panel-section">
                        <div className="panel-section-header"><h3>📋 Configurar Servicio y Visitas</h3></div>
                        <div className="panel-section-body">
                            {/* Summary cards */}
                            <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 200, padding: 12, background: 'rgba(16,185,129,0.08)', border: '1px solid rgba(16,185,129,0.2)', borderRadius: 10 }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>👩 Empleada</div>
                                    <div style={{ fontWeight: 700 }}>{selectedEmp?.nombre}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{selectedEmp?.telefono || '—'}</div>
                                </div>
                                <div style={{ flex: 1, minWidth: 200, padding: 12, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10 }}>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>👤 Cliente</div>
                                    <div style={{ fontWeight: 700 }}>{clientName || '—'}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{clientPhone || '—'}</div>
                                </div>
                            </div>

                            {/* Service type */}
                            <label className="form-label">Tipo de servicio</label>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(170px, 1fr))', gap: 8, marginBottom: 20 }}>
                                {serviceTypes.map(s => (
                                    <button key={s.id} onClick={() => selectServiceType(s.nombre)}
                                        style={{
                                            padding: '12px 14px', borderRadius: 10, cursor: 'pointer', textAlign: 'left',
                                            fontSize: 13, fontWeight: 600, fontFamily: 'inherit',
                                            border: serviceForm.tipo === s.nombre ? '2px solid var(--primary)' : '1px solid var(--border)',
                                            background: serviceForm.tipo === s.nombre ? 'var(--primary-glow)' : 'var(--glass)',
                                            color: serviceForm.tipo === s.nombre ? 'var(--primary-light)' : 'var(--text-muted)',
                                            transition: 'all 0.2s'
                                        }}
                                    >
                                        {s.icono} {s.nombre}
                                        {s.precioBase > 0 && <div style={{ fontSize: 11, opacity: 0.7, marginTop: 2 }}>RD${s.precioBase.toLocaleString()}</div>}
                                    </button>
                                ))}
                            </div>

                            {/* ── TIME & FREQUENCY CONFIG ── */}
                            <div style={{ padding: 20, background: 'var(--glass)', borderRadius: 14, border: '1px solid var(--border)', marginBottom: 20 }}>
                                <h4 style={{ marginBottom: 14, fontSize: 14 }}>⏰ Duración y Frecuencia</h4>
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">📅 Semanas</label>
                                        <input type="number" min="1" max="52" className="form-control" value={serviceForm.semanas}
                                            onChange={e => setServiceForm(p => ({ ...p, semanas: Math.max(1, parseInt(e.target.value) || 1) }))}
                                            style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">🔄 Visitas/semana</label>
                                        <input type="number" min="1" max="7" className="form-control" value={serviceForm.frecuencia}
                                            onChange={e => setServiceForm(p => ({ ...p, frecuencia: Math.max(1, Math.min(7, parseInt(e.target.value) || 1)) }))}
                                            style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">⏱️ Horas/visita</label>
                                        <input type="number" min="1" max="12" step="0.5" className="form-control" value={serviceForm.horasPorVisita}
                                            onChange={e => setServiceForm(p => ({ ...p, horasPorVisita: Math.max(1, parseFloat(e.target.value) || 1) }))}
                                            style={{ fontSize: 18, fontWeight: 700, textAlign: 'center' }} />
                                    </div>
                                    <div className="form-group" style={{ margin: 0 }}>
                                        <label className="form-label">📆 Fecha inicio *</label>
                                        <input type="date" className="form-control" value={serviceForm.fechaInicio}
                                            onChange={e => setServiceForm(p => ({ ...p, fechaInicio: e.target.value }))}
                                            style={{ fontSize: 14, fontWeight: 600 }} />
                                    </div>
                                </div>

                                {/* Auto-calculated summary */}
                                <div style={{
                                    display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10,
                                    marginTop: 16, padding: 14, background: 'rgba(108,63,197,0.08)',
                                    border: '1px solid rgba(108,63,197,0.2)', borderRadius: 10, textAlign: 'center'
                                }}>
                                    <div>
                                        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary-light)' }}>{totalVisitas}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total visitas</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary-light)' }}>{totalHoras}h</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Total horas</div>
                                    </div>
                                    <div>
                                        <div style={{ fontSize: 24, fontWeight: 800, color: '#10B981' }}>RD${precioPorVisita.toLocaleString()}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Por visita</div>
                                    </div>
                                </div>
                            </div>

                            {/* Price & Notes */}
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">💰 Precio Total RD$ *</label>
                                    <input type="number" className="form-control" placeholder="Ej: 6000" value={serviceForm.precio}
                                        onChange={e => setServiceForm(p => ({ ...p, precio: e.target.value }))}
                                        style={{ fontSize: 18, fontWeight: 700 }} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">📝 Notas</label>
                                    <input className="form-control" placeholder="Instrucciones especiales..." value={serviceForm.notas}
                                        onChange={e => setServiceForm(p => ({ ...p, notas: e.target.value }))} />
                                </div>
                            </div>

                            <div className="sticky-bottom-bar">
                                <button className="btn btn-ghost" onClick={() => setStep(2)}>← Atrás</button>
                                <button className="btn btn-primary" onClick={createService}
                                    disabled={!serviceForm.precio || !serviceForm.fechaInicio || creating}
                                    style={{ flex: 1, padding: '14px 20px', fontSize: 13 }}>
                                    {creating ? '⏳ Espere...' : `✅ Asignar (${totalVisitas})`}
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {/* ── STEP 4: SUCCESS + WHATSAPP ── */}
                {step === 4 && (
                    <div className="panel-section">
                        <div className="panel-section-body" style={{ textAlign: 'center', padding: 40 }}>
                            <div style={{ fontSize: 60, marginBottom: 16 }}>🎉</div>
                            <h2 style={{ marginBottom: 8 }}>¡Servicio Asignado!</h2>
                            <p className="text-muted" style={{ maxWidth: 480, margin: '0 auto 20px' }}>
                                Se creó el servicio <strong>{serviceForm.tipo}</strong> con <strong>{totalVisitas} visitas</strong> programadas
                                ({serviceForm.semanas} sem × {serviceForm.frecuencia}/sem × {serviceForm.horasPorVisita}h) para <strong>{selectedEmp?.nombre}</strong>
                            </p>

                            {/* WhatsApp CTA */}
                            <div style={{ padding: 20, background: 'rgba(37,211,102,0.08)', border: '2px solid rgba(37,211,102,0.3)', borderRadius: 14, maxWidth: 440, margin: '0 auto 20px' }}>
                                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 10 }}>Avísale por WhatsApp:</div>
                                <button onClick={() => sendWhatsApp(selectedEmp, clientName, clientPhone, clientDir)} style={{
                                    padding: '14px 28px', fontSize: 16, fontWeight: 700, fontFamily: 'inherit',
                                    background: 'linear-gradient(135deg, #25D366, #128C7E)', color: '#fff',
                                    border: 'none', borderRadius: 12, cursor: 'pointer', width: '100%',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10
                                }}>
                                    <svg width="22" height="22" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                                    Enviar por WhatsApp
                                </button>
                            </div>

                            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                                <button className="btn btn-primary" onClick={resetAll}>➕ Nueva Asignación</button>
                                <button className="btn btn-ghost" onClick={() => navigate('/admin/servicios')}>📋 Ver Servicios</button>
                                <button className="btn btn-ghost" onClick={() => navigate('/admin')}>← Dashboard</button>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </>
    );
}
