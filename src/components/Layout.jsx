import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function Layout({ role }) {
    const [open, setOpen] = useState(false);

    return (
        <>
            <button className="mobile-toggle" onClick={() => setOpen(!open)}>☰</button>
            {open && <div className="sidebar-overlay show" onClick={() => setOpen(false)} />}
            <div className="layout">
                <div className={open ? 'sidebar open' : ''} style={open ? {} : undefined}>
                    <Sidebar role={role} />
                </div>
                <main className="main-content">
                    <Outlet />
                </main>
            </div>
        </>
    );
}
