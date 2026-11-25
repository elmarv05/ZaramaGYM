// ============================================================================
// COMPONENTE PRINCIPAL: SHELL DE 4 COMPONENTES, BUSCADOR CTRL+K Y RBAC (SLICE 9)
// Estructura: Sidebar Izquierdo + Header Superior + Main Fluido + Footer Compacto
// Ubicación: src/App.tsx
// ============================================================================

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import { Alert } from './components/primitives/Alert';
import { Badge } from './components/primitives/Badge';
import { Button } from './components/primitives/Button';
import { DeveloperContactModal } from './components/DeveloperContactModal';
import { Icon, IconName } from './components/primitives/Icon';
import { AppShellSkeleton, ModuleSkeleton } from './components/primitives/Skeleton';
import { fileToDataUrl } from './domain/user';
import { useAudit } from './hooks/useAudit';
import { useAuth } from './hooks/useAuth';
import { useEntities } from './hooks/useEntities';
import { useSidebarAlerts } from './hooks/useSidebarAlerts';
import { useTheme } from './hooks/useTheme';
import { useUsers } from './hooks/useUsers';
import { authIpc } from './services/ipc/authIpc';
import { userIpc } from './services/ipc/userIpc';
import { CloseBlockedPayload, CrashRecoveryNotice } from './types/auth';
import {
  CloseBlockedModal,
  CrashRecoveryModal,
} from './features/auth/CashIntegrityModals';
import { ChangePasswordModal } from './features/auth/ChangePasswordModal';
import { LockModal } from './features/auth/LockModal';
import { LoginForm } from './features/auth/LoginForm';
import { HomeDashboardView } from './features/home/HomeDashboardView';
import type { AttendanceMainTab } from './features/attendance/AttendanceView';
import type { UserManagementSubTab } from './features/auth/UserManagementTable';
import type { CatalogSubTab } from './features/catalog/CatalogView';
import type { DirectorySubTab } from './features/entities/EntityDirectoryView';
import type { FinanceMainTab } from './features/finance/FinanceView';
import type { PosMainTab } from './features/pos/PosView';
import type { PrintingBackupTab } from './features/printing_backup/PrintingBackupView';

// Code-splitting por módulo: reduce el bundle inicial y acelera el arranque en frío
const AttendanceView = lazy(() =>
  import('./features/attendance/AttendanceView').then((m) => ({
    default: m.AttendanceView,
  }))
);
const AuditLogViewer = lazy(() =>
  import('./features/audit/AuditLogViewer').then((m) => ({
    default: m.AuditLogViewer,
  }))
);
const UserManagementTable = lazy(() =>
  import('./features/auth/UserManagementTable').then((m) => ({
    default: m.UserManagementTable,
  }))
);
const CatalogView = lazy(() =>
  import('./features/catalog/CatalogView').then((m) => ({
    default: m.CatalogView,
  }))
);
const EntityDirectoryView = lazy(() =>
  import('./features/entities/EntityDirectoryView').then((m) => ({
    default: m.EntityDirectoryView,
  }))
);
const FinanceView = lazy(() =>
  import('./features/finance/FinanceView').then((m) => ({
    default: m.FinanceView,
  }))
);
const LanServerView = lazy(() =>
  import('./features/lan/LanServerView').then((m) => ({
    default: m.LanServerView,
  }))
);
const PosView = lazy(() =>
  import('./features/pos/PosView').then((m) => ({
    default: m.PosView,
  }))
);
const PrintingBackupView = lazy(() =>
  import('./features/printing_backup/PrintingBackupView').then((m) => ({
    default: m.PrintingBackupView,
  }))
);

export type NavigationTab =
  | 'home'
  | 'directory'
  | 'users'
  | 'audit'
  | 'catalog'
  | 'pos'
  | 'attendance'
  | 'lan'
  | 'finance'
  | 'printing_backup';

const tabPreloaders: Partial<Record<NavigationTab, () => Promise<unknown>>> = {
  attendance: () => import('./features/attendance/AttendanceView'),
  audit: () => import('./features/audit/AuditLogViewer'),
  users: () => import('./features/auth/UserManagementTable'),
  catalog: () => import('./features/catalog/CatalogView'),
  directory: () => import('./features/entities/EntityDirectoryView'),
  finance: () => import('./features/finance/FinanceView'),
  lan: () => import('./features/lan/LanServerView'),
  pos: () => import('./features/pos/PosView'),
  printing_backup: () => import('./features/printing_backup/PrintingBackupView'),
};

const preloadedTabs = new Set<NavigationTab>();
function preloadTabModule(tab: NavigationTab): void {
  if (preloadedTabs.has(tab)) return;
  const loader = tabPreloaders[tab];
  if (!loader) return;
  preloadedTabs.add(tab);
  void loader().catch(() => {
    preloadedTabs.delete(tab);
  });
}

