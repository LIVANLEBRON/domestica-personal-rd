import { useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { db, storage } from '../firebase';

export default function Register() {
    const [form, setForm] = useState({
        nombre: '', edad: '', sector: '', experiencia: 'sin_experiencia',
        traslado: 'no', telefono: '', email: '', password: '', password2: '',
        nacionalidad: '', referencias: ''
    });
    const [location, setLocation] = useState({ lat: null, lng: null });
    const [locationStatus, setLocationStatus] = useState('');
    const [cedulaFile, setCedulaFile] = useState(null);
    const [cedulaPreview, setCedulaPreview] = useState('');
    const [loading, setLoading] = useState(false);
    const fileRef = useRef();
    const { register } = useAuth();
    const { showToast } = useToast();
    const navigate = useNavigate();

    const update = (field) => (e) => setForm(prev => ({ ...prev, [field]: e.target.value }));

    const getLocation = () => {
        setLocationStatus('loading');
        if (!navigator.geolocation) { setLocationStatus('error'); return; }
        navigator.geolocation.getCurrentPosition(
            (pos) => {
                setLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                setLocationStatus('success');
            },
            () => setLocationStatus('error'),
            { enableHighAccuracy: true }
        );
    };

    const handleCedula = (e) => {
        const file = e.target.files[0];
        if (file) {
            setCedulaFile(file);
            const reader = new FileReader();
            reader.onload = (ev) => setCedulaPreview(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (form.password !== form.password2) { showToast('Las contraseñas no coinciden', 'error'); return; }
        setLoading(true);

        try {
            const { uid } = await register(form.email, form.password);

            let cedulaURL = null;
            if (cedulaFile) {
                const storageRef = ref(storage, `cedulas/${uid}_${cedulaFile.name}`);
                await uploadBytes(storageRef, cedulaFile);
                cedulaURL = await getDownloadURL(storageRef);
            }

            await setDoc(doc(db, 'usuarios', uid), {
                nombre: form.nombre, email: form.email, telefono: form.telefono,
                rol: 'empleada', estado: 'pendiente', creadoEn: serverTimestamp()
            });

            await setDoc(doc(db, 'empleadas', uid), {
                nombre: form.nombre, email: form.email,
                edad: parseInt(form.edad) || null,
                nacionalidad: form.nacionalidad,
                sector: form.sector, direccion: form.sector,
                experiencia: form.experiencia,
                traslado: form.traslado,
                telefono: form.telefono,
                referencias: form.referencias,
                cedulaURL,
                disponibilidad: true, estado: 'pendiente',
                lat: location.lat, lng: location.lng,
                creadoEn: serverTimestamp()
            });

            showToast('¡Cuenta creada! Pendiente de aprobación.', 'success');
            setTimeout(() => navigate('/empleada'), 1500);
        } catch (err) {
            showToast(err.message || 'Error al registrar', 'error');
        }
        setLoading(false);
    };

    return (
        <div className="auth-page">
            <div className="auth-card wide">
                <div className="auth-brand">
                    <div className="brand-icon">📝</div>
                    <h1>Crear Cuenta</h1>
                    <p>Regístrate como empleada doméstica</p>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="form-group">
                        <label className="form-label">1. Nombre completo</label>
                        <input className="form-control" value={form.nombre} onChange={update('nombre')} placeholder="Tu nombre completo" required />
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">2. Edad</label>
                            <input type="number" className="form-control" value={form.edad} onChange={update('edad')} placeholder="Ej: 28" required min="18" max="70" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">7. Nacionalidad</label>
                            <select className="form-control" value={form.nacionalidad} onChange={update('nacionalidad')} required>
                                <option value="">Seleccionar...</option>
                                <option value="dominicana">Dominicana</option>
                                <option value="haitiana">Haitiana</option>
                                <option value="venezolana">Venezolana</option>
                                <option value="colombiana">Colombiana</option>
                                <option value="otra">Otra</option>
                            </select>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">3. ¿Dónde vive? (sector)</label>
                        <input className="form-control" value={form.sector} onChange={update('sector')} placeholder="Ej: Gazcue, Santo Domingo" required />
                    </div>

                    <div className="form-group">
                        <label className="form-label">4. ¿Cuántos años de experiencia en limpieza?</label>
                        <select className="form-control" value={form.experiencia} onChange={update('experiencia')}>
                            <option value="sin_experiencia">Sin experiencia previa</option>
                            <option value="menos_1">Menos de 1 año</option>
                            <option value="1_3">1 a 3 años</option>
                            <option value="3_5">3 a 5 años</option>
                            <option value="mas_5">Más de 5 años</option>
                        </select>
                    </div>

                    <div className="form-group">
                        <label className="form-label">5. ¿Tiene problemas de traslado?</label>
                        <select className="form-control" value={form.traslado} onChange={update('traslado')}>
                            <option value="no">No, puedo trasladarme sin problema</option>
                            <option value="si">Sí, tengo dificultades de traslado</option>
                            <option value="depende">Depende de la zona</option>
                        </select>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">6. Número de teléfono</label>
                            <input type="tel" className="form-control" value={form.telefono} onChange={update('telefono')} placeholder="809-000-0000" required />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Correo electrónico</label>
                            <input type="email" className="form-control" value={form.email} onChange={update('email')} placeholder="tu@email.com" required />
                        </div>
                    </div>

                    <div className="form-row">
                        <div className="form-group">
                            <label className="form-label">Contraseña</label>
                            <input type="password" className="form-control" value={form.password} onChange={update('password')} placeholder="Mínimo 6 caracteres" required minLength="6" />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Confirmar contraseña</label>
                            <input type="password" className="form-control" value={form.password2} onChange={update('password2')} placeholder="Repetir contraseña" required />
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Referencias (opcional)</label>
                        <input className="form-control" value={form.referencias} onChange={update('referencias')} placeholder="Nombre o teléfono de referencia laboral" />
                    </div>

                    <div className="form-group">
                        <label className="form-label">8. Foto de cédula</label>
                        <div className={`photo-upload${cedulaFile ? ' has-file' : ''}`} onClick={() => fileRef.current.click()}>
                            <div className="upload-icon">📷</div>
                            <div className="upload-text">{cedulaFile ? `✅ ${cedulaFile.name}` : 'Haz clic para subir foto de tu cédula'}</div>
                            <input ref={fileRef} type="file" accept="image/*" onChange={handleCedula} style={{ display: 'none' }} />
                            {cedulaPreview && <img src={cedulaPreview} className="photo-preview" alt="Cédula" />}
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">📍 Ubicación (para el mapa)</label>
                        <button type="button" className="location-btn" onClick={getLocation}>
                            {locationStatus === 'loading' ? '⏳ Obteniendo...' : locationStatus === 'success' ? '✅ Ubicación obtenida' : '📍 Obtener mi ubicación actual'}
                        </button>
                        <div className={`location-info${locationStatus === 'success' ? ' success' : ''}`}>
                            {locationStatus === 'success' ? `📍 Lat: ${location.lat?.toFixed(4)}, Lng: ${location.lng?.toFixed(4)}` :
                                locationStatus === 'error' ? '❌ No se pudo obtener la ubicación' :
                                    'Necesitamos tu ubicación para mostrarte en el mapa.'}
                        </div>
                    </div>

                    <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                        {loading ? <><span className="loading-spinner" /> Registrando...</> : 'Crear mi cuenta'}
                    </button>
                </form>

                <div className="auth-footer">
                    ¿Ya tienes cuenta? <Link to="/">Iniciar sesión</Link>
                </div>
            </div>
        </div>
    );
}
