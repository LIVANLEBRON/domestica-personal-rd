import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import { uploadToCloudinary } from '../../utils/cloudinary';

export default function Profile() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    // Upload states
    const [cedulaFile, setCedulaFile] = useState(null);
    const [cedulaPreview, setCedulaPreview] = useState(null);
    const [fotoFile, setFotoFile] = useState(null);
    const [fotoPreview, setFotoPreview] = useState(null);

    useEffect(() => {
        if (user) loadProfile();
    }, [user]);

    async function loadProfile() {
        const snap = await getDoc(doc(db, 'empleadas', user.uid));
        if (snap.exists()) setProfile(snap.data());
        setLoading(false);
    }

    async function saveProfile() {
        setSaving(true);
        try {
            let cedulaURL = profile.cedulaURL;
            let fotoURL = profile.fotoURL;

            // Upload new Cedula if selected
            if (cedulaFile) {
                showToast('⏳ Subiendo nueva cédula...', 'info');
                cedulaURL = await uploadToCloudinary(cedulaFile);
            }

            // Upload new Profile Photo if selected
            if (fotoFile) {
                showToast('⏳ Subiendo nueva foto de perfil...', 'info');
                fotoURL = await uploadToCloudinary(fotoFile);
            }

            await updateDoc(doc(db, 'empleadas', user.uid), {
                nombre: profile.nombre,
                telefono: profile.telefono,
                sector: profile.sector,
                experiencia: profile.experiencia,
                disponibilidad: profile.disponibilidad,
                traslado: profile.traslado,
                referencias: profile.referencias || '',
                cedulaURL,
                fotoURL
            });
            await updateDoc(doc(db, 'usuarios', user.uid), {
                nombre: profile.nombre,
                telefono: profile.telefono
            });

            setProfile(prev => ({ ...prev, cedulaURL, fotoURL }));
            setCedulaFile(null);
            setFotoFile(null);
            showToast('✅ Perfil actualizado exitosamente', 'success');
        } catch (err) {
            console.error(err);
            showToast('Error: ' + err.message, 'error');
        }
        setSaving(false);
    }

    function getLocation() {
        if (!navigator.geolocation) { showToast('Geolocalización no soportada', 'error'); return; }
        showToast('⏳ Obteniendo ubicación...', 'info');
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lng = pos.coords.longitude;
                await updateDoc(doc(db, 'empleadas', user.uid), { lat, lng });
                setProfile(prev => ({ ...prev, lat, lng }));
                showToast('📍 Ubicación actualizada', 'success');
            },
            () => showToast('❌ Error de ubicación', 'error'),
            { enableHighAccuracy: true }
        );
    }

    if (loading) return <div className="loading-screen"><div className="loading-spinner" /></div>;

    const update = (field) => (e) => setProfile(prev => ({ ...prev, [field]: e.target.value }));

    const handleFileChange = (e, setter, previewSetter) => {
        const file = e.target.files[0];
        if (file) {
            setter(file);
            const reader = new FileReader();
            reader.onload = (ev) => previewSetter(ev.target.result);
            reader.readAsDataURL(file);
        }
    };

    return (
        <>
            <div className="page-header">
                <div><h1 className="page-title">Mi Perfil</h1><p className="page-subtitle">Edita tu información personal</p></div>
            </div>
            <div className="page-body">
                <div className="profile-grid">
                    {/* Personal Info */}
                    <div className="profile-section">
                        <h3>👤 Información Personal</h3>
                        <div className="form-group">
                            <label className="form-label">Nombre completo</label>
                            <input className="form-control" value={profile?.nombre || ''} onChange={update('nombre')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Teléfono</label>
                            <input type="tel" className="form-control" value={profile?.telefono || ''} onChange={update('telefono')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Sector donde vive</label>
                            <input className="form-control" value={profile?.sector || ''} onChange={update('sector')} />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Experiencia</label>
                            <select className="form-control" value={profile?.experiencia || ''} onChange={update('experiencia')}>
                                <option value="sin_experiencia">Sin experiencia</option>
                                <option value="menos_1">Menos de 1 año</option>
                                <option value="1_3">1 a 3 años</option>
                                <option value="3_5">3 a 5 años</option>
                                <option value="mas_5">Más de 5 años</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Traslado</label>
                            <select className="form-control" value={profile?.traslado || ''} onChange={update('traslado')}>
                                <option value="no">Sin problema</option>
                                <option value="si">Con dificultad</option>
                                <option value="depende">Depende de la zona</option>
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Referencias</label>
                            <input className="form-control" value={profile?.referencias || ''} onChange={update('referencias')} placeholder="Nombre o teléfono de referencia" />
                        </div>
                        <button className="btn btn-primary btn-block" onClick={saveProfile} disabled={saving}>
                            {saving ? 'Guardando...' : '💾 Guardar cambios'}
                        </button>
                    </div>

                    {/* Location & Availability */}
                    <div className="profile-section">
                        <h3>📍 Ubicación y Disponibilidad</h3>
                        <div className="form-group">
                            <label className="form-label">Disponibilidad</label>
                            <select className="form-control" value={profile?.disponibilidad !== false ? 'true' : 'false'} onChange={e => setProfile(prev => ({ ...prev, disponibilidad: e.target.value === 'true' }))}>
                                <option value="true">🟢 Disponible</option>
                                <option value="false">🔴 No disponible</option>
                            </select>
                        </div>

                        <div className="form-group">
                            <label className="form-label">Coordenadas actuales</label>
                            {profile?.lat ? (
                                <div className="location-info success">📍 Lat: {profile.lat.toFixed(4)}, Lng: {profile.lng.toFixed(4)}</div>
                            ) : (
                                <div className="location-info">No hay ubicación registrada</div>
                            )}
                        </div>

                        <button type="button" className="location-btn" onClick={getLocation}>
                            📍 Actualizar mi ubicación
                        </button>

                        <div className="form-group" style={{ marginTop: 24, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border)' }}>
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                📷 Foto de Perfil Opcional
                            </label>

                            {(fotoPreview || profile?.fotoURL) && (
                                <div style={{ marginBottom: 12 }}>
                                    <img src={fotoPreview || profile.fotoURL} style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: '50%', border: '2px solid var(--primary)' }} alt="Perfil" />
                                </div>
                            )}

                            <label style={{ display: 'inline-block', padding: '10px 16px', background: 'rgba(59,130,246,0.1)', color: '#3b82f6', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                {fotoFile ? '✅ Archivo seleccionado' : 'Subir o cambiar foto'}
                                <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setFotoFile, setFotoPreview)} style={{ display: 'none' }} />
                            </label>
                        </div>

                        <div className="form-group" style={{ marginTop: 16, padding: 16, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid var(--border)' }}>
                            <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                🪪 Documento de Cédula
                            </label>

                            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>Sube una foto clara de tu cédula por ambos lados o solo frente si se lee bien.</p>

                            {(cedulaPreview || profile?.cedulaURL) && (
                                <div style={{ marginBottom: 12 }}>
                                    <img src={cedulaPreview || profile.cedulaURL} style={{ maxWidth: '100%', maxHeight: 200, objectFit: 'cover', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }} alt="Cédula" />
                                </div>
                            )}

                            <label style={{ display: 'inline-block', padding: '10px 16px', background: 'rgba(139,92,246,0.1)', color: '#8b5cf6', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                                {cedulaFile ? '✅ Archivo seleccionado' : (profile?.cedulaURL ? 'Cambiar cédula' : 'Subir foto de cédula')}
                                <input type="file" accept="image/*" onChange={(e) => handleFileChange(e, setCedulaFile, setCedulaPreview)} style={{ display: 'none' }} />
                            </label>
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}