interface NavItemConfig {
  id: NavigationTab;
  label: string;
  icon: IconName;
  group: 'Operación' | 'Gestión y Catálogo' | 'Administración y Red';
  roles: Array<'ADMINISTRADOR' | 'RECEPCIONISTA'>;
}

interface SearchCommandItem {
  id: string;
  title: string;
  subtitle: string;
  tab: NavigationTab;
  icon: IconName;
  keywords: string;
  roles: Array<'ADMINISTRADOR' | 'RECEPCIONISTA'>;
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

  const [activeTab, setActiveTab] = useState<NavigationTab>('home');
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
  const [usersInitialSubTab, setUsersInitialSubTab] =
    useState<UserManagementSubTab>('users');

  const [isChangePasswordOpen, setIsChangePasswordOpen] = useState(false);
  const [isDeveloperCardOpen, setIsDeveloperCardOpen] = useState(false);

  // Estados de Integridad de Caja: Bloqueo de cierre (X) y Crash Recovery
  const [closeBlockedPayload, setCloseBlockedPayload] =
    useState<CloseBlockedPayload | null>(null);
  const [crashRecoveryNotice, setCrashRecoveryNotice] =
    useState<CrashRecoveryNotice | null>(null);

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

  // Escucha preventiva del evento Tauri cuando el usuario pulsa "X" con caja abierta
  useEffect(() => {
    let unlistenTauri: (() => void) | undefined;
    let mounted = true;

    const handleCustomEvent = (evt: Event) => {
      const detail = (evt as CustomEvent<CloseBlockedPayload>).detail;
      if (detail) {
        setCloseBlockedPayload(detail);
      }
    };

    window.addEventListener('zaramagym:close-blocked-open-shift', handleCustomEvent);

    const hasTauriRuntime =
      typeof window !== 'undefined' &&
      Boolean((window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__);

    if (hasTauriRuntime) {
      listen<CloseBlockedPayload>('app://close-blocked-open-shift', (event) => {
        if (mounted && event.payload) {
          setCloseBlockedPayload(event.payload);
        }
      })
        .then((unlisten) => {
          if (mounted) {
            unlistenTauri = unlisten;
          } else {
            unlisten();
          }
        })
        .catch(() => {
          // Ignorar si no hay runtime Tauri activo
        });
    }

    return () => {
      mounted = false;
      window.removeEventListener('zaramagym:close-blocked-open-shift', handleCustomEvent);
      if (unlistenTauri) {
        unlistenTauri();
      }
    };
  }, []);

  // Consulta al iniciar sesión si hubo un cierre forzado previo con turno de caja abierto
  useEffect(() => {
    if (!session || session.is_locked) return;
    let cancelled = false;

    authIpc
      .getCrashRecoveryNotice()
      .then((notice) => {
        if (!cancelled && notice && notice.detected && notice.had_open_cash_shift) {
          setCrashRecoveryNotice(notice);
        }
      })
      .catch(() => {
        // Ignorar si el comando no está mockeado en tests ajenos
      });

    return () => {
      cancelled = true;
    };
  }, [session?.user_id, session?.is_locked]);

  const handleAcknowledgeCrashRecovery = async () => {
    setCrashRecoveryNotice(null);
    try {
      await authIpc.acknowledgeCrashRecoveryNotice();
    } catch {
      // Continuar limpiamente aunque falle IPC
    }
  };

  const handleGoToPosFromCloseBlocked = () => {
    setCloseBlockedPayload(null);
    setPosInitialTab('pos');
    setActiveTab('pos');
  };

  const handleGoToPosFromCrashRecovery = async () => {
    await handleAcknowledgeCrashRecovery();
    setPosInitialTab('pos');
    setActiveTab('pos');
  };

  const handleGoToAuditFromCrashRecovery = async () => {
    await handleAcknowledgeCrashRecovery();
    setActiveTab('audit');
  };

  // Sistema de 2 roles (ADMINISTRADOR y RECEPCIONISTA)
  const isAdmin = session?.rol === 'ADMINISTRADOR';
  const isRecepcionista = session?.rol === 'RECEPCIONISTA';

  const canAccessUsers = Boolean(isAdmin && !session?.is_locked);
  const canAccessAudit = Boolean(isAdmin && !session?.is_locked);

  // Ajustar pestaña inicial al cambiar de sesión (ambos roles aterrizan en Inicio / Dashboard)
  const lastSessionUserRef = useRef<number | null>(null);
  const effectiveActiveTab: NavigationTab =
    session && lastSessionUserRef.current !== session.user_id
      ? 'home'
      : activeTab;

  useEffect(() => {
    if (!session) {
      lastSessionUserRef.current = null;
      return;
    }
    if (lastSessionUserRef.current !== session.user_id) {
      lastSessionUserRef.current = session.user_id;
      setActiveTab('home');
    }
  }, [session?.user_id, session?.rol]);

  // Hook de Usuarios (Exclusivo Admin — carga diferida al abrir el módulo)
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
  } = useUsers(canAccessUsers && effectiveActiveTab === 'users');

