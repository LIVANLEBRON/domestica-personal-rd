import { useState, useEffect } from 'react';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';

export default function Profile() {
    const { user } = useAuth();
    const { showToast } = useToast();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

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
            await updateDoc(doc(db, 'empleadas', user.uid), {
                nombre: profile.nombre,
                telefono: profile.telefono,
                sector: profile.sector,
                experiencia: profile.experiencia,
                disponibilidad: profile.disponibilidad,
                traslado: profile.traslado,
                referencias: profile.referencias || ''
            });
            await updateDoc(doc(db, 'usuarios', user.uid), {
                nombre: profile.nombre,
                telefono: profile.telefono
            });
            showToast('✅ Perfil actualizado', 'success');
        } catch (err) {
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

                        {profile?.cedulaURL && (
                            <div style={{ marginTop: 24 }}>
                                <label className="form-label">📷 Foto de cédula</label>
                                <img src={profile.cedulaURL} style={{ maxWidth: '100%', maxHeight: 200, borderRadius: 8 }} alt="Cédula" />
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}
