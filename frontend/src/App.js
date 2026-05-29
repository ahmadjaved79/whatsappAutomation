import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Contacts from './pages/Contacts';
import Template from './pages/Template';
import Orders from './pages/Orders';
import Menu from './pages/Menu';
import RevenueReports from './pages/RevenueReports';
import CustomerProfiles from './pages/CustomerProfiles';
import ScheduleBroadcast from './pages/ScheduleBroadcast';
import ManualMessage from './pages/ManualMessage';
import StockManager from './pages/StockManager';
import './App.css';
import './responsive.css';

// Auth guard
const RequireAuth = ({ children }) => {
  const token = localStorage.getItem('admin_token');
  if (!token) return <Navigate to="/login" replace />;
  return children;
};

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{
        style: { fontFamily:'inherit', fontSize:'14px', borderRadius:'10px' },
        success: { iconTheme:{ primary:'#1A7A4A', secondary:'#fff' } },
        error:   { iconTheme:{ primary:'#C8102E', secondary:'#fff' } },
      }} />
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/" element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={<Navigate to="/dashboard" replace />} />
          <Route path="dashboard"       element={<Dashboard />} />
          <Route path="contacts"        element={<Contacts />} />
          <Route path="template"        element={<Template />} />
          <Route path="orders"          element={<Orders />} />
          <Route path="menu"            element={<Menu />} />
          <Route path="revenue"         element={<RevenueReports />} />
          <Route path="customers"       element={<CustomerProfiles />} />
          <Route path="schedule"        element={<ScheduleBroadcast />} />
          <Route path="manual-message"  element={<ManualMessage />} />
          <Route path="stock"           element={<StockManager />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}