  // Hook de Auditoría (Exclusivo Admin — carga diferida al abrir el módulo)
  const {
    logs,
    filter: auditFilter,
    isLoading: isAuditLoading,
    error: auditError,
    setFilter: setAuditFilter,
    fetchLogs: fetchAuditLogs,
    clearError: clearAuditError,
  } = useAudit({}, canAccessAudit && effectiveActiveTab === 'audit');

  // Hook de Entidades (Directorio Segmentado)
  const entitiesHook = useEntities(Boolean(session && !session.is_locked));

  // Hook de Notificaciones Inteligentes de Negocio en el Sidebar (Stock bajo, Deudores, Tachados)
  const { visibleAlerts: sidebarAlerts, acknowledgeModule: acknowledgeSidebarAlert } =
    useSidebarAlerts({
      enabled: Boolean(session && !session.is_locked),
      sessionUserId: session?.user_id ?? null,
      isAdmin,
      activeTab: effectiveActiveTab,
    });

  const navigateToTab = (tab: NavigationTab) => {
    if (tab === 'pos') setPosInitialTab('pos');
    if (tab === 'users') setUsersInitialSubTab('users');
    acknowledgeSidebarAlert(tab);
    setActiveTab(tab);
    setIsMobileSidebarOpen(false);
  };

