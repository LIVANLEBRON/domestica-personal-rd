import { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, query, orderBy, where, serverTimestamp } from 'firebase/firestore';
import jsPDF from 'jspdf';
import * as XLSX from 'xlsx';
import { db } from '../../firebase';
import { useToast } from '../../contexts/ToastContext';

export default function Payments() {
    const [payments, setPayments] = useState([]);
    const [services, setServices] = useState([]);
    const [form, setForm] = useState({ serviceId: '', montoTotal: '', comision: 25, notas: '' });
    const [showForm, setShowForm] = useState(false);
    const { showToast } = useToast();

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        const paySnap = await getDocs(query(collection(db, 'pagos'), orderBy('creadoEn', 'desc')));
        setPayments(paySnap.docs.map(d => ({ id: d.id, ...d.data() })));

        const svcSnap = await getDocs(query(collection(db, 'servicios'), where('estado', '==', 'completado')));
        setServices(svcSnap.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    async function registerPayment() {
        const svc = services.find(s => s.id === form.serviceId);
        if (!svc) { showToast('Selecciona un servicio', 'warning'); return; }
        const montoTotal = parseFloat(form.montoTotal);
        if (!montoTotal) { showToast('Ingresa el monto', 'warning'); return; }
        const comisionRate = parseFloat(form.comision) / 100;
        const ganancia = montoTotal * comisionRate;
        const pagoEmpleada = montoTotal - ganancia;

        try {
            await addDoc(collection(db, 'pagos'), {
                servicioId: svc.id,
                empleadaId: svc.empleadaId,
                empleadaNombre: svc.empleadaNombre,
                clienteNombre: svc.clienteNombre,
                montoTotal, comision: form.comision, ganancia, pagoEmpleada,
                notas: form.notas,
                creadoEn: serverTimestamp()
            });
            showToast('💰 Pago registrado', 'success');
            setShowForm(false);
            setForm({ serviceId: '', montoTotal: '', comision: 25, notas: '' });
            loadData();
        } catch (err) { showToast('Error: ' + err.message, 'error'); }
    }

    function generateReceipt(p, tipo) {
        const pdf = new jsPDF();
        pdf.setFontSize(20);
        pdf.text('Doméstica Personal RD', 20, 25);
        pdf.setFontSize(12);
        pdf.text(tipo === 'cliente' ? 'RECIBO DEL CLIENTE' : 'RECIBO DE PAGO — EMPLEADA', 20, 35);
        pdf.setDrawColor(108, 63, 197);
        pdf.line(20, 40, 190, 40);
        pdf.setFontSize(11);
        let y = 55;
        const add = (label, value) => { pdf.text(`${label}: ${value}`, 20, y); y += 10; };
        add('Cliente', p.clienteNombre);
        add('Empleada', p.empleadaNombre);
        if (tipo === 'cliente') {
            add('Monto Total', `RD$${p.montoTotal?.toLocaleString()}`);
        } else {
            add('Monto Total', `RD$${p.montoTotal?.toLocaleString()}`);
            add('Comisión', `${p.comision}%`);
            add('Pago Empleada', `RD$${p.pagoEmpleada?.toLocaleString()}`);
        }
        if (p.notas) add('Notas', p.notas);
        y += 5;
        add('Fecha', new Date().toLocaleDateString('es-DO'));
        pdf.save(`Recibo_${tipo}_${Date.now()}.pdf`);
        showToast('📄 PDF generado', 'success');
    }

    function exportPayments() {
        const data = payments.map(p => ({
            Cliente: p.clienteNombre, Empleada: p.empleadaNombre,
            'Monto Total': p.montoTotal, 'Comisión %': p.comision,
            Ganancia: p.ganancia, 'Pago Empleada': p.pagoEmpleada
        }));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(data), 'Pagos');
        XLSX.writeFile(wb, `Pagos_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('📥 Excel descargado', 'success');
    }

    const totalGanancia = payments.reduce((sum, p) => sum + (p.ganancia || 0), 0);
    const totalPagado = payments.reduce((sum, p) => sum + (p.pagoEmpleada || 0), 0);

    return (
        <>
            <div className="page-header">
                <div><h1 className="page-title">Pagos</h1><p className="page-subtitle">Registro de pagos y recibos</p></div>
                <div className="flex gap-2">
                    <button className="btn btn-primary btn-sm" onClick={() => setShowForm(!showForm)}>➕ Registrar Pago</button>
                    <button className="btn btn-ghost btn-sm" onClick={exportPayments}>📥 Excel</button>
                </div>
            </div>
            <div className="page-body">
                {/* Stats */}
                <div className="stats-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                    <div className="glass stat-card stat-green"><div className="stat-icon">💰</div><div className="stat-value">RD${totalGanancia.toLocaleString()}</div><div className="stat-label">Ganancia Total</div></div>
                    <div className="glass stat-card stat-blue"><div className="stat-icon">💸</div><div className="stat-value">RD${totalPagado.toLocaleString()}</div><div className="stat-label">Pagado a Empleadas</div></div>
                    <div className="glass stat-card stat-purple"><div className="stat-icon">📄</div><div className="stat-value">{payments.length}</div><div className="stat-label">Total Pagos</div></div>
                </div>

                {/* Payment Form */}
                {showForm && (
                    <div className="panel-section mb-4">
                        <div className="panel-section-header"><h3>➕ Nuevo Pago</h3></div>
                        <div className="panel-section-body">
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Servicio completado</label>
                                    <select className="form-control" value={form.serviceId} onChange={e => setForm(p => ({ ...p, serviceId: e.target.value }))}>
                                        <option value="">Seleccionar servicio...</option>
                                        {services.map(s => <option key={s.id} value={s.id}>{s.clienteNombre} — {s.empleadaNombre} (RD${s.precio})</option>)}
                                    </select>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Monto total (RD$)</label>
                                    <input type="number" className="form-control" value={form.montoTotal} onChange={e => setForm(p => ({ ...p, montoTotal: e.target.value }))} placeholder="Ej: 2500" />
                                </div>
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label className="form-label">Comisión (%)</label>
                                    <input type="number" className="form-control" value={form.comision} onChange={e => setForm(p => ({ ...p, comision: e.target.value }))} />
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Notas</label>
                                    <input className="form-control" value={form.notas} onChange={e => setForm(p => ({ ...p, notas: e.target.value }))} placeholder="Opcional" />
                                </div>
                            </div>
                            {form.montoTotal && (
                                <div className="glass" style={{ padding: 16, marginBottom: 16, borderRadius: 10 }}>
                                    <div className="flex gap-3" style={{ justifyContent: 'space-around', textAlign: 'center' }}>
                                        <div><div className="text-sm text-muted">Ganancia</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--success)' }}>RD${(parseFloat(form.montoTotal) * (form.comision / 100)).toLocaleString()}</div></div>
                                        <div><div className="text-sm text-muted">Pago Empleada</div><div style={{ fontSize: 20, fontWeight: 800, color: 'var(--info)' }}>RD${(parseFloat(form.montoTotal) * (1 - form.comision / 100)).toLocaleString()}</div></div>
                                    </div>
                                </div>
                            )}
                            <button className="btn btn-success" onClick={registerPayment}>💰 Registrar Pago</button>
                        </div>
                    </div>
                )}

                {/* Payments List */}
                <div className="panel-section">
                    <div className="panel-section-header"><h3>📋 Historial de Pagos</h3></div>
                    <div className="panel-section-body no-pad">
                        {payments.length === 0 ? (
                            <div className="empty-state"><div className="empty-icon">💰</div><h3>Sin pagos</h3><p>No hay pagos registrados aún</p></div>
                        ) : payments.map(p => (
                            <div key={p.id} className="payment-item">
                                <div>
                                    <strong>{p.clienteNombre}</strong> → {p.empleadaNombre}
                                    <div className="payment-date">Comisión: {p.comision}% | Ganancia: RD${p.ganancia?.toLocaleString()} | Empleada: RD${p.pagoEmpleada?.toLocaleString()}</div>
                                </div>
                                <div className="flex gap-2" style={{ alignItems: 'center' }}>
                                    <span className="payment-amount">RD${p.montoTotal?.toLocaleString()}</span>
                                    <button className="btn btn-ghost btn-sm" onClick={() => generateReceipt(p, 'cliente')}>📄 Cliente</button>
                                    <button className="btn btn-ghost btn-sm" onClick={() => generateReceipt(p, 'empleada')}>📄 Empleada</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </>
    );
}
