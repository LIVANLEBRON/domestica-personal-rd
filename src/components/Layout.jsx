import { useState, useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout({ role }) {
    const [open, setOpen] = useState(false);
    const location = useLocation();

    // Close sidebar on route change
    useEffect(() => {
        setOpen(false);
    }, [location]);

    // Lock body scroll when sidebar is open
    useEffect(() => {
        if (open) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = '';
        }
        return () => {
            document.body.style.overflow = '';
        };
    }, [open]);

    return (
        <>
            <button className="mobile-toggle" onClick={() => setOpen(!open)}>☰</button>
            {open && <div className="sidebar-overlay show" onClick={() => setOpen(false)} />}
            <div className="layout">
                <div className={open ? 'sidebar open' : 'sidebar'}>
                    <Sidebar role={role} />
                </div>
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
        </>
    );
}
