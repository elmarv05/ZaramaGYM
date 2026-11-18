// ============================================================================
// COMPONENTE PRINCIPAL: SHELL DE 4 COMPONENTES, BUSCADOR CTRL+K Y RBAC (SLICE 9)
// Estructura: Sidebar Izquierdo + Header Superior + Main Fluido + Footer Compacto
// Ubicación: src/App.tsx
// ============================================================================

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert } from './components/primitives/Alert';
import { Badge } from './components/primitives/Badge';
import { Button } from './components/primitives/Button';
import { Icon, IconName } from './components/primitives/Icon';
import { AppShellSkeleton } from './components/primitives/Skeleton';
import { fileToDataUrl } from './domain/user';
import { useAudit } from './hooks/useAudit';
import { useAuth } from './hooks/useAuth';
import { useEntities } from './hooks/useEntities';
import { useTheme } from './hooks/useTheme';
import { useUsers } from './hooks/useUsers';
import { userIpc } from './services/ipc/userIpc';
import { AttendanceMainTab, AttendanceView } from './features/attendance/AttendanceView';
import { AuditLogViewer } from './features/audit/AuditLogViewer';
import { ChangePasswordModal } from './features/auth/ChangePasswordModal';
import { LockModal } from './features/auth/LockModal';
import { LoginForm } from './features/auth/LoginForm';
import { UserManagementTable } from './features/auth/UserManagementTable';
import { CatalogSubTab, CatalogView } from './features/catalog/CatalogView';
import { DirectorySubTab, EntityDirectoryView } from './features/entities/EntityDirectoryView';
import { FinanceMainTab, FinanceView } from './features/finance/FinanceView';
import { HomeDashboardView } from './features/home/HomeDashboardView';
import { LanServerView } from './features/lan/LanServerView';
import { PosMainTab, PosView } from './features/pos/PosView';
import {
  PrintingBackupTab,
  PrintingBackupView,
} from './features/printing_backup/PrintingBackupView';
import { ReceptionDashboard } from './features/reception/ReceptionDashboard';

export type NavigationTab =
  | 'home'
  | 'directory'
  | 'users'
  | 'audit'
  | 'reception'
  | 'catalog'
  | 'pos'
  | 'attendance'
  | 'lan'
  | 'finance'
  | 'printing_backup';

interface NavItemConfig {
  id: NavigationTab;
  label: string;
  icon: IconName;
  group: 'Operación' | 'Gestión y Catálogo' | 'Administración y Red';
  roles: Array<'ADMINISTRADOR' | 'SUPERVISOR' | 'RECEPCIONISTA'>;
}

interface SearchCommandItem {
  id: string;
  title: string;
  subtitle: string;
  tab: NavigationTab;
  icon: IconName;
  keywords: string;
  roles: Array<'ADMINISTRADOR' | 'SUPERVISOR' | 'RECEPCIONISTA'>;
  onSelect: () => void;
}

