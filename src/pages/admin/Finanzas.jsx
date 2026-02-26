import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

const INCOME_CATS = [
    { value: 'bonus', label: '🎁 Bonus del cliente' },
    { value: 'comision', label: '📊 Comisión variable' },
    { value: 'pago_extra', label: '💵 Pago extra' },
    { value: 'regalo', label: '🎀 Regalo/Propina' },
    { value: 'otro', label: '📌 Otro' },
];

const EXPENSE_TYPES = [
    { value: 'pago_empleada', label: '👩 Pago a empleada' },
    { value: 'transporte', label: '🚌 Transporte' },
    { value: 'materiales', label: '🧹 Materiales/Insumos' },
    { value: 'publicidad', label: '📢 Publicidad' },
    { value: 'operativo', label: '⚙️ Gasto operativo' },
    { value: 'otro', label: '📌 Otro' },
];

export default function Finanzas() {
    const [tab, setTab] = useState('resumen');
    const [ingresos, setIngresos] = useState([]);
    const [gastos, setGastos] = useState([]);
    const [services, setServices] = useState([]);
    const [visitas, setVisitas] = useState([]);
    const [showIncomeForm, setShowIncomeForm] = useState(false);
    const [showExpenseForm, setShowExpenseForm] = useState(false);
    const [incomeForm, setIncomeForm] = useState({ descripcion: '', monto: '', categoria: 'bonus' });
    const [expenseForm, setExpenseForm] = useState({ descripcion: '', monto: '', tipo: 'pago_empleada', empleadaNombre: '' });
    const [periodo, setPeriodo] = useState('mes');
    const { showToast } = useToast();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        const [ingSnap, gasSnap, svcSnap, visSnap] = await Promise.all([
            getDocs(query(collection(db, 'ingresos'), orderBy('creadoEn', 'desc'))),
            getDocs(query(collection(db, 'gastos'), orderBy('creadoEn', 'desc'))),
            getDocs(query(collection(db, 'servicios'), orderBy('creadoEn', 'desc'))),
            getDocs(collection(db, 'visitas')),
        ]);
        setIngresos(ingSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setGastos(gasSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setServices(svcSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setVisitas(visSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    // Filter by period
    function filterByPeriod(items) {
        const now = new Date();
        return items.filter(item => {
            const date = item.creadoEn?.toDate ? item.creadoEn.toDate() : null;
            if (!date) return true;
            if (periodo === 'semana') {
                const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
                return date >= weekAgo;
            }
            if (periodo === 'mes') {
                return date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear();
            }
            return true; // 'todo'
        });
    }

    async function addManualIncome() {
        if (!incomeForm.descripcion || !incomeForm.monto) { showToast('Completa los campos', 'warning'); return; }
        await addDoc(collection(db, 'ingresos'), {
            tipo: 'manual', descripcion: incomeForm.descripcion,
            monto: parseFloat(incomeForm.monto), categoria: incomeForm.categoria,
            creadoEn: serverTimestamp()
        });
        showToast('✅ Ingreso registrado', 'success');
        setShowIncomeForm(false);
        setIncomeForm({ descripcion: '', monto: '', categoria: 'bonus' });
        loadData();
    }

    async function addExpense() {
        if (!expenseForm.descripcion || !expenseForm.monto) { showToast('Completa los campos', 'warning'); return; }
        await addDoc(collection(db, 'gastos'), {
            tipo: expenseForm.tipo, descripcion: expenseForm.descripcion,
            monto: parseFloat(expenseForm.monto), empleadaNombre: expenseForm.empleadaNombre || null,
            creadoEn: serverTimestamp()
        });
        showToast('✅ Gasto registrado', 'success');
        setShowExpenseForm(false);
        setExpenseForm({ descripcion: '', monto: '', tipo: 'pago_empleada', empleadaNombre: '' });
        loadData();
    }

    function exportExcel() {
        const fIngresos = filterByPeriod(ingresos);
        const fGastos = filterByPeriod(gastos);
        const totalIng = fIngresos.reduce((s, i) => s + (i.monto || 0), 0);
        const totalGas = fGastos.reduce((s, g) => s + (g.monto || 0), 0);
        const ingAuto = fIngresos.filter(i => i.tipo === 'servicio').reduce((s, i) => s + (i.monto || 0), 0);
        const ingManual = fIngresos.filter(i => i.tipo === 'manual').reduce((s, i) => s + (i.monto || 0), 0);

        const wb = XLSX.utils.book_new();

        // Sheet 1: Servicios
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(services.map(s => ({
            Cliente: s.clienteNombre, Empleada: s.empleadaNombre, Tipo: s.tipoServicio,
            'Precio Total': s.precioTotal || s.precio, Estado: s.estado,
            Semanas: s.semanas, 'Vis/Sem': s.frecuencia, 'Hrs/Vis': s.horasPorVisita,
            'Total Visitas': s.totalVisitas, 'Total Horas': s.totalHoras
        }))), 'Servicios');

        // Sheet 2: Visitas
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(visitas.map(v => ({
            Cliente: v.clienteNombre, Empleada: v.empleadaNombre, '#': v.numeroVisita,
            Estado: v.estado, Pagada: v.pagada ? 'Sí' : 'No',
            'Precio': v.precioPorVisita, Horas: v.horasPorVisita,
            Fecha: v.fechaProgramada?.toDate ? v.fechaProgramada.toDate().toLocaleDateString('es-DO') : '—'
        }))), 'Visitas');

        // Sheet 3: Ingresos
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fIngresos.map(i => ({
            Tipo: i.tipo, Categoría: i.categoria || '—', Descripción: i.descripcion,
            Monto: i.monto, Fecha: i.creadoEn?.toDate ? i.creadoEn.toDate().toLocaleDateString('es-DO') : '—'
        }))), 'Ingresos');

        // Sheet 4: Gastos
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(fGastos.map(g => ({
            Tipo: g.tipo, Descripción: g.descripcion, Monto: g.monto,
            Empleada: g.empleadaNombre || '—',
            Fecha: g.creadoEn?.toDate ? g.creadoEn.toDate().toLocaleDateString('es-DO') : '—'
        }))), 'Gastos');

        // Sheet 5: Resumen
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet([
            { Concepto: 'Ingresos por Servicios', Monto: ingAuto },
            { Concepto: 'Ingresos Manuales', Monto: ingManual },
            { Concepto: 'TOTAL INGRESOS', Monto: totalIng },
            { Concepto: '', Monto: '' },
            { Concepto: 'TOTAL GASTOS', Monto: totalGas },
            { Concepto: '', Monto: '' },
            { Concepto: 'GANANCIA NETA', Monto: totalIng - totalGas },
            { Concepto: 'Servicios Activos', Monto: services.filter(s => s.estado === 'activo').length },
            { Concepto: 'Total Visitas Completadas', Monto: visitas.filter(v => v.estado === 'completada').length },
            { Concepto: 'Total Horas Trabajadas', Monto: visitas.filter(v => v.estado === 'completada').reduce((s, v) => s + (v.horasPorVisita || 0), 0) },
        ]), 'Resumen');

        XLSX.writeFile(wb, `Finanzas_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('📥 Excel descargado (5 hojas)', 'success');
    }

    const fIngresos = filterByPeriod(ingresos);
    const fGastos = filterByPeriod(gastos);
    const totalIngresos = fIngresos.reduce((s, i) => s + (i.monto || 0), 0);
    const totalGastos = fGastos.reduce((s, g) => s + (g.monto || 0), 0);
    const ganancia = totalIngresos - totalGastos;
    const ingresosAuto = fIngresos.filter(i => i.tipo === 'servicio').reduce((s, i) => s + (i.monto || 0), 0);
    const ingresosManual = fIngresos.filter(i => i.tipo === 'manual').reduce((s, i) => s + (i.monto || 0), 0);
    const totalHorasComp = visitas.filter(v => v.estado === 'completada').reduce((s, v) => s + (v.horasPorVisita || 0), 0);

    return (
        <>
            <div className="page-header">
                <div><h1 className="page-title">💰 Finanzas</h1><p className="page-subtitle">Contabilidad completa del negocio</p></div>
                <div className="flex gap-2">
                    <select className="filter-select" value={periodo} onChange={e => setPeriodo(e.target.value)}>
                        <option value="semana">Esta semana</option>
                        <option value="mes">Este mes</option>
                        <option value="todo">Todo</option>
                    </select>
                    <button className="btn btn-ghost btn-sm" onClick={exportExcel}>📥 Excel (5 hojas)</button>
                </div>
            </div>
            <div className="page-body">
                {/* Dashboard Cards */}
                <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))' }}>
                    <div className="glass stat-card stat-green"><div className="stat-icon">📈</div><div className="stat-value">RD${totalIngresos.toLocaleString()}</div><div className="stat-label">Ingresos</div></div>
                    <div className="glass stat-card stat-amber"><div className="stat-icon">📉</div><div className="stat-value">RD${totalGastos.toLocaleString()}</div><div className="stat-label">Gastos</div></div>
                    <div className="glass stat-card" style={{ background: ganancia >= 0 ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', border: `1px solid ${ganancia >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                        <div className="stat-icon">{ganancia >= 0 ? '✅' : '⚠️'}</div>
                        <div className="stat-value" style={{ color: ganancia >= 0 ? '#10B981' : '#EF4444' }}>RD${ganancia.toLocaleString()}</div>
                        <div className="stat-label">Ganancia Neta</div>
                    </div>
                    <div className="glass stat-card stat-purple"><div className="stat-icon">⏱️</div><div className="stat-value">{totalHorasComp}h</div><div className="stat-label">Horas Trabajadas</div></div>
                </div>

                {/* Tabs */}
                <div className="tabs" style={{ marginBottom: 20 }}>
                    <button className={`tab-btn${tab === 'resumen' ? ' active' : ''}`} onClick={() => setTab('resumen')}>📊 Resumen</button>
                    <button className={`tab-btn${tab === 'ingresos' ? ' active' : ''}`} onClick={() => setTab('ingresos')}>📈 Ingresos ({fIngresos.length})</button>
                    <button className={`tab-btn${tab === 'gastos' ? ' active' : ''}`} onClick={() => setTab('gastos')}>📉 Gastos ({fGastos.length})</button>
                </div>

                {/* TAB: RESUMEN */}
                {tab === 'resumen' && (
                    <div className="panel-section">
                        <div className="panel-section-header"><h3>📊 Resumen Financiero</h3></div>
                        <div className="panel-section-body">
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                                <div>
                                    <h4 style={{ color: '#10B981', marginBottom: 12 }}>📈 Ingresos</h4>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                        <span className="text-muted">Por servicios (automático)</span>
                                        <strong style={{ color: '#10B981' }}>RD${ingresosAuto.toLocaleString()}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                        <span className="text-muted">Manuales (bonos, etc.)</span>
                                        <strong style={{ color: '#3B82F6' }}>RD${ingresosManual.toLocaleString()}</strong>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 700, fontSize: 16 }}>
                                        <span>TOTAL</span>
                                        <span style={{ color: '#10B981' }}>RD${totalIngresos.toLocaleString()}</span>
                                    </div>
                                </div>
                                <div>
                                    <h4 style={{ color: '#EF4444', marginBottom: 12 }}>📉 Gastos</h4>
                                    {(() => {
                                        const grouped = {};
                                        fGastos.forEach(g => { grouped[g.tipo] = (grouped[g.tipo] || 0) + (g.monto || 0); });
                                        return Object.entries(grouped).map(([tipo, monto]) => (
                                            <div key={tipo} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                                                <span className="text-muted">{EXPENSE_TYPES.find(e => e.value === tipo)?.label || tipo}</span>
                                                <strong style={{ color: '#EF4444' }}>RD${monto.toLocaleString()}</strong>
                                            </div>
                                        ));
                                    })()}
                                    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', fontWeight: 700, fontSize: 16 }}>
                                        <span>TOTAL</span>
                                        <span style={{ color: '#EF4444' }}>RD${totalGastos.toLocaleString()}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Profit bar */}
                            <div style={{ padding: 20, borderRadius: 14, textAlign: 'center', background: ganancia >= 0 ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', border: `2px solid ${ganancia >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}` }}>
                                <div style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 4 }}>GANANCIA NETA</div>
                                <div style={{ fontSize: 36, fontWeight: 800, color: ganancia >= 0 ? '#10B981' : '#EF4444' }}>RD${ganancia.toLocaleString()}</div>
                            </div>

                            {/* Quick stats */}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginTop: 16 }}>
                                <div className="glass" style={{ padding: 14, textAlign: 'center', borderRadius: 10 }}>
                                    <div style={{ fontSize: 20, fontWeight: 800 }}>{services.filter(s => s.estado === 'activo').length}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Servicios activos</div>
                                </div>
                                <div className="glass" style={{ padding: 14, textAlign: 'center', borderRadius: 10 }}>
                                    <div style={{ fontSize: 20, fontWeight: 800 }}>{visitas.filter(v => v.estado === 'completada').length}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Visitas completadas</div>
                                </div>
                                <div className="glass" style={{ padding: 14, textAlign: 'center', borderRadius: 10 }}>
                                    <div style={{ fontSize: 20, fontWeight: 800 }}>{totalHorasComp}h</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Horas trabajadas</div>
                                </div>
                                <div className="glass" style={{ padding: 14, textAlign: 'center', borderRadius: 10 }}>
                                    <div style={{ fontSize: 20, fontWeight: 800 }}>{visitas.filter(v => v.estado === 'pendiente').length}</div>
                                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Visitas pendientes</div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* TAB: INGRESOS */}
                {tab === 'ingresos' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowIncomeForm(!showIncomeForm)}>➕ Ingreso Manual</button>
                        </div>

                        {showIncomeForm && (
                            <div className="panel-section mb-4">
                                <div className="panel-section-header"><h3>➕ Nuevo Ingreso Manual</h3></div>
                                <div className="panel-section-body">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Categoría</label>
                                            <select className="form-control" value={incomeForm.categoria} onChange={e => setIncomeForm(p => ({ ...p, categoria: e.target.value }))}>
                                                {INCOME_CATS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Monto RD$</label>
                                            <input type="number" className="form-control" value={incomeForm.monto} onChange={e => setIncomeForm(p => ({ ...p, monto: e.target.value }))} placeholder="Ej: 500" />
                                        </div>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Descripción</label>
                                        <input className="form-control" value={incomeForm.descripcion} onChange={e => setIncomeForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Propina del cliente María" />
                                    </div>
                                    <button className="btn btn-success" onClick={addManualIncome}>💰 Registrar Ingreso</button>
                                </div>
                            </div>
                        )}

                        <div className="panel-section">
                            <div className="panel-section-body no-pad">
                                {fIngresos.length === 0 ? (
                                    <div className="empty-state"><div className="empty-icon">📈</div><h3>Sin ingresos</h3></div>
                                ) : fIngresos.map(i => (
                                    <div key={i.id} className="service-item">
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700 }}>{i.descripcion}</span>
                                                <span className={`badge badge-${i.tipo === 'servicio' ? 'completed' : 'inprogress'}`}>
                                                    {i.tipo === 'servicio' ? '🤖 Auto' : '✋ Manual'}
                                                </span>
                                                {i.categoria && <span className="badge badge-assigned">{i.categoria}</span>}
                                            </div>
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                                                {i.creadoEn?.toDate ? i.creadoEn.toDate().toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                            </div>
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: 16, color: '#10B981' }}>+RD${(i.monto || 0).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}

                {/* TAB: GASTOS */}
                {tab === 'gastos' && (
                    <>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 12 }}>
                            <button className="btn btn-primary btn-sm" onClick={() => setShowExpenseForm(!showExpenseForm)}>➕ Registrar Gasto</button>
                        </div>

                        {showExpenseForm && (
                            <div className="panel-section mb-4">
                                <div className="panel-section-header"><h3>➕ Nuevo Gasto</h3></div>
                                <div className="panel-section-body">
                                    <div className="form-row">
                                        <div className="form-group">
                                            <label className="form-label">Tipo de gasto</label>
                                            <select className="form-control" value={expenseForm.tipo} onChange={e => setExpenseForm(p => ({ ...p, tipo: e.target.value }))}>
                                                {EXPENSE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                                            </select>
                                        </div>
                                        <div className="form-group">
                                            <label className="form-label">Monto RD$</label>
                                            <input type="number" className="form-control" value={expenseForm.monto} onChange={e => setExpenseForm(p => ({ ...p, monto: e.target.value }))} placeholder="Ej: 1200" />
                                        </div>
                                    </div>
                                    {expenseForm.tipo === 'pago_empleada' && (
                                        <div className="form-group">
                                            <label className="form-label">Nombre empleada</label>
                                            <input className="form-control" value={expenseForm.empleadaNombre} onChange={e => setExpenseForm(p => ({ ...p, empleadaNombre: e.target.value }))} placeholder="Ej: María Pérez" />
                                        </div>
                                    )}
                                    <div className="form-group">
                                        <label className="form-label">Descripción</label>
                                        <input className="form-control" value={expenseForm.descripcion} onChange={e => setExpenseForm(p => ({ ...p, descripcion: e.target.value }))} placeholder="Ej: Pago semanal de 3 visitas" />
                                    </div>
                                    <button className="btn btn-success" onClick={addExpense}>💸 Registrar Gasto</button>
                                </div>
                            </div>
                        )}

                        <div className="panel-section">
                            <div className="panel-section-body no-pad">
                                {fGastos.length === 0 ? (
                                    <div className="empty-state"><div className="empty-icon">📉</div><h3>Sin gastos</h3></div>
                                ) : fGastos.map(g => (
                                    <div key={g.id} className="service-item">
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontSize: 13, fontWeight: 700 }}>{g.descripcion}</span>
                                                <span className="badge badge-blocked">{EXPENSE_TYPES.find(e => e.value === g.tipo)?.label || g.tipo}</span>
                                            </div>
                                            {g.empleadaNombre && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>👩 {g.empleadaNombre}</div>}
                                            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                                {g.creadoEn?.toDate ? g.creadoEn.toDate().toLocaleDateString('es-DO', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                                            </div>
                                        </div>
                                        <span style={{ fontWeight: 800, fontSize: 16, color: '#EF4444' }}>-RD${(g.monto || 0).toLocaleString()}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </>
    );
}
