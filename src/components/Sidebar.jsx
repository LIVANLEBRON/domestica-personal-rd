import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Sidebar({ role }) {
    const { userData, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = async () => {
        await logout();
        navigate('/');
    };

    const adminLinks = [
        { to: '/admin', icon: '📊', label: 'Dashboard' },
        { to: '/admin/solicitudes', icon: '🔔', label: 'Solicitudes' },
        { to: '/admin/asignacion', icon: '⚡', label: 'Asignación' },
        { to: '/admin/catalogo', icon: '🛒', label: 'Catálogo' },
        { to: '/admin/empleadas', icon: '👩', label: 'Empleadas' },
        { to: '/admin/clientes', icon: '👥', label: 'Clientes' },
        { to: '/admin/servicios', icon: '📋', label: 'Servicios' },
        { to: '/admin/finanzas', icon: '💰', label: 'Finanzas' },
    ];

    const empLinks = [
        { to: '/empleada', icon: '📋', label: 'Mis Trabajos' },
        { to: '/empleada/perfil', icon: '👤', label: 'Mi Perfil' },
    ];

    const links = role === 'admin' ? adminLinks : empLinks;

    return (
        <aside className="sidebar" id="sidebar">
            <div className="sidebar-logo">
                <div className="logo-icon">🏠</div>
                <div className="logo-text">Doméstica<br /><span>Personal RD</span></div>
            </div>
            <nav className="sidebar-nav">
                <div className="nav-section-label">{role === 'admin' ? 'Principal' : 'Mi Panel'}</div>
                {links.map(l => (
                    <NavLink key={l.to} to={l.to} end className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}>
                        <span className="nav-icon">{l.icon}</span> {l.label}
                    </NavLink>
                ))}
            </nav>
            <div className="sidebar-footer">
                <div className="user-info">
                    <div className="user-avatar">{(userData?.nombre || 'U')[0].toUpperCase()}</div>
                    <div className="user-details">
                        <div className="user-name">{userData?.nombre || 'Usuario'}</div>
                        <div className="user-role">{role === 'admin' ? 'Administrador' : 'Empleada'}</div>
                    </div>
                </div>
                <button className="nav-item" onClick={handleLogout} style={{ color: 'var(--danger)' }}>
                    <span className="nav-icon">🚪</span> Cerrar Sesión
                </button>
            </div>
        </aside>
    );
}