export const App: React.FC = () => {
  const {
    session,
    isLoading: isSessionLoading,
    isActionLoading: isAuthActionLoading,
    error: authError,
    login,
    logout,
    lockSession,
    unlockSession,
    changePassword,
    checkSession,
    clearError: clearAuthError,
  } = useAuth();

  const { theme, toggleTheme } = useTheme();

  const [activeTab, setActiveTab] = useState<NavigationTab>('directory');
  const [posInitialTab, setPosInitialTab] = useState<PosMainTab>('pos');
  const [directoryInitialSubTab, setDirectoryInitialSubTab] =
    useState<DirectorySubTab>('clients');
  const [catalogInitialTab, setCatalogInitialTab] = useState<CatalogSubTab>('planes');
  const [financeInitialTab, setFinanceInitialTab] =
    useState<FinanceMainTab>('dashboard');
  const [printingInitialTab, setPrintingInitialTab] =
    useState<PrintingBackupTab>('printer');
  const [attendanceInitialTab, setAttendanceInitialTab] =
    useState<AttendanceMainTab>('monitor');

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);

  // Estados de Sidebar (colapsable en desktop y drawer en <=767px / media pantalla)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Estados de Avatar de Perfil en Sidebar
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [currentPhoto, setCurrentPhoto] = useState<string | null>(null);

  // Buscador Inteligente Ctrl+K
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchContainerRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [selectedSearchIndex, setSelectedSearchIndex] = useState(0);

  useEffect(() => {
    setCurrentPhoto(session?.foto_perfil_data_url || null);
  }, [session?.foto_perfil_data_url, session?.user_id]);

  // Jerarquía de 3 roles
  const isAdmin = session?.rol === 'ADMINISTRADOR';
  const isSupervisor = session?.rol === 'SUPERVISOR';
  const isRecepcionista = session?.rol === 'RECEPCIONISTA';

  const canAccessUsers = Boolean((isAdmin || isSupervisor) && !session?.is_locked);
  const canAccessAudit = Boolean((isAdmin || isSupervisor) && !session?.is_locked);

  // Hook de Usuarios (Admin y Supervisor)
  const {
    users,
    isLoading: isUsersLoading,
    isActionLoading: isUserActionLoading,
    error: usersError,
    fetchUsers,
    createUser,
    updateUser,
    updatePhoto: updateOtherUserPhoto,
    toggleActive: toggleUserActive,
    clearError: clearUsersError,
  } = useUsers(canAccessUsers);

  // Hook de Auditoría (Admin y Supervisor)
  const {
    logs,
    filter: auditFilter,
    isLoading: isAuditLoading,
    error: auditError,
    setFilter: setAuditFilter,
    fetchLogs: fetchAuditLogs,
    clearError: clearAuditError,
  } = useAudit({}, canAccessAudit);

  // Hook de Entidades (Directorio Segmentado)
  const entitiesHook = useEntities(Boolean(session && !session.is_locked));

  const navigateToTab = (tab: NavigationTab) => {
    if (tab === 'pos') setPosInitialTab('pos');
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  // Definición de Navegación del Sidebar
  const navItems: NavItemConfig[] = useMemo(() => {
    const usersLabel = isSupervisor ? 'Gestión de Recepcionistas' : 'Gestión de Usuarios';
    return [
      {
        id: 'home',
        label: 'Inicio',
        icon: 'home',
        group: 'Operación',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
      },
      {
        id: 'reception',
        label: 'Panel Operativo',
        icon: 'dashboard',
        group: 'Operación',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
      },
      {
        id: 'attendance',
        label: 'Asistencias y Semáforo',
        icon: 'qr',
        group: 'Operación',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
      },
      {
        id: 'pos',
        label: 'Caja y POS',
        icon: 'pos',
        group: 'Operación',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
      },
      {
        id: 'directory',
        label: 'Directorio (Clientes / Proveedores / Personas)',
        icon: 'directory',
        group: 'Gestión y Catálogo',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
      },
      {
        id: 'catalog',
        label: 'Catálogo e Inventario',
        icon: 'catalog',
        group: 'Gestión y Catálogo',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
      },
      {
        id: 'finance',
        label: 'Compras, Gastos y Finanzas',
        icon: 'finance',
        group: 'Gestión y Catálogo',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
      },
      {
        id: 'printing_backup',
        label: 'Impresión, PDFs y Backups',
        icon: 'printer',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
      },
      {
        id: 'users',
        label: usersLabel,
        icon: 'users',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
      },
      {
        id: 'audit',
        label: 'Bitácora de Auditoría',
        icon: 'audit',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
      },
      {
        id: 'lan',
        label: 'Wi-Fi & Escáner Móvil',
        icon: 'wifi',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
      },
    ];
  }, [isSupervisor]);

  const visibleNavItems = useMemo(() => {
    if (!session) return [];
    return navItems.filter((item) => item.roles.includes(session.rol));
  }, [navItems, session]);

  const groupedNavItems = useMemo(() => {
    const groups: Array<NavItemConfig['group']> = [
      'Operación',
      'Gestión y Catálogo',
      'Administración y Red',
    ];
    return groups
      .map((group) => ({
        group,
        items: visibleNavItems.filter((item) => item.group === group),
      }))
      .filter((g) => g.items.length > 0);
  }, [visibleNavItems]);

  // Índice de Buscador Inteligente (Módulos + Submódulos por palabras clave)
  const searchCatalog: SearchCommandItem[] = useMemo(() => {
    if (!session) return [];
    const allCommands: SearchCommandItem[] = [
      {
        id: 'cmd-home',
        title: 'Inicio — Dashboard y Atajos',
        subtitle: 'Pantalla principal y atajos rápidos de operador',
        tab: 'home',
        icon: 'home',
        keywords: 'inicio home dashboard resumen atajos teclas rapidas',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => setActiveTab('home'),
      },
      {
        id: 'cmd-reception',
        title: 'Panel Operativo',
        subtitle: 'Vista operativa de recepción y mostrador',
        tab: 'reception',
        icon: 'dashboard',
        keywords: 'panel operativo recepcion mostrador socios',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => setActiveTab('reception'),
      },
      {
        id: 'cmd-attendance-monitor',
        title: 'Asistencias QR y Semáforo',
        subtitle: 'Escáner QR de acceso, evaluación verde/ámbar/rojo',
        tab: 'attendance',
        icon: 'qr',
        keywords: 'asistencias semaforo qr check in entrada acceso pases rojo',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setAttendanceInitialTab('monitor');
          setActiveTab('attendance');
        },
      },
      {
        id: 'cmd-attendance-history',
        title: 'Asistencias -> Historial de Ingresos',
        subtitle: 'Registro diario de asistencias y marcaciones',
        tab: 'attendance',
        icon: 'clock',
        keywords: 'historial asistencias ingresos entradas reloj',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setAttendanceInitialTab('history');
          setActiveTab('attendance');
        },
      },
      {
        id: 'cmd-attendance-extensions',
        title: 'Asistencias -> Prórrogas y Recuperación',
        subtitle: 'Congelamientos, extensiones y días recuperados',
        tab: 'attendance',
        icon: 'refresh',
        keywords: 'prorrogas recuperacion congelamiento dias membresia',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setAttendanceInitialTab('extensions');
          setActiveTab('attendance');
        },
      },
      {
        id: 'cmd-pos-main',
        title: 'Caja y Punto de Venta (POS)',
        subtitle: 'Abrir/cerrar turno, arqueo físico, carrito y cobro mixto',
        tab: 'pos',
        icon: 'pos',
        keywords: 'caja pos punto de venta carrito cobro efectivo yape plin arqueo turno',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setPosInitialTab('pos');
          setActiveTab('pos');
        },
      },
      {
        id: 'cmd-pos-sales',
        title: 'Caja y POS -> Ventas del Turno',
        subtitle: 'Listado de ventas, tickets y tachado Paso 1',
        tab: 'pos',
        icon: 'receipt',
        keywords: 'ventas comprobantes tickets boletas historial tachado paso 1',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setPosInitialTab('ventas');
          setActiveTab('pos');
        },
      },
      {
        id: 'cmd-pos-debtors',
        title: 'Caja y POS -> Deudores y Créditos',
        subtitle: 'Cartera de cuentas por cobrar y amortizaciones',
        tab: 'pos',
        icon: 'credit-card',
        keywords: 'deudores creditos cuentas por cobrar amortizacion saldo pendiente',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setPosInitialTab('deudores');
          setActiveTab('pos');
        },
      },
      {
        id: 'cmd-pos-struck',
        title: 'Caja y POS -> Tachados (Admin)',
        subtitle: 'Resolución definitiva o reversión de ventas tachadas',
        tab: 'pos',
        icon: 'scissors',
        keywords: 'tachados anulacion bandeja admin resolver paso 2',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setPosInitialTab('tachados_admin');
          setActiveTab('pos');
        },
      },
      {
        id: 'cmd-dir-clients',
        title: 'Directorio -> Clientes y Socios QR',
        subtitle: 'Gestión de socios, peso corporal y credenciales QR',
        tab: 'directory',
        icon: 'users',
        keywords: 'directorio clientes socios qr peso salud',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setDirectoryInitialSubTab('clients');
          setActiveTab('directory');
        },
      },
      {
        id: 'cmd-dir-suppliers',
        title: 'Directorio -> Proveedores',
        subtitle: 'Proveedores naturales y jurídicos',
        tab: 'directory',
        icon: 'truck',
        keywords: 'directorio proveedores abastecimiento',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setDirectoryInitialSubTab('suppliers');
          setActiveTab('directory');
        },
      },
      {
        id: 'cmd-dir-persons',
        title: 'Directorio -> Base de Personas',
        subtitle: 'Maestro de personas naturales (DNI / CE)',
        tab: 'directory',
        icon: 'user',
        keywords: 'directorio personas naturales dni carnet extranjeria',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setDirectoryInitialSubTab('persons');
          setActiveTab('directory');
        },
      },
      {
        id: 'cmd-dir-companies',
        title: 'Directorio -> Empresas RUC 20',
        subtitle: 'Personas jurídicas SUNAT RUC 20 y razón social',
        tab: 'directory',
        icon: 'building',
        keywords: 'empresas ruc 20 sunat razon social juridicas directorio',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setDirectoryInitialSubTab('companies');
          setActiveTab('directory');
        },
      },
      {
        id: 'cmd-cat-plans',
        title: 'Catálogo -> Planes y Simulador Day Overflow',
        subtitle: 'Membresías mensuales, pases diarios y simulador de vigencia',
        tab: 'catalog',
        icon: 'sparkles',
        keywords: 'catalogo planes membresias day overflow simulador precios',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setCatalogInitialTab('planes');
          setActiveTab('catalog');
        },
      },
      {
        id: 'cmd-cat-products',
        title: 'Catálogo -> Productos e Inventario',
        subtitle: 'Stock actual, SKU, precios y alertas de reposición',
        tab: 'catalog',
        icon: 'package',
        keywords: 'catalogo productos inventario stock sku bebidas suplementos',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setCatalogInitialTab('productos');
          setActiveTab('catalog');
        },
      },
      {
        id: 'cmd-cat-kardex',
        title: 'Catálogo -> Kardex y Mermas',
        subtitle: 'Bitácora de movimientos, ajustes y registro de mermas',
        tab: 'catalog',
        icon: 'catalog',
        keywords: 'kardex mermas ajustes inventario perdidas movimientos',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setCatalogInitialTab('kardex');
          setActiveTab('catalog');
        },
      },
      {
        id: 'cmd-fin-dashboard',
        title: 'Finanzas -> Dashboard Financiero',
        subtitle: 'Ingresos, egresos, rentabilidad y exportación PDF',
        tab: 'finance',
        icon: 'finance',
        keywords: 'finanzas dashboard ingresos egresos utilidad reporte pdf',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setFinanceInitialTab('dashboard');
          setActiveTab('finance');
        },
      },
      {
        id: 'cmd-fin-purchases',
        title: 'Finanzas -> Compras a Proveedores',
        subtitle: 'Facturas de compra e ingreso de mercadería al Kardex',
        tab: 'finance',
        icon: 'truck',
        keywords: 'finanzas compras facturas proveedores mercaderia',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setFinanceInitialTab('compras');
          setActiveTab('finance');
        },
      },
      {
        id: 'cmd-fin-expenses',
        title: 'Finanzas -> Gastos Operativos',
        subtitle: 'Registro de egresos de caja física y digital',
        tab: 'finance',
        icon: 'cash',
        keywords: 'finanzas gastos operativos egresos servicios luz agua alquiler',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setFinanceInitialTab('gastos');
          setActiveTab('finance');
        },
      },
      {
        id: 'cmd-print-printer',
        title: 'Impresión -> Impresora Térmica y SMTP',
        subtitle: 'Bobina 58mm/80mm, simulador de ticket y correo SMTP',
        tab: 'printing_backup',
        icon: 'printer',
        keywords: 'impresion impresora termica 58mm 80mm ticket smtp correo',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setPrintingInitialTab('printer');
          setActiveTab('printing_backup');
        },
      },
      {
        id: 'cmd-print-series',
        title: 'Impresión -> Series de Comprobantes',
        subtitle: 'Configuración de series y correlativos de tickets/boletas',
        tab: 'printing_backup',
        icon: 'receipt',
        keywords: 'impresion series correlativos boleta factura ticket',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setPrintingInitialTab('series');
          setActiveTab('printing_backup');
        },
      },
      {
        id: 'cmd-print-backups',
        title: 'Impresión -> Respaldos y Backups',
        subtitle: 'Copias de seguridad SQLite, verificación SHA-256 y Drive',
        tab: 'printing_backup',
        icon: 'database',
        keywords: 'respaldos backup sqlite base de datos exportar gdrive sha256',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => {
          setPrintingInitialTab('backups');
          setActiveTab('printing_backup');
        },
      },
      {
        id: 'cmd-users',
        title: isSupervisor ? 'Gestión de Recepcionistas' : 'Gestión de Usuarios',
        subtitle: 'Cuentas, roles RBAC y credenciales de operadores',
        tab: 'users',
        icon: 'users',
        keywords: 'usuarios recepcionistas supervisores administradores roles cuentas',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => setActiveTab('users'),
      },
      {
        id: 'cmd-audit',
        title: 'Bitácora de Auditoría',
        subtitle: 'Trazabilidad inmutable de eventos y seguridad',
        tab: 'audit',
        icon: 'audit',
        keywords: 'auditoria bitacora logs eventos seguridad',
        roles: ['ADMINISTRADOR', 'SUPERVISOR'],
        onSelect: () => setActiveTab('audit'),
      },
      {
        id: 'cmd-lan',
        title: 'Wi-Fi & Escáner Móvil (LAN)',
        subtitle: 'Servidor local HTTPS :3443, mDNS y vinculación móvil',
        tab: 'lan',
        icon: 'wifi',
        keywords: 'wifi lan servidor local escaner movil https certificado qr',
        roles: ['ADMINISTRADOR', 'SUPERVISOR', 'RECEPCIONISTA'],
        onSelect: () => setActiveTab('lan'),
      },
    ];

    return allCommands.filter((cmd) => cmd.roles.includes(session.rol));
  }, [session, isSupervisor]);

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return searchCatalog.slice(0, 8);
    const terms = q.split(/\s+/);
    return searchCatalog
      .filter((item) => {
        const haystack =
          `${item.title} ${item.subtitle} ${item.keywords}`.toLowerCase();
        return terms.every((t) => haystack.includes(t));
      })
      .slice(0, 10);
  }, [searchCatalog, searchQuery]);

  const handleExecuteSearchItem = (item: SearchCommandItem) => {
    item.onSelect();
    setSearchQuery('');
    setIsSearchOpen(false);
    setIsMobileSidebarOpen(false);
    searchInputRef.current?.blur();
  };

  // Atajos Globales de Teclado (Ctrl+K, F2, F4, F9, Escape)
  useEffect(() => {
    if (!session || session.is_locked) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
        setSelectedSearchIndex(0);
        searchInputRef.current?.focus();
        return;
      }

      if (e.key === 'F2') {
        e.preventDefault();
        setActiveTab(session.rol === 'RECEPCIONISTA' ? 'reception' : 'directory');
        return;
      }

      if (e.key === 'F4') {
        e.preventDefault();
        setAttendanceInitialTab('monitor');
        setActiveTab('attendance');
        return;
      }

      if (e.key === 'F9') {
        e.preventDefault();
        setPosInitialTab('pos');
        setActiveTab('pos');
        return;
      }

      if (e.key === 'Escape') {
        setIsSearchOpen(false);
        setIsMobileSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [session]);

  // Cierra el dropdown de búsqueda al hacer clic fuera
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(e.target as Node)
      ) {
        setIsSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getInitials = (name: string): string => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  const handleAvatarClick = () => {
    if (!isUploadingPhoto && !isAuthActionLoading && fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !session) return;

    try {
      setIsUploadingPhoto(true);
      const dataUrl = await fileToDataUrl(file);
      await userIpc.updateUserPhoto(session.user_id, dataUrl);
      setCurrentPhoto(dataUrl);
    } catch (err) {
      console.error('Error al subir la foto de perfil:', err);
    } finally {
      setIsUploadingPhoto(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 1. Estado de Carga Inicial del Sistema (Esqueleto Pulsante de 4 Componentes)
  if (isSessionLoading) {
    return <AppShellSkeleton />;
  }

  // 2. Estado No Autenticado -> Formulario de Login Split-Screen a pantalla completa
  if (!session) {
    return (
      <main className="h-dvh w-full overflow-hidden flex bg-canvas">
        <LoginForm
          onLogin={login}
          isLoading={isAuthActionLoading}
          error={authError}
          onClearError={clearAuthError}
        />
      </main>
    );
  }

  const handleToggleSidebar = () => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsMobileSidebarOpen((prev) => !prev);
    } else {
      setIsSidebarCollapsed((prev) => !prev);
    }
  };

  // 3. Estado Autenticado: Shell de 4 Componentes fijado al viewport (Sidebar + Header + Main + Footer)
  return (
    <div className="h-dvh w-full flex overflow-hidden bg-canvas text-txt-primary">
      {/* Backdrop móvil / media pantalla */}
      {isMobileSidebarOpen && (
        <div
          aria-hidden="true"
          onClick={() => setIsMobileSidebarOpen(false)}
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-xs md:hidden zg-modal-backdrop"
        />
      )}

      {/* 1. SIDEBAR IZQUIERDO COLAPSABLE CON SCROLL INDEPENDIENTE */}
      <aside
        aria-label="Navegación lateral ZaramaGYM"
        className={`fixed inset-y-0 left-0 z-40 md:static md:inset-auto h-full flex flex-col overflow-hidden bg-surface border-r border-border transition-all duration-200 select-none ${
          isMobileSidebarOpen ? 'translate-x-0 w-72 shadow-xl' : '-translate-x-full md:translate-x-0'
        } ${isSidebarCollapsed ? 'md:w-20' : 'md:w-72'} shrink-0`}
      >
        {/* Cabecera del Sidebar */}
        <div className="h-16 px-4 border-b border-border flex items-center justify-between gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigateToTab('home')}
              className="flex items-center gap-2.5 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus rounded-lg p-1"
              title="Ir a Inicio"
            >
              <img
                src="/zaramagym-logo.png"
                alt="ZaramaGYM"
                className="w-9 h-9 rounded-lg object-contain shrink-0 bg-canvas-subtle p-0.5 border border-border"
              />
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-sm font-black tracking-tight text-txt-primary truncate">
                    ZaramaGYM
                  </div>
                  <div className="text-[10px] text-txt-muted font-medium truncate">
                    Kinetic Ledger OS
                  </div>
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsSidebarCollapsed((prev) => !prev)}
              aria-label={isSidebarCollapsed ? 'Expandir barra lateral' : 'Colapsar barra lateral'}
              className="hidden md:inline-flex p-1.5 rounded-md text-txt-muted hover:text-txt-primary hover:bg-surface-hover transition-colors"
              title={isSidebarCollapsed ? 'Expandir menú' : 'Colapsar menú'}
            >
              <Icon
                name={isSidebarCollapsed ? 'chevron-right' : 'chevron-left'}
                className="w-4 h-4"
              />
            </button>
          </div>

          {/* Tarjeta de Perfil del Usuario Autenticado */}
          <div className="p-3 border-b border-border shrink-0">
            <div
              className={`flex items-center gap-3 p-2 rounded-xl bg-canvas-subtle/70 border border-border ${
                isSidebarCollapsed ? 'justify-center' : ''
              }`}
            >
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isUploadingPhoto || isAuthActionLoading}
                  title="Haz clic para cambiar tu foto de perfil"
                  aria-label="Cambiar foto de perfil"
                  className="w-10 h-10 rounded-full border-2 border-border overflow-hidden flex items-center justify-center bg-surface hover:border-brand focus:outline-none focus:ring-2 focus:ring-brand transition-all cursor-pointer relative"
                >
                  {isUploadingPhoto ? (
                    <span className="text-[10px] font-bold text-txt-muted animate-pulse">
                      ...
                    </span>
                  ) : currentPhoto ? (
                    <img
                      src={currentPhoto}
                      alt={session.nombre_completo}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-txt-secondary">
                      {getInitials(session.nombre_completo)}
                    </span>
                  )}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </div>

              {!isSidebarCollapsed && (
                <div className="flex flex-col min-w-0 flex-1 gap-0.5">
                  <span className="text-xs font-bold text-txt-primary truncate">
                    {session.nombre_completo}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant={
                        isAdmin ? 'default' : isSupervisor ? 'warning' : 'info'
                      }
                      size="sm"
                    >
                      {session.rol}
                    </Badge>
                    <span className="text-[11px] text-txt-muted font-mono truncate">
                      @{session.username}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsChangePasswordOpen(true)}
                    disabled={isAuthActionLoading}
                    className="text-[11px] font-semibold text-brand hover:underline text-left mt-0.5 w-fit disabled:opacity-50"
                  >
                    Cambiar Clave
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Navegación Agrupada con scroll vertical propio independiente de Main */}
          <nav
            aria-label={isRecepcionista ? 'Módulos de Recepción' : 'Módulos del Sistema'}
            className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-3 flex flex-col gap-4"
          >
            {groupedNavItems.map(({ group, items }) => (
              <div key={group} className="flex flex-col gap-1">
                {!isSidebarCollapsed && (
                  <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-txt-muted">
                    {group}
                  </div>
                )}
                {items.map((item) => {
                  const isActive =
                    activeTab === item.id ||
                    (isRecepcionista &&
                      item.id === 'reception' &&
                      activeTab === 'directory');

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateToTab(item.id)}
                      aria-label={item.label}
                      title={item.label}
                      aria-current={isActive ? 'page' : undefined}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors text-left ${
                        isSidebarCollapsed ? 'justify-center px-2' : ''
                      } ${
                        isActive
                          ? 'bg-status-success-bg text-status-success border border-status-success/25 shadow-xs'
                          : 'text-txt-secondary hover:text-txt-primary hover:bg-surface-hover border border-transparent'
                      }`}
                    >
                      <Icon
                        name={item.icon}
                        className={`w-4 h-4 shrink-0 ${
                          isActive ? 'text-status-success' : 'text-txt-muted'
                        }`}
                      />
                      {!isSidebarCollapsed && (
                        <span className="truncate">{item.label}</span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

        {/* Pie del Sidebar: Tema, Bloquear Turno y Cerrar Sesión */}
        <div className="p-3 border-t border-border flex flex-col gap-2 shrink-0 bg-canvas-subtle/40">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === 'dark' ? 'Cambiar a modo Claro' : 'Cambiar a modo Oscuro'}
            title={theme === 'dark' ? 'Modo Oscuro activo (cambiar a Claro)' : 'Modo Claro activo (cambiar a Oscuro)'}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold bg-surface border border-border hover:bg-surface-hover text-txt-primary transition-colors ${
              isSidebarCollapsed ? 'justify-center px-2' : 'justify-between'
            }`}
          >
            <span className="inline-flex items-center gap-2 min-w-0">
              <Icon
                name={theme === 'dark' ? 'moon' : 'sun'}
                className="w-4 h-4 text-brand shrink-0"
              />
              {!isSidebarCollapsed && (
                <span className="truncate">
                  {theme === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}
                </span>
              )}
            </span>
            {!isSidebarCollapsed && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-canvas-subtle text-txt-muted">
                {theme === 'dark' ? 'Oscuro' : 'Claro'}
              </span>
            )}
          </button>

          <div className={`grid gap-2 ${isSidebarCollapsed ? 'grid-cols-1' : 'grid-cols-2'}`}>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={lockSession}
              disabled={isAuthActionLoading}
              aria-label="Bloquear Turno"
              title="Bloquear Turno"
              className="px-2.5"
              leftIcon={<Icon name="lock" className="w-3.5 h-3.5 text-txt-muted" />}
            >
              {!isSidebarCollapsed ? 'Bloquear Turno' : ''}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={logout}
              disabled={isAuthActionLoading}
              aria-label="Cerrar Sesión"
              title="Cerrar Sesión"
              className="px-2.5 text-status-danger hover:bg-status-danger-bg hover:text-status-danger border border-status-danger/20"
              leftIcon={<Icon name="logout" className="w-3.5 h-3.5" />}
            >
              {!isSidebarCollapsed ? 'Cerrar Sesión' : ''}
            </Button>
          </div>
        </div>
      </aside>

      {/* COLUMNA PRINCIPAL (HEADER FIJO + MAIN SCROLLABLE + FOOTER FIJO) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* 2. HEADER SUPERIOR CON HAMBURGUESA + BUSCADOR CTRL+K */}
        <header className="h-16 bg-surface border-b border-border px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={handleToggleSidebar}
              aria-label="Alternar barra lateral"
              className="p-2 rounded-lg border border-border bg-canvas-subtle/60 hover:bg-surface-hover text-txt-secondary hover:text-txt-primary transition-colors shrink-0"
            >
              <Icon name="menu" className="w-4 h-4" />
            </button>

            {/* Buscador Inteligente de Módulos y Submódulos */}
            <div ref={searchContainerRef} className="relative flex-1 max-w-2xl">
              <div role="search" aria-label="Buscador de módulos y submódulos">
                <div className="relative flex items-center">
                  <Icon
                    name="search"
                    className="w-4 h-4 text-txt-muted absolute left-3 pointer-events-none"
                  />
                  <input
                    ref={searchInputRef}
                    type="search"
                    value={searchQuery}
                    onFocus={() => {
                      setIsSearchOpen(true);
                      setSelectedSearchIndex(0);
                    }}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setIsSearchOpen(true);
                      setSelectedSearchIndex(0);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'ArrowDown') {
                        e.preventDefault();
                        setSelectedSearchIndex((prev) =>
                          searchResults.length > 0 ? (prev + 1) % searchResults.length : 0
                        );
                      } else if (e.key === 'ArrowUp') {
                        e.preventDefault();
                        setSelectedSearchIndex((prev) =>
                          searchResults.length > 0
                            ? (prev - 1 + searchResults.length) % searchResults.length
                            : 0
                        );
                      } else if (e.key === 'Enter' && searchResults.length > 0) {
                        e.preventDefault();
                        const chosen = searchResults[selectedSearchIndex] || searchResults[0];
                        if (chosen) handleExecuteSearchItem(chosen);
                      } else if (e.key === 'Escape') {
                        setIsSearchOpen(false);
                        searchInputRef.current?.blur();
                      }
                    }}
                    placeholder="Buscar módulos, submódulos o funciones (ej. RUC 20, arqueo, mermas, QR, backup)..."
                    aria-label="Buscador inteligente de módulos y submódulos"
                    className="w-full bg-canvas-subtle border border-border rounded-xl pl-9 pr-16 py-2 text-xs sm:text-sm text-txt-primary placeholder:text-txt-muted focus:outline-none focus:bg-surface focus:border-border-focus focus:ring-1 focus:ring-border-focus transition-colors"
                  />
                  <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-surface border border-border font-mono text-[10px] font-bold text-txt-muted absolute right-2.5 pointer-events-none">
                    Ctrl+K
                  </kbd>
                </div>
              </div>

              {/* Panel Flotante de Resultados */}
              {isSearchOpen && (
                <div
                  role="listbox"
                  aria-label="Resultados de navegación"
                  className="absolute left-0 right-0 mt-2 bg-surface border border-elevated rounded-xl shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto"
                >
                  {searchResults.length === 0 ? (
                    <div className="p-4 text-center text-xs text-txt-muted">
                      No se encontraron módulos o submódulos para &ldquo;{searchQuery}&rdquo;.
                    </div>
                  ) : (
                    <div className="py-1.5">
                      {searchResults.map((item, idx) => {
                        const isHighlighted = idx === selectedSearchIndex;
                        return (
                          <button
                            key={item.id}
                            type="button"
                            role="option"
                            aria-selected={isHighlighted}
                            onMouseEnter={() => setSelectedSearchIndex(idx)}
                            onClick={() => handleExecuteSearchItem(item)}
                            className={`w-full px-3.5 py-2.5 flex items-center gap-3 text-left transition-colors ${
                              isHighlighted
                                ? 'bg-status-success-bg/70 text-txt-primary'
                                : 'hover:bg-surface-hover text-txt-primary'
                            }`}
                          >
                            <div className="w-8 h-8 rounded-lg bg-canvas-subtle border border-border flex items-center justify-center shrink-0 text-brand">
                              <Icon name={item.icon} className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold text-txt-primary truncate">
                                {item.title}
                              </div>
                              <div className="text-[11px] text-txt-muted truncate">
                                {item.subtitle}
                              </div>
                            </div>
                            <Icon
                              name="chevron-right"
                              className="w-3.5 h-3.5 text-txt-muted shrink-0"
                            />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Indicador de Estación Activa + Emblema */}
          <div className="flex items-center gap-2.5 shrink-0">
            <span className="hidden lg:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-status-success-bg text-status-success text-[11px] font-semibold border border-status-success/20">
              <span className="w-2 h-2 rounded-full bg-status-success animate-pulse" aria-hidden="true" />
              Estación Activa
            </span>
            <img
              src="/zaramagym-logo.png"
              alt="ZaramaGYM"
              className="w-8 h-8 rounded-lg object-contain bg-canvas-subtle p-0.5 border border-border"
            />
          </div>
        </header>

        {/* 3. PANTALLA PRINCIPAL (MAIN CONTENT — SCROLL INDEPENDIENTE) */}
        <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-canvas">
          <div className="w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex flex-col gap-5 min-w-0 min-h-full">
            {authError && !session.is_locked && (
            <Alert
              variant="warning"
              title="No se puede cerrar la sesión"
              onClose={clearAuthError}
            >
              <div className="flex flex-col gap-2.5">
                <p>{authError.message}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setPosInitialTab('pos');
                      setActiveTab('pos');
                      clearAuthError();
                    }}
                  >
                    Ir a Caja / POS para cerrar turno
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    leftIcon={<Icon name="lock" className="w-3.5 h-3.5" />}
                    onClick={() => {
                      clearAuthError();
                      lockSession();
                    }}
                    isLoading={isAuthActionLoading}
                  >
                    Solo Bloquear Estación
                  </Button>
                </div>
              </div>
            </Alert>
          )}

          {/* Vistas según Rol y Pestaña */}
          {!isRecepcionista ? (
            <div key={activeTab} className="zg-view-enter flex-1 flex flex-col">
              {activeTab === 'home' && (
                <HomeDashboardView
                  session={session}
                  clientsCount={entitiesHook.clients.length}
                  onNavigate={(tab) => navigateToTab(tab)}
                  onOpenSearch={() => {
                    setIsSearchOpen(true);
                    searchInputRef.current?.focus();
                  }}
                />
              )}

              {activeTab === 'directory' && (
                <section aria-labelledby="directorio-heading">
                  <div className="mb-4">
                    <h2 id="directorio-heading" className="text-lg font-bold text-txt-primary">
                      Directorio Segmentado (Clientes, Proveedores y Personas)
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Gestión de socios con credencial QR y control de peso, empresas jurídicas RUC 20 y directorio de personas.
                    </p>
                  </div>
                  <EntityDirectoryView
                    currentSession={session}
                    initialSubTab={directoryInitialSubTab}
                    clients={entitiesHook.clients}
                    suppliers={entitiesHook.suppliers}
                    persons={entitiesHook.persons}
                    companies={entitiesHook.companies}
                    isLoading={entitiesHook.isLoading}
                    isActionLoading={entitiesHook.isActionLoading}
                    error={entitiesHook.error}
                    onRefresh={entitiesHook.refreshAll}
                    onCreateClient={entitiesHook.createClient}
                    onUpdateClient={entitiesHook.updateClient}
                    onToggleClientActive={entitiesHook.toggleClientActive}
                    onRegenerateClientQr={entitiesHook.regenerateClientQr}
                    onRecordClientWeight={entitiesHook.recordClientWeight}
                    onGetClientWeightHistory={entitiesHook.getClientWeightHistory}
                    onCreateSupplier={entitiesHook.createSupplier}
                    onUpdateSupplier={entitiesHook.updateSupplier}
                    onToggleSupplierActive={entitiesHook.toggleSupplierActive}
                    onCreatePerson={entitiesHook.createPerson}
                    onUpdatePerson={entitiesHook.updatePerson}
                    onTogglePersonActive={entitiesHook.togglePersonActive}
                    onCreateCompany={entitiesHook.createCompany}
                    onUpdateCompany={entitiesHook.updateCompany}
                    onToggleCompanyActive={entitiesHook.toggleCompanyActive}
                    onClearError={entitiesHook.clearError}
                  />
                </section>
              )}

              {activeTab === 'users' && canAccessUsers && (
                <section aria-labelledby="usuarios-heading">
                  <div className="mb-4">
                    <h2 id="usuarios-heading" className="text-lg font-bold text-txt-primary">
                      {isSupervisor
                        ? 'Gestión de Recepcionistas a Cargo'
                        : 'Usuarios del Sistema y Permisos Jerárquicos'}
                    </h2>
                    <p className="text-xs text-txt-muted">
                      {isSupervisor
                        ? 'Administra únicamente operadores con rol Recepcionista y sus fotos de perfil.'
                        : 'Administra operadores, supervisores y credenciales del gimnasio.'}
                    </p>
                  </div>
                  <UserManagementTable
                    currentSession={session}
                    users={users}
                    persons={entitiesHook.persons}
                    isLoading={isUsersLoading}
                    isActionLoading={isUserActionLoading}
                    error={usersError}
                    onRefresh={fetchUsers}
                    onCreateUser={createUser}
                    onUpdateUser={updateUser}
                    onToggleActive={toggleUserActive}
                    onUpdatePhoto={updateOtherUserPhoto}
                    onClearError={clearUsersError}
                  />
                </section>
              )}

              {activeTab === 'audit' && canAccessAudit && (
                <section aria-labelledby="auditoria-heading">
                  <div className="mb-4">
                    <h2 id="auditoria-heading" className="text-lg font-bold text-txt-primary">
                      Bitácora Universal de Auditoría
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Historial inmutable de eventos de acceso, modificaciones y seguridad del gimnasio.
                    </p>
                  </div>
                  <AuditLogViewer
                    logs={logs}
                    filter={auditFilter}
                    isLoading={isAuditLoading}
                    error={auditError}
                    onFilterChange={(newFilter) => {
                      setAuditFilter(newFilter);
                      fetchAuditLogs(newFilter);
                    }}
                    onRefresh={() => fetchAuditLogs()}
                    onClearError={clearAuditError}
                  />
                </section>
              )}

              {activeTab === 'reception' && (
                <ReceptionDashboard
                  session={session}
                  onLockSession={lockSession}
                  onNavigateToPos={(tab) => {
                    if (tab) setPosInitialTab(tab);
                    setActiveTab('pos');
                  }}
                  onNavigateToAttendance={() => setActiveTab('attendance')}
                  entitiesProps={{
                    clients: entitiesHook.clients,
                    suppliers: entitiesHook.suppliers,
                    persons: entitiesHook.persons,
                    companies: entitiesHook.companies,
                    isLoading: entitiesHook.isLoading,
                    isActionLoading: entitiesHook.isActionLoading,
                    error: entitiesHook.error,
                    onRefresh: entitiesHook.refreshAll,
                    onCreateClient: entitiesHook.createClient,
                    onUpdateClient: entitiesHook.updateClient,
                    onToggleClientActive: entitiesHook.toggleClientActive,
                    onRegenerateClientQr: entitiesHook.regenerateClientQr,
                    onRecordClientWeight: entitiesHook.recordClientWeight,
                    onGetClientWeightHistory: entitiesHook.getClientWeightHistory,
                    onCreateSupplier: entitiesHook.createSupplier,
                    onUpdateSupplier: entitiesHook.updateSupplier,
                    onToggleSupplierActive: entitiesHook.toggleSupplierActive,
                    onCreatePerson: entitiesHook.createPerson,
                    onUpdatePerson: entitiesHook.updatePerson,
                    onTogglePersonActive: entitiesHook.togglePersonActive,
                    onCreateCompany: entitiesHook.createCompany,
                    onUpdateCompany: entitiesHook.updateCompany,
                    onToggleCompanyActive: entitiesHook.toggleCompanyActive,
                    onClearError: entitiesHook.clearError,
                  }}
                />
              )}

              {activeTab === 'catalog' && (
                <section aria-labelledby="catalogo-heading">
                  <div className="mb-4">
                    <h2 id="catalogo-heading" className="text-lg font-bold text-txt-primary">
                      Catálogo de Planes, Inventario de Productos y Mermas
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Gestión de planes con compensación Day Overflow, inventario de productos y bitácora de mermas.
                    </p>
                  </div>
                  <CatalogView currentSession={session} initialTab={catalogInitialTab} />
                </section>
              )}

              {activeTab === 'pos' && (
                <section aria-labelledby="pos-heading">
                  <div className="mb-4">
                    <h2 id="pos-heading" className="text-lg font-bold text-txt-primary">
                      Caja, Punto de Venta (POS) y Cuentas por Cobrar
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Apertura/cierre de turnos de caja física y digital, registro de ventas multidominio y resolución de tachados.
                    </p>
                  </div>
                  <PosView currentSession={session} initialTab={posInitialTab} />
                </section>
              )}

              {activeTab === 'attendance' && (
                <section aria-labelledby="attendance-heading">
                  <div className="mb-4">
                    <h2 id="attendance-heading" className="text-lg font-bold text-txt-primary">
                      Control de Asistencias, Semáforo Inteligente y Recuperación de Días
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Escáner QR en mostrador, evaluación automática de vigencia y crédito, destrabe en rojo y prórrogas.
                    </p>
                  </div>
                  <AttendanceView
                    currentSession={session}
                    clients={entitiesHook.clients}
                    initialTab={attendanceInitialTab}
                    onNavigateToPos={(subTab) => {
                      if (subTab) setPosInitialTab(subTab);
                      setActiveTab('pos');
                    }}
                  />
                </section>
              )}

              {activeTab === 'lan' && (
                <section aria-labelledby="lan-heading">
                  <div className="mb-4">
                    <h2 id="lan-heading" className="text-lg font-bold text-txt-primary">
                      Servidor Wi-Fi Local, Certificado CA y Escáner Móvil (iOS / Android)
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Conexión local sin Internet (:3443 + mDNS), vinculación de smartphones por código de 6 caracteres y semáforo instantáneo.
                    </p>
                  </div>
                  <LanServerView currentSession={session} clients={entitiesHook.clients} />
                </section>
              )}

              {activeTab === 'finance' && (
                <section aria-labelledby="finance-heading">
                  <FinanceView currentSession={session} initialTab={financeInitialTab} />
                </section>
              )}

              {activeTab === 'printing_backup' && (
                <section aria-labelledby="printing-backup-heading">
                  <PrintingBackupView
                    currentSession={session}
                    initialTab={printingInitialTab}
                    onDatabaseRestored={async (result) => {
                      if (result.requires_relogin) {
                        await checkSession();
                        return;
                      }
                      await Promise.allSettled([
                        checkSession(),
                        entitiesHook.refreshAll(),
                        canAccessUsers ? fetchUsers() : Promise.resolve(),
                        canAccessAudit ? fetchAuditLogs() : Promise.resolve(),
                      ]);
                    }}
                  />
                </section>
              )}
            </div>
          ) : (
            /* Rol RECEPCIONISTA */
            <div key={activeTab} className="zg-view-enter flex-1 flex flex-col">
              {activeTab === 'home' ? (
                <HomeDashboardView
                  session={session}
                  clientsCount={entitiesHook.clients.length}
                  onNavigate={(tab) => navigateToTab(tab)}
                  onOpenSearch={() => {
                    setIsSearchOpen(true);
                    searchInputRef.current?.focus();
                  }}
                />
              ) : activeTab === 'pos' ? (
                <section aria-labelledby="pos-heading-recep">
                  <div className="mb-4">
                    <h2 id="pos-heading-recep" className="text-lg font-bold text-txt-primary">
                      Caja, Punto de Venta (POS) y Cuentas por Cobrar
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Apertura/cierre de turnos de caja física y digital, registro de ventas multidominio y cobro de deudores.
                    </p>
                  </div>
                  <PosView currentSession={session} initialTab={posInitialTab} />
                </section>
              ) : activeTab === 'attendance' ? (
                <section aria-labelledby="attendance-heading-recep">
                  <div className="mb-4">
                    <h2
                      id="attendance-heading-recep"
                      className="text-lg font-bold text-txt-primary"
                    >
                      Control de Asistencias, Semáforo Inteligente y Recuperación de Días
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Escáner QR en mostrador, evaluación automática de vigencia y crédito, destrabe en rojo y prórrogas.
                    </p>
                  </div>
                  <AttendanceView
                    currentSession={session}
                    clients={entitiesHook.clients}
                    initialTab={attendanceInitialTab}
                    onNavigateToPos={(subTab) => {
                      if (subTab) setPosInitialTab(subTab);
                      setActiveTab('pos');
                    }}
                  />
                </section>
              ) : activeTab === 'lan' ? (
                <section aria-labelledby="lan-heading-recep">
                  <div className="mb-4">
                    <h2 id="lan-heading-recep" className="text-lg font-bold text-txt-primary">
                      Servidor Wi-Fi Local, Certificado CA y Escáner Móvil (iOS / Android)
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Visualización de estado LAN, smartphones conectados y simulador móvil de semáforo.
                    </p>
                  </div>
                  <LanServerView currentSession={session} clients={entitiesHook.clients} />
                </section>
              ) : (
                <ReceptionDashboard
                  session={session}
                  onLockSession={lockSession}
                  onNavigateToPos={(tab) => {
                    if (tab) setPosInitialTab(tab);
                    setActiveTab('pos');
                  }}
                  onNavigateToAttendance={() => setActiveTab('attendance')}
                  onNavigateToLan={() => setActiveTab('lan')}
                  entitiesProps={{
                    clients: entitiesHook.clients,
                    suppliers: entitiesHook.suppliers,
                    persons: entitiesHook.persons,
                    companies: entitiesHook.companies,
                    isLoading: entitiesHook.isLoading,
                    isActionLoading: entitiesHook.isActionLoading,
                    error: entitiesHook.error,
                    onRefresh: entitiesHook.refreshAll,
                    onCreateClient: entitiesHook.createClient,
                    onUpdateClient: entitiesHook.updateClient,
                    onToggleClientActive: entitiesHook.toggleClientActive,
                    onRegenerateClientQr: entitiesHook.regenerateClientQr,
                    onRecordClientWeight: entitiesHook.recordClientWeight,
                    onGetClientWeightHistory: entitiesHook.getClientWeightHistory,
                    onCreateSupplier: entitiesHook.createSupplier,
                    onUpdateSupplier: entitiesHook.updateSupplier,
                    onToggleSupplierActive: entitiesHook.toggleSupplierActive,
                    onCreatePerson: entitiesHook.createPerson,
                    onUpdatePerson: entitiesHook.updatePerson,
                    onTogglePersonActive: entitiesHook.togglePersonActive,
                    onClearError: entitiesHook.clearError,
                  }}
                />
              )}
            </div>
          )}
          </div>
        </main>

        {/* 4. FOOTER INFERIOR COMPACTO FIJO */}
        <footer className="min-h-[42px] border-t border-border bg-surface px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-txt-muted shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-status-success" aria-hidden="true" />
            <span>© 2026 ZaramaGYM v0.1.0 • Sistema Local-First</span>
          </div>

          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded bg-canvas-subtle border border-border font-mono text-[10px]">
              Ctrl+K Buscar
            </span>
            <span aria-hidden="true">•</span>
            <span className="px-2 py-0.5 rounded bg-canvas-subtle border border-border font-mono text-[10px]">
              F2 Directorio
            </span>
            <span aria-hidden="true">•</span>
            <span className="px-2 py-0.5 rounded bg-canvas-subtle border border-border font-mono text-[10px]">
              F4 Asistencias
            </span>
            <span aria-hidden="true">•</span>
            <span className="px-2 py-0.5 rounded bg-canvas-subtle border border-border font-mono text-[10px]">
              F9 Caja POS
            </span>
          </div>
        </footer>
      </div>

      {/* Modal Reactivo de Bloqueo de Turno */}
      <LockModal
        session={session}
        onUnlock={unlockSession}
        onLogout={logout}
        isLoading={isAuthActionLoading}
        error={authError}
        onClearError={clearAuthError}
      />

      {/* Modal de Cambio de Contraseña Propia */}
      <ChangePasswordModal
        isOpen={isChangePasswordOpen}
        onClose={() => setIsChangePasswordOpen(false)}
        onChangePassword={changePassword}
        isLoading={isAuthActionLoading}
        error={authError}
        onClearError={clearAuthError}
      />
    </div>
  );
};