  // Definición de Navegación del Sidebar
  const navItems: NavItemConfig[] = useMemo(() => {
    return [
      {
        id: 'home',
        label: 'Inicio',
        icon: 'home',
        group: 'Operación',
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
      },
      {
        id: 'attendance',
        label: 'Asistencias y Semáforo',
        icon: 'qr',
        group: 'Operación',
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
      },
      {
        id: 'pos',
        label: 'Caja y POS',
        icon: 'pos',
        group: 'Operación',
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
      },
      {
        id: 'directory',
        label: 'Directorio',
        icon: 'directory',
        group: 'Gestión y Catálogo',
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
      },
      {
        id: 'catalog',
        label: 'Catálogo e Inventario',
        icon: 'catalog',
        group: 'Gestión y Catálogo',
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
      },
      {
        id: 'finance',
        label: 'Compras, Gastos y Finanzas',
        icon: 'finance',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
      },
      {
        id: 'printing_backup',
        label: 'Impresión, PDFs y Backups',
        icon: 'printer',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR'],
      },
      {
        id: 'users',
        label: 'Gestión de Usuarios',
        icon: 'users',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR'],
      },
      {
        id: 'audit',
        label: 'Bitácora de Auditoría',
        icon: 'audit',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR'],
      },
      {
        id: 'lan',
        label: 'Wi-Fi & Escáner Móvil',
        icon: 'wifi',
        group: 'Administración y Red',
        roles: ['ADMINISTRADOR'],
      },
    ];
  }, [isRecepcionista]);

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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
        onSelect: () => setActiveTab('home'),
      },
      {
        id: 'cmd-attendance-monitor',
        title: 'Asistencias QR y Semáforo',
        subtitle: 'Escáner QR de acceso, evaluación verde/ámbar/rojo',
        tab: 'attendance',
        icon: 'qr',
        keywords: 'asistencias semaforo qr check in entrada acceso pases rojo',
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setAttendanceInitialTab('extensions');
          setActiveTab('attendance');
        },
      },
      {
        id: 'cmd-pos-main',
        title: 'Caja y Punto de Venta',
        subtitle: 'Abrir/cerrar turno, arqueo físico, carrito y cobro mixto',
        tab: 'pos',
        icon: 'pos',
        keywords: 'caja pos punto de venta carrito cobro efectivo yape plin arqueo turno',
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
        onSelect: () => {
          setPosInitialTab('deudores');
          setActiveTab('pos');
        },
      },
      {
        id: 'cmd-pos-struck',
        title: 'Caja y POS -> Tachados',
        subtitle: 'Resolución definitiva o reversión de ventas tachadas',
        tab: 'pos',
        icon: 'scissors',
        keywords: 'tachados anulacion bandeja admin resolver paso 2',
        roles: ['ADMINISTRADOR'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR', 'RECEPCIONISTA'],
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
        roles: ['ADMINISTRADOR'],
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
        roles: ['ADMINISTRADOR'],
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
        roles: ['ADMINISTRADOR'],
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
        roles: ['ADMINISTRADOR'],
        onSelect: () => {
          setPrintingInitialTab('backups');
          setActiveTab('printing_backup');
        },
      },
      {
        id: 'cmd-users',
        title: 'Gestión de Usuarios',
        subtitle: 'Cuentas, roles RBAC y credenciales de operadores',
        tab: 'users',
        icon: 'users',
        keywords: 'usuarios recepcionistas administradores roles cuentas',
        roles: ['ADMINISTRADOR'],
        onSelect: () => {
          setUsersInitialSubTab('users');
          setActiveTab('users');
        },
      },
      {
        id: 'cmd-audit',
        title: 'Bitácora de Auditoría',
        subtitle: 'Trazabilidad inmutable de eventos y seguridad',
        tab: 'audit',
        icon: 'audit',
        keywords: 'auditoria bitacora logs eventos seguridad',
        roles: ['ADMINISTRADOR'],
        onSelect: () => setActiveTab('audit'),
      },
      {
        id: 'cmd-lan',
        title: 'Wi-Fi & Escáner Móvil',
        subtitle: 'Servidor local HTTPS :3443, mDNS y vinculación móvil',
        tab: 'lan',
        icon: 'wifi',
        keywords: 'wifi lan servidor local escaner movil https certificado qr',
        roles: ['ADMINISTRADOR'],
        onSelect: () => setActiveTab('lan'),
      },
    ];

    return allCommands.filter((cmd) => cmd.roles.includes(session.rol));
  }, [session]);

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
    acknowledgeSidebarAlert(item.tab);
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
        setDirectoryInitialSubTab('clients');
        setActiveTab('directory');
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
        acknowledgeSidebarAlert('pos');
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
        <CloseBlockedModal
          payload={closeBlockedPayload}
          hasUnlockedSession={false}
          onDismiss={() => setCloseBlockedPayload(null)}
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
          className="fixed inset-0 z-30 bg-black/50 backdrop-blur-sm md:hidden zg-modal-backdrop"
        />
      )}

      {/* 1. SIDEBAR IZQUIERDO COLAPSABLE CON SCROLL INDEPENDIENTE */}
      <aside
        aria-label="Navegación lateral ZaramaGYM"
        className={`zg-chrome-sidebar fixed inset-y-0 left-0 z-40 md:static md:inset-auto h-full flex flex-col overflow-hidden bg-chrome-sidebar text-chrome-sidebar-text border-r border-chrome-sidebar-border shadow-md transition-[transform,width] duration-200 ease-smooth will-change-transform select-none w-60 ${
          isMobileSidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full md:translate-x-0'
        } ${isSidebarCollapsed ? 'md:w-20' : 'md:w-56 lg:w-[232px]'} shrink-0`}
      >
        {/* Cabecera del Sidebar: Logo siempre visible (sin flecha duplicada; el toggle vive en el Header) */}
        <div
          className={`h-16 border-b border-chrome-sidebar-border flex items-center gap-2 shrink-0 ${
            isSidebarCollapsed ? 'md:justify-center md:px-2 px-4 justify-between' : 'justify-between px-4'
          }`}
        >
            <button
              type="button"
              onClick={() => navigateToTab('home')}
              className={`flex items-center gap-2.5 min-w-0 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-chrome-sidebar-active-border rounded-lg p-1 ${
                isSidebarCollapsed ? 'md:justify-center' : ''
              }`}
              title="Ir a Inicio"
            >
              <img
                src="/zaramagym-logo.png"
                alt="ZaramaGYM"
                className="w-9 h-9 rounded-full object-contain shrink-0 bg-white/95 p-0.5 ring-2 ring-chrome-sidebar-active-border/50 shadow-sm"
              />
              {!isSidebarCollapsed && (
                <div className="min-w-0">
                  <div className="text-sm font-black tracking-tight text-chrome-sidebar-text truncate">
                    Zarama GYM
                  </div>
                  <div className="text-[10px] text-chrome-sidebar-muted font-medium truncate">
                    Sistema Integral
                  </div>
                </div>
              )}
            </button>

            <button
              type="button"
              onClick={() => setIsMobileSidebarOpen(false)}
              aria-label="Cerrar menú lateral"
              className="md:hidden inline-flex p-1.5 rounded-md text-chrome-sidebar-secondary hover:text-chrome-sidebar-text hover:bg-chrome-sidebar-hover transition-colors"
              title="Cerrar menú"
            >
              <Icon name="x" className="w-4 h-4" />
            </button>
          </div>

          {/* Tarjeta de Perfil del Usuario Autenticado */}
          <div className="p-3 border-b border-chrome-sidebar-border shrink-0">
            <div
              className={`flex items-center gap-3 p-2 rounded-xl bg-chrome-sidebar-surface border border-chrome-sidebar-border shadow-2xs ${
                isSidebarCollapsed ? 'md:justify-center' : ''
              }`}
            >
              <div className="relative shrink-0">
                <button
                  type="button"
                  onClick={handleAvatarClick}
                  disabled={isUploadingPhoto || isAuthActionLoading}
                  title="Haz clic para cambiar tu foto de perfil"
                  aria-label="Cambiar foto de perfil"
                  className="w-10 h-10 rounded-full border-2 border-chrome-sidebar-active-border/55 overflow-hidden flex items-center justify-center bg-chrome-sidebar hover:border-chrome-sidebar-active-border focus:outline-none focus-visible:ring-2 focus-visible:ring-chrome-sidebar-active-border transition-colors duration-150 cursor-pointer relative"
                >
                  {isUploadingPhoto ? (
                    <span className="text-[10px] font-bold text-chrome-sidebar-muted animate-pulse">
                      ...
                    </span>
                  ) : currentPhoto ? (
                    <img
                      src={currentPhoto}
                      alt={session.nombre_completo}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-xs font-bold text-chrome-sidebar-text">
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
                  <span className="text-xs font-bold text-chrome-sidebar-text truncate">
                    {session.nombre_completo}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <Badge
                      variant={isAdmin ? 'default' : 'info'}
                      size="sm"
                      className={
                        isAdmin
                          ? 'bg-chrome-sidebar/85 text-chrome-sidebar-text border-chrome-sidebar-border'
                          : 'bg-status-info-bg/95 text-status-info border-status-info-border/80'
                      }
                    >
                      {session.rol}
                    </Badge>
                    <span className="text-[11px] text-chrome-sidebar-muted font-mono truncate">
                      @{session.username}
                    </span>
                  </div>
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
                  <div className="px-2.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-chrome-sidebar-muted">
                    {group}
                  </div>
                )}
                {items.map((item) => {
                  const isActive = effectiveActiveTab === item.id;
                  const moduleAlert =
                    item.id === 'catalog' ||
                    item.id === 'pos' ||
                    item.id === 'finance'
                      ? sidebarAlerts[item.id]
                      : undefined;

                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => navigateToTab(item.id)}
                      onMouseEnter={() => preloadTabModule(item.id)}
                      onFocus={() => preloadTabModule(item.id)}
                      aria-label={item.label}
                      title={
                        moduleAlert
                          ? `${item.label} — ${moduleAlert.label}`
                          : item.label
                      }
                      aria-current={isActive ? 'page' : undefined}
                      className={`group relative w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold transition-[background-color,color,border-color,box-shadow,transform] duration-150 ease-out active:scale-[0.99] motion-reduce:active:scale-100 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-chrome-sidebar-active-border ${
                        isSidebarCollapsed ? 'md:justify-center md:px-2' : ''
                      } ${
                        isActive
                          ? 'bg-chrome-sidebar-active text-chrome-sidebar-active-text border border-chrome-sidebar-active-border/75 shadow-xs'
                          : 'text-chrome-sidebar-secondary hover:text-chrome-sidebar-text hover:bg-chrome-sidebar-hover border border-transparent'
                      }`}
                    >
                      <span className="relative inline-flex shrink-0">
                        <Icon
                          name={item.icon}
                          className={`w-4 h-4 shrink-0 ${
                            isActive
                              ? 'text-chrome-sidebar-active-icon'
                              : 'text-chrome-sidebar-muted group-hover:text-chrome-sidebar-text'
                          }`}
                        />
                        {isSidebarCollapsed && moduleAlert && (
                          <span
                            data-testid={`sidebar-alert-${item.id}`}
                            aria-hidden="true"
                            className="hidden md:inline-flex items-center justify-center absolute -top-1.5 -right-2 min-w-[16px] h-4 px-1 rounded-full bg-status-warning text-txt-inverse ring-2 ring-chrome-sidebar font-mono text-[9px] font-bold shadow-xs"
                          >
                            {moduleAlert.count > 99 ? '99+' : moduleAlert.count}
                          </span>
                        )}
                      </span>
                      {!isSidebarCollapsed && (
                        <>
                          <span className="truncate flex-1">{item.label}</span>
                          {moduleAlert && (
                            <span
                              data-testid={`sidebar-alert-${item.id}`}
                              title={moduleAlert.label}
                              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-status-warning text-txt-inverse ring-1 ring-status-warning-border/70 font-mono text-[10px] font-bold shrink-0 shadow-xs"
                            >
                              {moduleAlert.count > 99 ? '99+' : moduleAlert.count}
                            </span>
                          )}
                        </>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </nav>

        {/* Pie del Sidebar: Cerrar Sesión */}
        <div className="p-3 border-t border-chrome-sidebar-border flex flex-col gap-2 shrink-0 bg-chrome-sidebar-surface/75">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={logout}
            disabled={isAuthActionLoading}
            aria-label="Cerrar Sesión"
            title="Cerrar Sesión"
            className="w-full px-2.5 text-chrome-sidebar-danger hover:bg-chrome-sidebar-danger-bg hover:text-chrome-sidebar-text border border-chrome-sidebar-danger-border focus-visible:ring-chrome-sidebar-danger"
            leftIcon={<Icon name="logout" className="w-3.5 h-3.5" />}
          >
            {!isSidebarCollapsed ? 'Cerrar Sesión' : ''}
          </Button>
        </div>
      </aside>

      {/* COLUMNA PRINCIPAL (HEADER FIJO + MAIN SCROLLABLE + FOOTER FIJO) */}
      <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">
        {/* 2. HEADER SUPERIOR CON HAMBURGUESA + BUSCADOR CTRL+K */}
        <header className="zg-chrome-header h-16 bg-chrome-bar text-chrome-bar-text border-b border-chrome-bar-border px-4 sm:px-6 flex items-center justify-between gap-3 shrink-0 z-20">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <button
              type="button"
              onClick={handleToggleSidebar}
              aria-label="Alternar barra lateral"
              title={isSidebarCollapsed ? 'Expandir menú lateral' : 'Minimizar menú lateral'}
              className="p-2 rounded-lg border border-chrome-bar-border bg-chrome-bar-surface hover:bg-chrome-bar-hover text-chrome-bar-text shadow-2xs transition-colors shrink-0 focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <Icon name="menu" className="w-4 h-4" />
            </button>

            {/* Buscador Inteligente de Módulos y Submódulos */}
            <div ref={searchContainerRef} className="relative flex-1 max-w-2xl">
              <div role="search" aria-label="Buscador de módulos y submódulos">
                <div className="relative flex items-center">
                  <Icon
                    name="search"
                    className="w-4 h-4 text-chrome-bar-muted absolute left-3 pointer-events-none"
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
                    className="w-full h-9 bg-chrome-bar-input hover:border-border-strong border border-chrome-bar-border rounded-lg pl-9 pr-3 sm:pr-16 text-xs sm:text-sm text-chrome-bar-text placeholder:text-chrome-bar-muted shadow-2xs focus:outline-none focus-visible:border-border-focus focus-visible:ring-[3px] focus-visible:ring-ring/25 transition-[background-color,border-color,box-shadow] duration-150"
                  />
                  <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded bg-chrome-bar border border-chrome-bar-border font-mono text-[10px] font-bold text-chrome-bar-muted absolute right-2.5 pointer-events-none">
                    Ctrl+K
                  </kbd>
                </div>
              </div>

              {/* Panel Flotante de Resultados */}
              {isSearchOpen && (
                <div
                  role="listbox"
                  aria-label="Resultados de navegación"
                  className="zg-dropdown-enter absolute left-0 right-0 mt-2 bg-elevated border border-elevated-border rounded-xl shadow-lg overflow-hidden z-50 max-h-80 overflow-y-auto"
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
                            onMouseEnter={() => {
                              setSelectedSearchIndex(idx);
                              preloadTabModule(item.tab);
                            }}
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

          {/* Selector de Modo + Bloqueo Rápido + Indicador de Estación Activa + Emblema */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleTheme}
              aria-pressed={theme === 'dark'}
              aria-label={theme === 'dark' ? 'Cambiar a modo Claro' : 'Cambiar a modo Oscuro'}
              title={
                theme === 'dark'
                  ? 'Modo Oscuro activo (clic para cambiar a Claro)'
                  : 'Modo Claro activo (clic para cambiar a Oscuro)'
              }
              className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-semibold bg-chrome-bar-surface hover:bg-chrome-bar-hover border border-chrome-bar-border text-chrome-bar-text shadow-2xs transition-colors focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
            >
              <Icon
                name={theme === 'dark' ? 'moon' : 'sun'}
                className="w-3.5 h-3.5 text-brand shrink-0"
              />
              <span className="hidden md:inline">
                {theme === 'dark' ? 'Modo Oscuro' : 'Modo Claro'}
              </span>
            </button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={lockSession}
              disabled={isAuthActionLoading}
              aria-label="Proteger Estación"
              title="Proteger Estación / Bloquear Turno"
              className="px-2.5 sm:px-3 bg-chrome-bar-surface hover:bg-chrome-bar-hover border-chrome-bar-border text-chrome-bar-text"
              leftIcon={<Icon name="lock" className="w-3.5 h-3.5 text-chrome-bar-muted" />}
            >
              <span className="hidden sm:inline">Bloquear</span>
            </Button>
          </div>
        </header>

        {/* 3. PANTALLA PRINCIPAL (MAIN CONTENT — SCROLL INDEPENDIENTE) */}
        <main className="flex-1 min-w-0 min-h-0 overflow-y-auto overflow-x-hidden overscroll-contain bg-canvas">
          <div className="w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 flex flex-col gap-5 min-w-0 min-h-full">
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
                    Ir a Caja para cerrar turno
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
            <div key={effectiveActiveTab} className="zg-view-enter w-full min-w-0 flex-1 flex flex-col">
              {effectiveActiveTab === 'home' && (
                <HomeDashboardView
                  session={session}
                  clientsCount={entitiesHook.clients.length}
                  onNavigate={(tab) => navigateToTab(tab)}
                  onOpenSearch={() => {
                    setIsSearchOpen(true);
                    searchInputRef.current?.focus();
                  }}
                  onOpenReceptionistPermissions={() => {
                    setUsersInitialSubTab('permissions');
                    setActiveTab('users');
                  }}
                />
              )}

              {effectiveActiveTab === 'directory' && (
                <section aria-labelledby="directorio-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="directorio-heading" className="text-lg font-bold text-txt-primary">
                      Directorio Segmentado: Clientes, Proveedores, Personas y Empresas.
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Gestión de socios con credencial QR y control de peso, empresas jurídicas y directorio de personas.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Directorio..." />}>
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
                  </Suspense>
                </section>
              )}

              {effectiveActiveTab === 'users' && canAccessUsers && (
                <section aria-labelledby="usuarios-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="usuarios-heading" className="text-lg font-bold text-txt-primary">
                      Usuarios del Sistema y Permisos
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Administra administradores, recepcionistas y credenciales del gimnasio.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Usuarios..." />}>
                    <UserManagementTable
                      currentSession={session}
                      initialSubTab={usersInitialSubTab}
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
                  </Suspense>
                </section>
              )}

              {effectiveActiveTab === 'audit' && canAccessAudit && (
                <section aria-labelledby="auditoria-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="auditoria-heading" className="text-lg font-bold text-txt-primary">
                      Bitácora Universal de Auditoría
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Historial inmutable de eventos de acceso, modificaciones y seguridad del gimnasio.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Auditoría..." />}>
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
                  </Suspense>
                </section>
              )}

              {effectiveActiveTab === 'catalog' && (
                <section aria-labelledby="catalogo-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="catalogo-heading" className="text-lg font-bold text-txt-primary">
                      Catálogo de Planes, Inventario de Productos y Kardex
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Gestión de planes, inventario de productos y bitácora de mermas.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Catálogo..." />}>
                    <CatalogView currentSession={session} initialTab={catalogInitialTab} />
                  </Suspense>
                </section>
              )}

              {effectiveActiveTab === 'pos' && (
                <section aria-labelledby="pos-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="pos-heading" className="text-lg font-bold text-txt-primary">
                      Caja, Punto de Venta y Cuentas por Cobrar
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Apertura/Cierre de turnos de caja física y digital, registro de ventas multidominio y auditoría de tachados.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Caja y POS..." />}>
                    <PosView currentSession={session} initialTab={posInitialTab} />
                  </Suspense>
                </section>
              )}

              {effectiveActiveTab === 'attendance' && (
                <section aria-labelledby="attendance-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="attendance-heading" className="text-lg font-bold text-txt-primary">
                      Control de Asistencias dinámico y Recuperación de Días
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Escáner QR en mostrador, evaluación automática de vigencia y crédito, destrabe en rojo y prórrogas.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Asistencias..." />}>
                    <AttendanceView
                      currentSession={session}
                      clients={entitiesHook.clients}
                      initialTab={attendanceInitialTab}
                      onNavigateToPos={(subTab) => {
                        if (subTab) setPosInitialTab(subTab);
                        setActiveTab('pos');
                      }}
                    />
                  </Suspense>
                </section>
              )}

              {effectiveActiveTab === 'lan' && (
                <section aria-labelledby="lan-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="lan-heading" className="text-lg font-bold text-txt-primary">
                      Servidor Wi-Fi Local, Certificado CA y Escáner Móvil
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Conexión local sin Internet (:3443 + mDNS), vinculación de smartphones por código de 6 caracteres y semáforo instantáneo.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Servidor Wi-Fi..." />}>
                    <LanServerView currentSession={session} clients={entitiesHook.clients} />
                  </Suspense>
                </section>
              )}

              {effectiveActiveTab === 'finance' && (
                <section aria-labelledby="finance-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Finanzas..." />}>
                    <FinanceView currentSession={session} initialTab={financeInitialTab} />
                  </Suspense>
                </section>
              )}

              {effectiveActiveTab === 'printing_backup' && (
                <section aria-labelledby="printing-backup-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Impresión y Backups..." />}>
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
                  </Suspense>
                </section>
              )}
            </div>
          ) : (
            /* Rol RECEPCIONISTA */
            <div key={effectiveActiveTab} className="zg-view-enter w-full min-w-0 flex-1 flex flex-col">
              {effectiveActiveTab === 'home' ? (
                <HomeDashboardView
                  session={session}
                  clientsCount={entitiesHook.clients.length}
                  onNavigate={(tab) => navigateToTab(tab)}
                  onOpenSearch={() => {
                    setIsSearchOpen(true);
                    searchInputRef.current?.focus();
                  }}
                />
              ) : effectiveActiveTab === 'directory' ? (
                <section aria-labelledby="directorio-recep-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="directorio-recep-heading" className="text-lg font-bold text-txt-primary">
                      Directorio de Clientes, Proveedores &amp; Empresas
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Inscripción y edición de clientes con QR, y registro/consulta de proveedores y empresas RUC 20.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Directorio..." />}>
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
                      onCreateCompany={entitiesHook.createCompany}
                      onClearError={entitiesHook.clearError}
                    />
                  </Suspense>
                </section>
              ) : effectiveActiveTab === 'finance' ? (
                <section aria-labelledby="finance-heading-recep" className="w-full min-w-0 flex-1 flex flex-col">
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Finanzas..." />}>
                    <FinanceView currentSession={session} initialTab={financeInitialTab} />
                  </Suspense>
                </section>
              ) : effectiveActiveTab === 'catalog' ? (
                <section aria-labelledby="catalogo-recep-heading" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="catalogo-recep-heading" className="text-lg font-bold text-txt-primary">
                      Catálogo de Planes e Inventario de Productos
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Consulta de planes con simulador Day Overflow, registro/edición de productos y consulta de Kardex.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Catálogo..." />}>
                    <CatalogView currentSession={session} initialTab={catalogInitialTab} />
                  </Suspense>
                </section>
              ) : effectiveActiveTab === 'pos' ? (
                <section aria-labelledby="pos-heading-recep" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2 id="pos-heading-recep" className="text-lg font-bold text-txt-primary">
                      Caja, Punto de Venta y Cuentas por Cobrar
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Apertura/cierre de turnos de caja física y digital, registro de ventas multidominio y cobro de deudores.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Caja y POS..." />}>
                    <PosView currentSession={session} initialTab={posInitialTab} />
                  </Suspense>
                </section>
              ) : effectiveActiveTab === 'attendance' ? (
                <section aria-labelledby="attendance-heading-recep" className="w-full min-w-0 flex-1 flex flex-col">
                  <div className="mb-4">
                    <h2
                      id="attendance-heading-recep"
                      className="text-lg font-bold text-txt-primary"
                    >
                      Control de Asistencias dinámico y Recuperación de Días
                    </h2>
                    <p className="text-xs text-txt-muted">
                      Escáner QR en mostrador, evaluación automática de vigencia y crédito, destrabe en rojo y prórrogas.
                    </p>
                  </div>
                  <Suspense fallback={<ModuleSkeleton rows={5} label="Cargando Asistencias..." />}>
                    <AttendanceView
                      currentSession={session}
                      clients={entitiesHook.clients}
                      initialTab={attendanceInitialTab}
                      onNavigateToPos={(subTab) => {
                        if (subTab) setPosInitialTab(subTab);
                        setActiveTab('pos');
                      }}
                    />
                  </Suspense>
                </section>
              ) : (
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
            </div>
          )}
          </div>
        </main>

        {/* 4. FOOTER INFERIOR COMPACTO FIJO */}
        <footer className="zg-chrome-footer min-h-[42px] border-t border-chrome-bar-border bg-chrome-bar px-4 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-chrome-bar-muted shrink-0">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand ring-2 ring-brand/25 shrink-0" aria-hidden="true" />
            <span>
              © 2026 ZaramaGYM • Pucallpa - Perú •  {' '}
              <button
                type="button"
                onClick={() => setIsDeveloperCardOpen(true)}
                title="Ver información de contacto de Max Rios"
                className="font-semibold text-chrome-bar-text hover:text-brand underline decoration-chrome-bar-border underline-offset-2 hover:decoration-brand transition-colors rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                Contacto: Max Rios
              </button>
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-2 flex-wrap">
            <span className="px-2 py-0.5 rounded-md bg-chrome-bar-surface border border-chrome-bar-border text-chrome-bar-text shadow-2xs font-mono text-[10px] font-medium">
              Ctrl+K Buscar
            </span>
            <span aria-hidden="true" className="text-chrome-bar-muted/70">•</span>
            <span className="px-2 py-0.5 rounded-md bg-chrome-bar-surface border border-chrome-bar-border text-chrome-bar-text shadow-2xs font-mono text-[10px] font-medium">
              F2 Directorio
            </span>
            <span aria-hidden="true" className="text-chrome-bar-muted/70">•</span>
            <span className="px-2 py-0.5 rounded-md bg-chrome-bar-surface border border-chrome-bar-border text-chrome-bar-text shadow-2xs font-mono text-[10px] font-medium">
              F4 Asistencias
            </span>
            <span aria-hidden="true" className="text-chrome-bar-muted/70">•</span>
            <span className="px-2 py-0.5 rounded-md bg-chrome-bar-surface border border-chrome-bar-border text-chrome-bar-text shadow-2xs font-mono text-[10px] font-medium">
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

      {/* Modal Tarjeta de Presentación del Desarrollador */}
      <DeveloperContactModal
        isOpen={isDeveloperCardOpen}
        onClose={() => setIsDeveloperCardOpen(false)}
      />

      {/* Modal Preventivo: Bloqueo de cierre de ventana (X) con caja abierta */}
      <CloseBlockedModal
        payload={closeBlockedPayload}
        hasUnlockedSession={Boolean(session && !session.is_locked)}
        onDismiss={() => setCloseBlockedPayload(null)}
        onGoToPos={handleGoToPosFromCloseBlocked}
      />

      {/* Modal Crash Recovery: Cierre forzado / apagado brusco con turno abierto */}
      <CrashRecoveryModal
        notice={crashRecoveryNotice}
        canAccessAudit={canAccessAudit}
        onAcknowledgeAndContinue={handleAcknowledgeCrashRecovery}
        onGoToPos={handleGoToPosFromCrashRecovery}
        onGoToAudit={handleGoToAuditFromCrashRecovery}
      />
    </div>
  );
};
