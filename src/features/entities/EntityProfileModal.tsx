// ============================================================================
// COMPONENTE: PERFIL INTERACTIVO DE ENTIDAD (DRAWER / MODAL DE DETALLES & CRUD)
// Soporta: Clientes (QR + Peso + WhatsApp), Personas, Proveedores, Empresas RUC 20 y Usuarios
// Incluye animaciones suaves de apertura y cierre + edición inline sin ruido visual
// Ubicación: src/features/entities/EntityProfileModal.tsx
// ============================================================================

import React, { useState, useEffect, useMemo } from 'react';
import QRCode from 'qrcode';
import {
  ClientAcquisitionChannel,
  ClientDetail,
  ClientListItem,
  ClientWeightRecord,
  CompanyDetail,
  CompanyListItem,
  PersonDetail,
  PersonDocumentType,
  PersonGender,
  PersonListItem,
  RecordClientWeightInput,
  SupplierDetail,
  SupplierListItem,
  UpdateClientInput,
  UpdateCompanyInput,
  UpdatePersonInput,
  UpdateSupplierInput,
} from '../../types/entity';
import { AuthSession, UpdateUserInput, UserListItem, UserRole } from '../../types/auth';
import {
  formatDecimalOnBlur,
  preventEnterKeySubmit,
  sanitizeDecimalInput,
  selectIfZeroDefault,
} from '../../utils/formSafety';
import {
  CLIENT_ACQUISITION_CHANNEL_OPTIONS,
  PERSON_DOCUMENT_TYPES,
  PERSON_GENDER_OPTIONS,
  buildWhatsAppWelcomeLink,
  canEditOrDeactivateSupplierOrCompany,
  canModifyLinkedPersonData,
  canToggleClientActive,
  formatKg,
  formatWeightVariation,
  getAcquisitionChannelLabel,
  getGenderLabel,
  validateClientForm,
  validateCompanyForm,
  validatePersonForm,
  validateRecordWeightInput,
} from '../../domain/entity';
import { normalizeAppError, openExternalUrl } from '../../services/ipc/client';
import { entityIpc } from '../../services/ipc/entityIpc';
import { Badge } from '../../components/primitives/Badge';
import { Button } from '../../components/primitives/Button';
import { Icon } from '../../components/primitives/Icon';
import { Input } from '../../components/primitives/Input';
import {
  InteractiveLineChart,
  LineChartDataPoint,
} from '../../components/primitives/InteractiveLineChart';
import { Select } from '../../components/primitives/Select';
import { Alert } from '../../components/primitives/Alert';
import { Dialog, DialogContent, DialogTitle } from '../../components/primitives/Modal';
import { useModalScrollLock } from '../../components/primitives/modalScrollLock';

export type ProfileEntitySubject =
  | { kind: 'client'; data: ClientListItem | ClientDetail }
  | { kind: 'supplier'; data: SupplierListItem | SupplierDetail }
  | { kind: 'person'; data: PersonListItem | PersonDetail }
  | { kind: 'company'; data: CompanyListItem | CompanyDetail }
  | { kind: 'user'; data: UserListItem };

export interface EntityProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: ProfileEntitySubject | null;
  currentSession?: AuthSession;
  isActionLoading?: boolean;
  // Handlers de actualización inline
  onUpdateClient?: (clientId: number, input: UpdateClientInput) => Promise<ClientDetail | null>;
  onUpdatePerson?: (personId: number, input: UpdatePersonInput) => Promise<PersonDetail | null>;
  onUpdateCompany?: (companyId: number, input: UpdateCompanyInput) => Promise<CompanyDetail | null>;
  onUpdateSupplier?: (
    supplierId: number,
    input: UpdateSupplierInput
  ) => Promise<SupplierDetail | null>;
  onUpdateUser?: (userId: number, input: UpdateUserInput) => Promise<boolean>;
  // Handlers de estado Activo/Inactivo
  onToggleActive?: (id: number, currentActive: boolean) => Promise<boolean>;
  // Handlers de QR y Peso para Clientes
  onRegenerateQr?: (clientId: number) => Promise<string | null>;
  onRecordWeight?: (input: RecordClientWeightInput) => Promise<ClientWeightRecord | null>;
  fetchWeightHistory?: (clientId: number) => Promise<ClientWeightRecord[]>;
  // Handler opcional para abrir modal de edición avanzada (ej. cambio de clave o foto)
  onOpenAdvancedEdit?: () => void;
}

type ProfileSectionTab = 'general' | 'qr' | 'weight';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 0 || !parts[0]) return 'ZG';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

function buildDirectWhatsAppLink(phone: string | null | undefined, name: string): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 9) return null;
  const normalized = digits.length === 9 ? `51${digits}` : digits;
  const text = encodeURIComponent(`Hola ${name}, te escribimos de ZaramaGYM.`);
  return `https://wa.me/${normalized}?text=${text}`;
}

export const EntityProfileModal: React.FC<EntityProfileModalProps> = ({
  isOpen,
  onClose,
  subject: propSubject,
  currentSession,
  isActionLoading = false,
  onUpdateClient,
  onUpdatePerson,
  onUpdateCompany,
  onUpdateSupplier,
  onUpdateUser,
  onToggleActive,
  onRegenerateQr,
  onRecordWeight,
  fetchWeightHistory,
  onOpenAdvancedEdit,
}) => {
  // Hidratación bajo demanda con el detalle completo (*Detail) desde SQLite vía IPC
  const [hydratedSubject, setHydratedSubject] = useState<ProfileEntitySubject | null>(null);
  const subject: ProfileEntitySubject | null = useMemo(() => {
    if (!hydratedSubject) return propSubject;
    return {
      ...hydratedSubject,
      data: {
        ...hydratedSubject.data,
        estado_activo: propSubject?.data.estado_activo ?? hydratedSubject.data.estado_activo,
      },
    } as ProfileEntitySubject;
  }, [hydratedSubject, propSubject]);

  // Pestaña interna y modo edición inline
  const [activeTab, setActiveTab] = useState<ProfileSectionTab>('general');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{
    variant: 'success' | 'danger' | 'warning' | 'info';
    message: string;
  } | null>(null);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Estado QR para Clientes
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copiedToken, setCopiedToken] = useState(false);
  const [downloadedQrPng, setDownloadedQrPng] = useState(false);
  const [showConfirmRegen, setShowConfirmRegen] = useState(false);
  const [isRegeneratingQr, setIsRegeneratingQr] = useState(false);
  const [isOpeningWhatsApp, setIsOpeningWhatsApp] = useState(false);

  // Estado de Peso para Clientes
  const [weightHistory, setWeightHistory] = useState<ClientWeightRecord[]>([]);
  const [isWeightLoading, setIsWeightLoading] = useState(false);
  const [newWeightKg, setNewWeightKg] = useState('');
  const [newWeightNote, setNewWeightNote] = useState('');
  const [weightError, setWeightError] = useState<string | null>(null);

  // Campos de formulario de edición inline
  const [tipoDoc, setTipoDoc] = useState<PersonDocumentType>('DNI');
  const [numDoc, setNumDoc] = useState('');
  const [nombres, setNombres] = useState('');
  const [apellidos, setApellidos] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [nombreComercial, setNombreComercial] = useState('');
  const [fechaNacimiento, setFechaNacimiento] = useState('');
  const [genero, setGenero] = useState<PersonGender | ''>('');
  const [telefono, setTelefono] = useState('');
  const [email, setEmail] = useState('');
  const [direccion, setDireccion] = useState('');
  const [contactoEmergenciaNombre, setContactoEmergenciaNombre] = useState('');
  const [contactoEmergenciaNumero, setContactoEmergenciaNumero] = useState('');
  const [notasMedicas, setNotasMedicas] = useState('');
  const [canalCaptacion, setCanalCaptacion] = useState<ClientAcquisitionChannel | ''>('');
  const [rubroProveedor, setRubroProveedor] = useState('');
  const [contactoReferencia, setContactoReferencia] = useState('');
  const [username, setUsername] = useState('');
  const [userRol, setUserRol] = useState<UserRole>('RECEPCIONISTA');

  // Reinicio de estado interno al abrir el modal
  useEffect(() => {
    if (!isOpen) return;
    setActiveTab('general');
    setIsEditing(false);
    setFeedback(null);
    setFormErrors({});
    setShowConfirmRegen(false);
    setWeightError(null);
  }, [isOpen]);

  const handleRequestClose = () => {
    if (isSaving || isActionLoading) return;
    onClose();
  };

  useModalScrollLock(isOpen);

  // Cargar detalle completo (*Detail: fecha_nacimiento, direccion, etc.) al abrir el perfil
  useEffect(() => {
    setHydratedSubject(null);
    if (!isOpen || !propSubject) return;

    let mounted = true;
    const targetKind = propSubject.kind;
    const targetId = propSubject.data.id;

    const fetchDetail = async () => {
      try {
        if (targetKind === 'person') {
          const detail = await entityIpc.getPerson(targetId);
          if (mounted && detail && typeof detail === 'object' && 'id' in detail) {
            setHydratedSubject({ kind: 'person', data: detail });
          }
        } else if (targetKind === 'client') {
          const detail = await entityIpc.getClient(targetId);
          if (mounted && detail && typeof detail === 'object' && 'id' in detail) {
            setHydratedSubject({ kind: 'client', data: detail });
          }
        } else if (targetKind === 'company') {
          const detail = await entityIpc.getCompany(targetId);
          if (mounted && detail && typeof detail === 'object' && 'id' in detail) {
            setHydratedSubject({ kind: 'company', data: detail });
          }
        } else if (targetKind === 'supplier') {
          const detail = await entityIpc.getSupplier(targetId);
          if (mounted && detail && typeof detail === 'object' && 'id' in detail) {
            setHydratedSubject({ kind: 'supplier', data: detail });
          }
        }
      } catch {
        // Fallback silencioso al objeto resumido de lista si no hay runtime IPC (ej. tests)
      }
    };

    void fetchDetail();
    return () => {
      mounted = false;
    };
  }, [isOpen, propSubject?.kind, propSubject?.data.id]);

  // Poblar campos al cambiar el sujeto activo
  useEffect(() => {
    if (!subject) return;
    setFormErrors({});

    if (subject.kind === 'client') {
      const c = subject.data;
      setTipoDoc(c.tipo_documento);
      setNumDoc(c.numero_documento);
      setNombres(c.nombres);
      setApellidos(c.apellidos);
      setFechaNacimiento(c.fecha_nacimiento || '');
      setGenero(c.genero || '');
      setTelefono(c.telefono || '');
      setEmail(c.email || '');
      setDireccion(c.direccion || '');
      setContactoEmergenciaNombre(c.nombre_contacto_emergencia || '');
      setContactoEmergenciaNumero(c.numero_contacto_emergencia || '');
      setNotasMedicas(c.notas_medicas || '');
      setCanalCaptacion(c.canal_captacion || '');
    } else if (subject.kind === 'person') {
      const p = subject.data;
      setTipoDoc(p.tipo_documento);
      setNumDoc(p.numero_documento);
      setNombres(p.nombres);
      setApellidos(p.apellidos);
      setFechaNacimiento((p as PersonDetail).fecha_nacimiento || '');
      setGenero(p.genero || '');
      setTelefono(p.telefono || '');
      setEmail(p.email || '');
      setDireccion((p as PersonDetail).direccion || '');
    } else if (subject.kind === 'company') {
      const co = subject.data;
      setNumDoc(co.ruc);
      setRazonSocial(co.razon_social);
      setNombreComercial(co.nombre_comercial || '');
      setTelefono(co.telefono || '');
      setEmail(co.email || '');
      setDireccion((co as CompanyDetail).direccion || '');
    } else if (subject.kind === 'supplier') {
      const s = subject.data;
      setTipoDoc((s.tipo_documento as PersonDocumentType) || 'RUC');
      setNumDoc(s.numero_documento);
      setNombres(s.nombres || '');
      setApellidos(s.apellidos || '');
      setRazonSocial(s.nombre_o_razon_social);
      setNombreComercial(s.nombre_comercial || '');
      setRubroProveedor(s.rubro_o_categoria || '');
      setContactoReferencia(s.contacto_referencia || '');
      setTelefono(s.telefono || '');
      setEmail(s.email || '');
      setDireccion(s.direccion || '');
    } else if (subject.kind === 'user') {
      const u = subject.data;
      setTipoDoc((u.tipo_documento as PersonDocumentType) || 'DNI');
      setNumDoc(u.numero_documento);
      setNombres(u.nombres);
      setApellidos(u.apellidos);
      setTelefono(u.telefono || '');
      setEmail(u.email || '');
      setDireccion(u.direccion || '');
      setUsername(u.username);
      setUserRol(u.rol);
    }
  }, [subject, isEditing]);

  // Generación de QR para Cliente
  const clientData = subject?.kind === 'client' ? subject.data : null;
  const qrToken = clientData?.codigo_qr_token || '';

  useEffect(() => {
    if (!isOpen || !qrToken) {
      setQrDataUrl('');
      return;
    }
    let mounted = true;
    QRCode.toDataURL(qrToken, {
      width: 240,
      margin: 2,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H',
    })
      .then((url) => {
        if (mounted) setQrDataUrl(url);
      })
      .catch(() => {
        if (mounted) setQrDataUrl('');
      });
    return () => {
      mounted = false;
    };
  }, [isOpen, qrToken]);

  // Carga de historial de peso cuando es cliente
  useEffect(() => {
    if (!isOpen || !clientData || !fetchWeightHistory) return;
    let mounted = true;
    setIsWeightLoading(true);
    fetchWeightHistory(clientData.id)
      .then((records) => {
        if (mounted) setWeightHistory(Array.isArray(records) ? records : []);
      })
      .catch(() => {
        if (mounted) setWeightHistory([]);
      })
      .finally(() => {
        if (mounted) setIsWeightLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [isOpen, clientData?.id, fetchWeightHistory]);

  // Serie cronológica para gráfico lineal interactivo de evolución de peso
  const weightChartData: LineChartDataPoint[] = useMemo(() => {
    if (!weightHistory || weightHistory.length === 0) return [];
    return [...weightHistory].reverse().map((rec) => {
      const datePart = rec.fecha_registro ? rec.fecha_registro.slice(0, 10) : '';
      const shortDate = datePart.length >= 10 ? datePart.slice(5, 10) : datePart || `#${rec.id}`;
      return {
        id: rec.id,
        label: shortDate,
        fullLabel: rec.fecha_registro,
        value: Number(rec.peso_kg),
        delta:
          rec.variacion_kg !== null && rec.variacion_kg !== undefined
            ? Number(rec.variacion_kg)
            : null,
        note: rec.nota,
      };
    });
  }, [weightHistory]);

  const activeClientWeightKg =
    weightHistory.length > 0 ? weightHistory[0].peso_kg : clientData?.peso_actual_kg;

  // Información derivada de cabecera
  const headerInfo = useMemo(() => {
    if (!subject) return null;
    if (subject.kind === 'client') {
      const c = subject.data;
      const fullName = `${c.nombres} ${c.apellidos}`.trim();
      return {
        id: c.id,
        title: fullName,
        docLabel: `${c.tipo_documento} ${c.numero_documento}`,
        isActive: c.estado_activo,
        phone: c.telefono,
        email: c.email,
        createdAt: c.created_at,
        avatarType: 'initials' as const,
        photoUrl: null,
        initials: getInitials(fullName),
        whatsappLink: buildWhatsAppWelcomeLink(c.telefono, fullName, c.codigo_qr_token),
        badges: [
          { label: 'Cliente', variant: 'success' as const },
          { label: 'Persona Natural', variant: 'default' as const },
          ...(c.notas_medicas ? [{ label: 'Atención Médica', variant: 'warning' as const }] : []),
        ],
      };
    }
    if (subject.kind === 'person') {
      const p = subject.data;
      const fullName = `${p.nombres} ${p.apellidos}`.trim();
      return {
        id: p.id,
        title: fullName,
        docLabel: `${p.tipo_documento} ${p.numero_documento}`,
        isActive: p.estado_activo,
        phone: p.telefono,
        email: p.email,
        createdAt: p.created_at,
        avatarType: 'initials' as const,
        photoUrl: null,
        initials: getInitials(fullName),
        whatsappLink: buildDirectWhatsAppLink(p.telefono, fullName),
        badges: [
          { label: 'Persona Natural', variant: 'default' as const },
          ...(p.es_cliente ? [{ label: 'Cliente', variant: 'success' as const }] : []),
          ...(p.es_proveedor ? [{ label: 'Proveedor', variant: 'info' as const }] : []),
          ...(p.rol_usuario ? [{ label: `Usuario: ${p.rol_usuario}`, variant: 'warning' as const }] : []),
        ],
      };
    }
    if (subject.kind === 'company') {
      const co = subject.data;
      return {
        id: co.id,
        title: co.razon_social,
        docLabel: `RUC ${co.ruc}`,
        isActive: co.estado_activo,
        phone: co.telefono,
        email: co.email,
        createdAt: co.created_at,
        avatarType: 'building' as const,
        photoUrl: null,
        initials: 'EM',
        whatsappLink: buildDirectWhatsAppLink(co.telefono, co.razon_social),
        badges: [
          { label: 'Empresa RUC 20', variant: 'info' as const },
          ...(co.nombre_comercial
            ? [{ label: co.nombre_comercial, variant: 'default' as const }]
            : []),
        ],
      };
    }
    if (subject.kind === 'supplier') {
      const s = subject.data;
      const isEmpresa = s.tipo_proveedor === 'EMPRESA';
      return {
        id: s.id,
        title: s.nombre_o_razon_social,
        docLabel: `${s.tipo_documento} ${s.numero_documento}`,
        isActive: s.estado_activo,
        phone: s.telefono,
        email: s.email,
        createdAt: s.created_at,
        avatarType: isEmpresa ? ('building' as const) : ('truck' as const),
        photoUrl: null,
        initials: getInitials(s.nombre_o_razon_social),
        whatsappLink: buildDirectWhatsAppLink(s.telefono, s.nombre_o_razon_social),
        badges: [
          { label: 'Proveedor', variant: 'info' as const },
          {
            label: isEmpresa ? 'Empresa Jurídica' : 'Persona Natural',
            variant: 'default' as const,
          },
          ...(s.rubro_o_categoria
            ? [{ label: s.rubro_o_categoria, variant: 'success' as const }]
            : []),
        ],
      };
    }
    // user
    const u = subject.data;
    const fullName = `${u.nombres} ${u.apellidos}`.trim();
    return {
      id: u.id,
      title: fullName,
      docLabel: `${u.tipo_documento} ${u.numero_documento}`,
      isActive: u.estado_activo,
      phone: u.telefono || null,
      email: u.email || null,
      createdAt: u.created_at,
      avatarType: 'user' as const,
      photoUrl: u.foto_perfil_data_url,
      initials: getInitials(fullName),
      whatsappLink: buildDirectWhatsAppLink(u.telefono, fullName),
      badges: [
        { label: `@${u.username}`, variant: 'default' as const },
        {
          label: u.rol,
          variant:
            u.rol === 'ADMINISTRADOR'
              ? ('default' as const)
              : ('info' as const),
        },
      ],
    };
  }, [subject]);

  if (!isOpen || !subject || !headerInfo) return null;

  // Permisos para editar datos personales vinculados ("Caso Juan Pérez")
  const canEditLinkedPerson = (() => {
    if (!currentSession) return true;
    if (subject.kind === 'client') {
      return canModifyLinkedPersonData(currentSession.rol, subject.data.persona_rol_usuario);
    }
    if (subject.kind === 'supplier') {
      return canModifyLinkedPersonData(currentSession.rol, subject.data.persona_rol_usuario);
    }
    return true;
  })();

  // Permisos para editar el sujeto actual (Proveedores y Empresas solo lectura para RECEPCIONISTA)
  const canEditCurrentSubject = (() => {
    if (!currentSession) return true;
    if (subject.kind === 'supplier' || subject.kind === 'company') {
      return canEditOrDeactivateSupplierOrCompany(currentSession.rol);
    }
    return true;
  })();

  // Permisos para alternar estado activo
  const canToggleStatus = (() => {
    if (!onToggleActive) return false;
    if (subject.kind === 'client' && currentSession) {
      return (
        canToggleClientActive(currentSession.rol) &&
        subject.data.persona_id !== currentSession.persona_id
      );
    }
    if ((subject.kind === 'supplier' || subject.kind === 'company') && currentSession) {
      return canEditOrDeactivateSupplierOrCompany(currentSession.rol);
    }
    if (subject.kind === 'person' && currentSession) {
      return subject.data.id !== currentSession.persona_id && subject.data.id !== 1;
    }
    if (subject.kind === 'user' && currentSession) {
      const isCurrentUser = subject.data.id === currentSession.user_id;
      const isRoot = subject.data.id === 1;
      const isAdmin = currentSession.rol === 'ADMINISTRADOR';
      return !isCurrentUser && !isRoot && isAdmin;
    }
    return true;
  })();

  // Abrir WhatsApp externo
  const handleOpenWhatsApp = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!headerInfo.whatsappLink || isOpeningWhatsApp) return;
    setIsOpeningWhatsApp(true);
    try {
      await openExternalUrl(headerInfo.whatsappLink);
      setFeedback({
        variant: 'info',
        message: `Abriendo conversación de WhatsApp con ${headerInfo.title}...`,
      });
    } catch (err) {
      setFeedback({
        variant: 'danger',
        message: normalizeAppError(err).message,
      });
    } finally {
      setIsOpeningWhatsApp(false);
    }
  };

  // Copiar token QR al portapapeles
  const handleCopyToken = async () => {
    if (!qrToken) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(qrToken);
      }
      setCopiedToken(true);
      setFeedback({
        variant: 'success',
        message: `Token QR (${qrToken}) copiado al portapapeles.`,
      });
      window.setTimeout(() => setCopiedToken(false), 1800);
    } catch {
      setCopiedToken(false);
    }
  };

  // Descargar Carnet QR en PNG
  const handleDownloadQrPng = () => {
    if (!qrDataUrl || !clientData) return;
    const fileName = `Carnet_QR_${clientData.numero_documento}.png`;
    setDownloadedQrPng(true);
    setFeedback({
      variant: 'success',
      message: `Credencial QR (${fileName}) descargada en tu carpeta de Descargas.`,
    });
    window.setTimeout(() => setDownloadedQrPng(false), 3000);

    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 680;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, 100);

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('ZARAMAGYM', canvas.width / 2, 45);

    ctx.font = '12px sans-serif';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText('CREDENCIAL DIGITAL DE SOCIO', canvas.width / 2, 75);

    const qrImg = new Image();
    qrImg.onload = () => {
      ctx.drawImage(qrImg, (canvas.width - 240) / 2, 130, 240, 240);
      ctx.fillStyle = '#0f172a';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(headerInfo.title, canvas.width / 2, 410);

      ctx.font = '14px monospace';
      ctx.fillStyle = '#475569';
      ctx.fillText(headerInfo.docLabel, canvas.width / 2, 440);

      ctx.font = 'bold 13px monospace';
      ctx.fillStyle = '#05ad52';
      ctx.fillText(`TOKEN: ${qrToken}`, canvas.width / 2, 480);

      const link = document.createElement('a');
      link.download = fileName;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    qrImg.src = qrDataUrl;
  };

  // Regenerar Token QR
  const handleConfirmRegenerateQr = async () => {
    if (!clientData || !onRegenerateQr) return;
    setIsRegeneratingQr(true);
    try {
      const nextToken = await onRegenerateQr(clientData.id);
      if (nextToken) {
        setShowConfirmRegen(false);
        setFeedback({
          variant: 'success',
          message: `Nuevo token QR generado: ${nextToken}`,
        });
      }
    } finally {
      setIsRegeneratingQr(false);
    }
  };

  // Registrar nuevo peso desde el perfil
  const handleRecordNewWeight = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientData || !onRecordWeight) return;
    setWeightError(null);

    const validation = validateRecordWeightInput({
      cliente_id: clientData.id,
      peso_kg: newWeightKg,
      nota: newWeightNote.trim() || null,
    });

    if (!validation.isValid) {
      setWeightError(validation.errors.peso_kg || 'Ingresa un peso válido en kg.');
      return;
    }

    setIsSaving(true);
    try {
      const created = await onRecordWeight({
        cliente_id: clientData.id,
        peso_kg: newWeightKg,
        nota: newWeightNote.trim() || null,
      });
      if (created) {
        setNewWeightKg('');
        setNewWeightNote('');
        setWeightHistory((prev) => [created, ...prev]);
        setFeedback({
          variant: 'success',
          message: `Peso actualizado a ${formatKg(created.peso_kg)}.`,
        });
      }
    } finally {
      setIsSaving(false);
    }
  };

  // Guardar cambios de edición inline
  const handleSaveInlineChanges = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditCurrentSubject) return;
    setFormErrors({});
    setFeedback(null);

    if (subject.kind === 'client' && onUpdateClient) {
      const validation = validateClientForm({
        modificar_datos_personales: canEditLinkedPerson,
        tipo_documento: tipoDoc,
        numero_documento: numDoc,
        nombres,
        apellidos,
        telefono,
        email,
        numero_contacto_emergencia: contactoEmergenciaNumero,
      });
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return;
      }
      setIsSaving(true);
      try {
        const updated = await onUpdateClient(subject.data.id, {
          tipo_documento: canEditLinkedPerson ? tipoDoc : undefined,
          numero_documento: canEditLinkedPerson ? numDoc.trim() : undefined,
          nombres: canEditLinkedPerson ? nombres.trim() : undefined,
          apellidos: canEditLinkedPerson ? apellidos.trim() : undefined,
          fecha_nacimiento: canEditLinkedPerson ? fechaNacimiento.trim() || null : undefined,
          genero: canEditLinkedPerson ? genero || null : undefined,
          telefono: canEditLinkedPerson ? telefono.trim() || null : undefined,
          email: canEditLinkedPerson ? email.trim() || null : undefined,
          direccion: canEditLinkedPerson ? direccion.trim() || null : undefined,
          nombre_contacto_emergencia: contactoEmergenciaNombre.trim() || null,
          numero_contacto_emergencia: contactoEmergenciaNumero.trim() || null,
          notas_medicas: notasMedicas.trim() || null,
          canal_captacion: canalCaptacion || null,
          modificar_datos_personales: canEditLinkedPerson,
        });
        if (updated) {
          setHydratedSubject({ kind: 'client', data: updated });
          setIsEditing(false);
          setFeedback({ variant: 'success', message: 'Datos del cliente actualizados.' });
        }
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (subject.kind === 'person' && onUpdatePerson) {
      const validation = validatePersonForm({
        tipo_documento: tipoDoc,
        numero_documento: numDoc,
        nombres,
        apellidos,
        telefono,
        email,
      });
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return;
      }
      setIsSaving(true);
      try {
        const updated = await onUpdatePerson(subject.data.id, {
          tipo_documento: tipoDoc,
          numero_documento: numDoc.trim(),
          nombres: nombres.trim(),
          apellidos: apellidos.trim(),
          fecha_nacimiento: fechaNacimiento.trim() || null,
          genero: genero || null,
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          direccion: direccion.trim() || null,
        });
        if (updated) {
          setHydratedSubject({ kind: 'person', data: updated });
          setIsEditing(false);
          setFeedback({ variant: 'success', message: 'Datos de la persona actualizados.' });
        }
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (subject.kind === 'company' && onUpdateCompany) {
      const validation = validateCompanyForm({
        ruc: numDoc,
        razon_social: razonSocial,
        nombre_comercial: nombreComercial,
        telefono,
        email,
      });
      if (!validation.isValid) {
        setFormErrors(validation.errors);
        return;
      }
      setIsSaving(true);
      try {
        const updated = await onUpdateCompany(subject.data.id, {
          razon_social: razonSocial.trim(),
          nombre_comercial: nombreComercial.trim() || null,
          telefono: telefono.trim() || null,
          email: email.trim() || null,
          direccion: direccion.trim() || null,
        });
        if (updated) {
          setHydratedSubject({ kind: 'company', data: updated });
          setIsEditing(false);
          setFeedback({ variant: 'success', message: 'Datos de la empresa actualizados.' });
        }
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (subject.kind === 'supplier' && onUpdateSupplier) {
      const isEmpresa = subject.data.tipo_proveedor === 'EMPRESA';
      setIsSaving(true);
      try {
        const updated = await onUpdateSupplier(subject.data.id, {
          rubro_o_categoria: rubroProveedor.trim() || null,
          contacto_referencia: contactoReferencia.trim() || null,
          ...(isEmpresa
            ? {
                modificar_entidad_vinculada: true,
                empresa_data: {
                  razon_social: razonSocial.trim(),
                  nombre_comercial: nombreComercial.trim() || null,
                  telefono: telefono.trim() || null,
                  email: email.trim() || null,
                  direccion: direccion.trim() || null,
                },
              }
            : canEditLinkedPerson
            ? {
                modificar_entidad_vinculada: true,
                persona_data: {
                  tipo_documento: tipoDoc,
                  numero_documento: numDoc.trim(),
                  nombres: nombres.trim(),
                  apellidos: apellidos.trim(),
                  telefono: telefono.trim() || null,
                  email: email.trim() || null,
                  direccion: direccion.trim() || null,
                },
              }
            : {}),
        });
        if (updated) {
          setHydratedSubject({ kind: 'supplier', data: updated });
          setIsEditing(false);
          setFeedback({ variant: 'success', message: 'Datos del proveedor actualizados.' });
        }
      } finally {
        setIsSaving(false);
      }
      return;
    }

    if (subject.kind === 'user' && onUpdateUser) {
      if (!nombres.trim() || !apellidos.trim() || !username.trim()) {
        setFormErrors({
          nombres: !nombres.trim() ? 'Ingresa los nombres.' : '',
          apellidos: !apellidos.trim() ? 'Ingresa los apellidos.' : '',
          username: !username.trim() ? 'Ingresa el usuario.' : '',
        });
        return;
      }
      setIsSaving(true);
      try {
        const ok = await onUpdateUser(subject.data.id, {
          username: username.trim(),
          rol: userRol,
          persona_data: {
            tipo_documento: tipoDoc,
            numero_documento: numDoc.trim(),
            nombres: nombres.trim(),
            apellidos: apellidos.trim(),
            telefono: telefono.trim() || null,
            email: email.trim() || null,
            direccion: direccion.trim() || null,
          },
        });
        if (ok) {
          setIsEditing(false);
          setFeedback({ variant: 'success', message: 'Perfil de usuario actualizado.' });
        }
      } finally {
        setIsSaving(false);
      }
    }
  };

  const renderReadOnlyField = (label: string, value: string | null | undefined, mono = false) => (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-txt-muted">{label}</span>
      <div
        className={`px-3 py-2 rounded-lg bg-canvas-subtle/70 border border-border text-sm text-txt-primary min-h-[38px] flex items-center ${
          mono ? 'font-mono text-xs font-semibold' : 'font-medium'
        }`}
      >
        {value && value.trim().length > 0 ? (
          <span className="truncate">{value}</span>
        ) : (
          <span className="text-txt-muted font-normal text-xs">Sin registrar</span>
        )}
      </div>
    </div>
  );

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          handleRequestClose();
        }
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        onEscapeKeyDown={(event) => {
          event.preventDefault();
          handleRequestClose();
        }}
        onPointerDownOutside={(event) => {
          event.preventDefault();
          handleRequestClose();
        }}
        onInteractOutside={(event) => {
          if (isSaving || isActionLoading) {
            event.preventDefault();
          }
        }}
        className="max-w-4xl max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-2.5rem)] rounded-xl"
      >
        {/* ================================================================ */}
        {/* CABECERA DEL PERFIL (ESTILO STITCH LIGHT & DARK)                 */}
        {/* ================================================================ */}
        <div className="shrink-0 px-6 py-4 bg-surface border-b border-border flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5 min-w-0">
            {/* Avatar o Icono de Entidad */}
            <div className="relative shrink-0">
              <div className="w-14 h-14 rounded-full border-2 border-brand/40 bg-canvas-subtle overflow-hidden flex items-center justify-center text-base font-bold text-txt-primary shadow-sm">
                {headerInfo.photoUrl ? (
                  <img
                    src={headerInfo.photoUrl}
                    alt={headerInfo.title}
                    className="w-full h-full object-cover"
                  />
                ) : headerInfo.avatarType === 'building' ? (
                  <Icon name="building" className="w-6 h-6 text-status-info" />
                ) : headerInfo.avatarType === 'truck' ? (
                  <Icon name="truck" className="w-6 h-6 text-status-info" />
                ) : (
                  <span className="text-brand font-bold">{headerInfo.initials}</span>
                )}
              </div>
              <span
                aria-hidden="true"
                className={`absolute bottom-0 right-0 w-3.5 h-3.5 rounded-full border-2 border-surface ${
                  headerInfo.isActive ? 'bg-status-success' : 'bg-status-danger'
                }`}
              />
            </div>

            {/* Nombre, Documento y Chips de Rol */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <DialogTitle className="text-lg sm:text-xl font-bold text-txt-primary truncate">
                  <span className="sr-only">Perfil de </span>
                  {headerInfo.title}
                </DialogTitle>
                <span className="px-2 py-0.5 rounded-md bg-canvas-subtle border border-border font-mono text-xs font-semibold text-txt-secondary">
                  {headerInfo.docLabel}
                </span>
                <Badge variant={headerInfo.isActive ? 'success' : 'danger'} size="sm">
                  <Icon
                    name={headerInfo.isActive ? 'check' : 'danger'}
                    className="w-3 h-3 mr-0.5"
                  />
                  <span>{headerInfo.isActive ? 'Activo' : 'Inactivo'}</span>
                </Badge>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {headerInfo.badges.map((b, idx) => (
                  <Badge key={idx} variant={b.variant} size="sm">
                    {b.label}
                  </Badge>
                ))}
              </div>
            </div>
          </div>

          {/* Barra de Acciones Rápidas Superior */}
          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {headerInfo.whatsappLink && (
              <a
                href={headerInfo.whatsappLink}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleOpenWhatsApp}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-status-success-bg text-status-success border border-status-success-border hover:opacity-90 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              >
                <Icon name="smartphone" className="w-3.5 h-3.5" aria-hidden="true" />
                <span>WhatsApp ({headerInfo.phone})</span>
              </a>
            )}

            {canEditCurrentSubject ? (
              <Button
                type="button"
                variant={isEditing ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => {
                  setIsEditing((prev) => !prev);
                  setActiveTab('general');
                  setFormErrors({});
                }}
                leftIcon={<Icon name="edit" className="w-3.5 h-3.5" />}
              >
                {isEditing ? 'Editando...' : 'Editar Perfil'}
              </Button>
            ) : (
              <Badge variant="info" size="sm">
                Solo lectura
              </Badge>
            )}

            {canEditCurrentSubject && onOpenAdvancedEdit && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onOpenAdvancedEdit}
                leftIcon={<Icon name="settings" className="w-3.5 h-3.5" />}
              >
                Opciones Avanzadas
              </Button>
            )}

            {onToggleActive &&
              !(subject.kind === 'client' && currentSession && !canToggleClientActive(currentSession.rol)) &&
              !(
                (subject.kind === 'supplier' || subject.kind === 'company') &&
                currentSession &&
                !canEditOrDeactivateSupplierOrCompany(currentSession.rol)
              ) && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!canToggleStatus || isActionLoading || isSaving}
                onClick={() => onToggleActive(headerInfo.id, headerInfo.isActive)}
                className={
                  headerInfo.isActive
                    ? 'text-status-danger border-status-danger-border hover:bg-status-danger-bg/50'
                    : 'text-status-success border-status-success-border hover:bg-status-success-bg/50'
                }
              >
                {headerInfo.isActive ? 'Desactivar' : 'Activar'}
              </Button>
            )}

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleRequestClose}
              aria-label="Cerrar perfil"
              className="min-h-0 min-w-0 p-1.5 rounded-lg text-txt-muted hover:text-txt-primary hover:bg-canvas-subtle border border-transparent hover:border-border"
            >
              <Icon name="x" className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>
        </div>

        {/* ================================================================ */}
        {/* PESTAÑAS INTERNAS (SOLO CUANDO APLICA: EJ. CLIENTES)             */}
        {/* ================================================================ */}
        {subject.kind === 'client' && (
          <div className="shrink-0 px-6 bg-canvas-subtle/60 border-b border-border flex items-center gap-2 overflow-x-auto">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={activeTab === 'general'}
              onClick={() => setActiveTab('general')}
              leftIcon={<Icon name="user" className="w-3.5 h-3.5" aria-hidden="true" />}
              className={`rounded-none py-2.5 px-3 text-xs font-semibold border-b-2 hover:bg-transparent whitespace-nowrap ${
                activeTab === 'general'
                  ? 'border-brand text-brand hover:text-brand'
                  : 'border-transparent text-txt-muted hover:text-txt-primary'
              }`}
            >
              1. Datos Generales
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={activeTab === 'qr'}
              onClick={() => setActiveTab('qr')}
              leftIcon={<Icon name="qr" className="w-3.5 h-3.5" aria-hidden="true" />}
              className={`rounded-none py-2.5 px-3 text-xs font-semibold border-b-2 hover:bg-transparent whitespace-nowrap ${
                activeTab === 'qr'
                  ? 'border-brand text-brand hover:text-brand'
                  : 'border-transparent text-txt-muted hover:text-txt-primary'
              }`}
            >
              2. Credencial QR
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={activeTab === 'weight'}
              onClick={() => setActiveTab('weight')}
              leftIcon={<Icon name="activity" className="w-3.5 h-3.5" aria-hidden="true" />}
              className={`rounded-none py-2.5 px-3 text-xs font-semibold border-b-2 hover:bg-transparent whitespace-nowrap ${
                activeTab === 'weight'
                  ? 'border-brand text-brand hover:text-brand'
                  : 'border-transparent text-txt-muted hover:text-txt-primary'
              }`}
            >
              <span>3. Historial de Peso</span>
              <span className="px-1.5 py-0.2 rounded bg-surface border border-border font-mono text-[10px] text-txt-secondary">
                {formatKg(activeClientWeightKg)}
              </span>
            </Button>
          </div>
        )}

        {/* ================================================================ */}
        {/* CUERPO DEL PERFIL                                                */}
        {/* ================================================================ */}
        <div className="flex-1 min-h-0 px-6 py-5 overflow-y-auto overscroll-contain bg-canvas/40 flex flex-col gap-4">
          {feedback && (
            <Alert variant={feedback.variant} onClose={() => setFeedback(null)}>
              {feedback.message}
            </Alert>
          )}

          {/* VISTA PRINCIPAL EN 2 COLUMNAS (DATOS GENERALES) */}
          {activeTab === 'general' && (
            <form
              id="entity-profile-inline-form"
              noValidate
              onSubmit={handleSaveInlineChanges}
              onKeyDown={preventEnterKeySubmit}
              className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start"
            >
              {/* COLUMNA IZQUIERDA (7 cols): DATOS BASE Y CONTACTO */}
              <div className="lg:col-span-7 flex flex-col gap-4">
                {/* Bloque 1: Identificación y Datos Principales */}
                <div className="bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3.5">
                  <div className="flex items-center justify-between border-b border-border pb-2.5">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-brand" />
                      <h3 className="text-sm font-bold text-txt-primary">
                        Identificación y Datos Principales
                      </h3>
                    </div>
                    {!canEditLinkedPerson && isEditing && (
                      <span className="text-[11px] text-status-warning font-semibold">
                        Datos personales protegidos por rol
                      </span>
                    )}
                  </div>

                  {/* Campos según tipo de entidad */}
                  {subject.kind === 'company' ||
                  (subject.kind === 'supplier' && subject.data.tipo_proveedor === 'EMPRESA') ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {renderReadOnlyField('Número de RUC', numDoc, true)}
                      {isEditing ? (
                        <Input
                          label="Nombre Comercial"
                          value={nombreComercial}
                          onChange={(e) => setNombreComercial(e.target.value)}
                          error={formErrors.nombre_comercial}
                        />
                      ) : (
                        renderReadOnlyField('Nombre Comercial', nombreComercial)
                      )}
                      <div className="sm:col-span-2">
                        {isEditing ? (
                          <Input
                            label="Razón Social"
                            value={razonSocial}
                            onChange={(e) => setRazonSocial(e.target.value)}
                            error={formErrors.razon_social}
                            required
                          />
                        ) : (
                          renderReadOnlyField('Razón Social', razonSocial)
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {isEditing && canEditLinkedPerson ? (
                        <>
                          <Select
                            label="Tipo de Documento"
                            value={tipoDoc}
                            onChange={(e) => setTipoDoc(e.target.value as PersonDocumentType)}
                            options={PERSON_DOCUMENT_TYPES.map((t) => ({
                              value: t,
                              label: t,
                            }))}
                          />
                          <Input
                            label="Número de Documento"
                            value={numDoc}
                            onChange={(e) => setNumDoc(e.target.value)}
                            error={formErrors.numero_documento}
                            required
                          />
                          <Input
                            label="Nombres"
                            value={nombres}
                            onChange={(e) => setNombres(e.target.value)}
                            error={formErrors.nombres}
                            required
                          />
                          <Input
                            label="Apellidos"
                            value={apellidos}
                            onChange={(e) => setApellidos(e.target.value)}
                            error={formErrors.apellidos}
                            required
                          />
                          {(subject.kind === 'client' || subject.kind === 'person') && (
                            <>
                              <Input
                                label="Fecha de Nacimiento"
                                type="date"
                                value={fechaNacimiento}
                                onChange={(e) => setFechaNacimiento(e.target.value)}
                              />
                              <Select
                                label="Género"
                                value={genero}
                                onChange={(e) => setGenero(e.target.value as PersonGender | '')}
                                options={[
                                  { value: '', label: 'Sin especificar' },
                                  ...PERSON_GENDER_OPTIONS,
                                ]}
                              />
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          {renderReadOnlyField('Tipo de Documento', tipoDoc)}
                          {renderReadOnlyField('Número de Documento', numDoc, true)}
                          {renderReadOnlyField('Nombres', nombres)}
                          {renderReadOnlyField('Apellidos', apellidos)}
                          {(subject.kind === 'client' || subject.kind === 'person') && (
                            <>
                              {renderReadOnlyField('Fecha de Nacimiento', fechaNacimiento)}
                              {renderReadOnlyField('Género', getGenderLabel(genero))}
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Bloque 2: Contacto y Ubicación (Común a todas las entidades) */}
                <div className="bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3.5">
                  <div className="flex items-center gap-2 border-b border-border pb-2.5">
                    <span className="w-2 h-2 rounded-full bg-accent-indigo" />
                    <h3 className="text-sm font-bold text-txt-primary">
                      Contacto y Ubicación
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                    {isEditing && canEditLinkedPerson ? (
                      <>
                        <Input
                          label="Teléfono / WhatsApp"
                          value={telefono}
                          onChange={(e) => setTelefono(e.target.value)}
                          error={formErrors.telefono}
                          placeholder="Ej. 987654321"
                        />
                        <Input
                          label="Correo Electrónico"
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          error={formErrors.email}
                          placeholder="correo@ejemplo.com"
                        />
                        <div className="sm:col-span-2">
                          <Input
                            label="Dirección"
                            value={direccion}
                            onChange={(e) => setDireccion(e.target.value)}
                            placeholder="Av. / Calle / Distrito"
                          />
                        </div>
                      </>
                    ) : (
                      <>
                        {renderReadOnlyField('Teléfono / WhatsApp', telefono, true)}
                        {renderReadOnlyField('Correo Electrónico', email)}
                        <div className="sm:col-span-2">
                          {renderReadOnlyField('Dirección', direccion)}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Campos adicionales de Emergencia, Salud y Captación para Clientes */}
                  {subject.kind === 'client' && (
                    <div className="pt-2 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {isEditing ? (
                        <>
                          <Input
                            label="Contacto de Emergencia (Nombre)"
                            value={contactoEmergenciaNombre}
                            onChange={(e) => setContactoEmergenciaNombre(e.target.value)}
                            placeholder="Nombre de familiar o contacto"
                          />
                          <Input
                            label="Teléfono de Emergencia"
                            value={contactoEmergenciaNumero}
                            onChange={(e) => setContactoEmergenciaNumero(e.target.value)}
                            error={formErrors.numero_contacto_emergencia}
                            placeholder="999888777"
                          />
                          <Select
                            label="Canal de Captación"
                            value={canalCaptacion}
                            onChange={(e) =>
                              setCanalCaptacion(e.target.value as ClientAcquisitionChannel | '')
                            }
                            options={[
                              { value: '', label: 'Sin especificar' },
                              ...CLIENT_ACQUISITION_CHANNEL_OPTIONS,
                            ]}
                          />
                          <Input
                            label="Notas Médicas / Observaciones"
                            value={notasMedicas}
                            onChange={(e) => setNotasMedicas(e.target.value)}
                            placeholder="Alergias, lesiones o condiciones relevantes"
                          />
                        </>
                      ) : (
                        <>
                          {renderReadOnlyField(
                            'Contacto de Emergencia',
                            contactoEmergenciaNombre
                          )}
                          {renderReadOnlyField(
                            'Teléfono de Emergencia',
                            contactoEmergenciaNumero,
                            true
                          )}
                          {renderReadOnlyField(
                            'Canal de Captación',
                            getAcquisitionChannelLabel(canalCaptacion)
                          )}
                          {renderReadOnlyField('Notas Médicas', notasMedicas)}
                        </>
                      )}
                    </div>
                  )}

                  {/* Campos adicionales para Proveedores */}
                  {subject.kind === 'supplier' && (
                    <div className="pt-2 border-t border-border grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {isEditing ? (
                        <>
                          <Input
                            label="Rubro o Categoría"
                            value={rubroProveedor}
                            onChange={(e) => setRubroProveedor(e.target.value)}
                            placeholder="Ej. Suplementos, Mantenimiento"
                          />
                          <Input
                            label="Contacto de Referencia"
                            value={contactoReferencia}
                            onChange={(e) => setContactoReferencia(e.target.value)}
                            placeholder="Ejecutivo de ventas"
                          />
                        </>
                      ) : (
                        <>
                          {renderReadOnlyField('Rubro o Categoría', rubroProveedor)}
                          {renderReadOnlyField('Contacto de Referencia', contactoReferencia)}
                        </>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* COLUMNA DERECHA (5 cols): CREDENCIAL QR, PESO O RESUMEN DE ROL */}
              <div className="lg:col-span-5 flex flex-col gap-4">
                {subject.kind === 'client' && clientData && (
                  <>
                    {/* Tarjeta de Credencial Digital QR */}
                    <div className="bg-surface rounded-xl border border-border overflow-hidden shadow-sm">
                      <div className="bg-brand text-brand-text px-4 py-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon name="qr" className="w-4 h-4 text-brand-text" aria-hidden="true" />
                          <div>
                            <span className="text-xs font-bold tracking-wider uppercase block">
                              Credencial QR
                            </span>
                            <span className="text-[10px] text-brand-text/85 font-mono">
                              Pase de Acceso Local
                            </span>
                          </div>
                        </div>
                        <Badge variant="success" size="sm" className="bg-surface/95 text-status-success border-transparent uppercase text-[10px]">
                          Token Activo
                        </Badge>
                      </div>

                      <div className="p-4 flex flex-col items-center gap-3">
                        {/* Zona blanca segura para lectura óptica en Modo Claro y Oscuro */}
                        <div className="p-3 bg-white rounded-xl border border-border shadow-xs flex items-center justify-center">
                          {qrDataUrl ? (
                            <img
                              src={qrDataUrl}
                              alt={`Código QR de ${headerInfo.title}`}
                              className="w-40 h-40 object-contain"
                            />
                          ) : (
                            <div className="w-40 h-40 flex items-center justify-center text-xs text-txt-muted font-mono">
                              Generando QR...
                            </div>
                          )}
                        </div>

                        {/* Token QR + Copiar */}
                        <div className="w-full px-3 py-2 rounded-lg bg-canvas-subtle border border-border flex items-center justify-between gap-2">
                          <span className="font-mono text-xs font-bold text-txt-primary truncate">
                            {qrToken}
                          </span>
                          <Button
                            type="button"
                            variant="link"
                            size="sm"
                            onClick={handleCopyToken}
                            className="text-xs font-semibold shrink-0 h-auto min-h-0 p-0"
                          >
                            {copiedToken ? '¡Copiado!' : 'Copiar'}
                          </Button>
                        </div>

                        {/* Acciones del QR */}
                        <div className="w-full flex flex-col gap-2">
                          {headerInfo.whatsappLink ? (
                            <a
                              href={headerInfo.whatsappLink}
                              target="_blank"
                              rel="noopener noreferrer"
                              onClick={handleOpenWhatsApp}
                              className="w-full py-2 px-3 rounded-lg bg-brand hover:bg-brand-hover text-brand-text text-xs font-semibold inline-flex items-center justify-center gap-2 shadow-xs transition-colors"
                            >
                              <Icon name="smartphone" className="w-4 h-4" aria-hidden="true" />
                              <span>Enviar QR a WhatsApp</span>
                            </a>
                          ) : (
                            <div className="w-full py-2 px-3 rounded-lg bg-canvas-subtle border border-border text-txt-muted text-xs text-center">
                              Registra un celular para enviar por WhatsApp
                            </div>
                          )}

                          <Button
                            type="button"
                            variant={downloadedQrPng ? 'primary' : 'secondary'}
                            size="sm"
                            onClick={handleDownloadQrPng}
                            disabled={!qrDataUrl}
                            leftIcon={
                              <Icon
                                name={downloadedQrPng ? 'check' : 'download'}
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                            }
                            className="w-full"
                          >
                            {downloadedQrPng ? '¡PNG Descargado!' : 'Descargar Carnet PNG'}
                          </Button>

                          {onRegenerateQr && !showConfirmRegen && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => setShowConfirmRegen(true)}
                              className="text-[11px] font-semibold text-txt-muted hover:text-status-danger hover:bg-transparent py-1 min-h-0"
                            >
                              Regenerar token QR (invalidar anterior)
                            </Button>
                          )}

                          {showConfirmRegen && (
                            <div className="w-full p-2.5 rounded-lg bg-status-danger-bg/50 border border-status-danger-border flex flex-col gap-2">
                              <span className="text-[11px] text-status-danger font-medium">
                                El código QR anterior dejará de funcionar de inmediato.
                              </span>
                              <div className="flex items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setShowConfirmRegen(false)}
                                >
                                  Cancelar
                                </Button>
                                <Button
                                  type="button"
                                  variant="danger"
                                  size="sm"
                                  isLoading={isRegeneratingQr}
                                  onClick={handleConfirmRegenerateQr}
                                >
                                  Confirmar
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Tarjeta Resumen de Peso Corporal */}
                    <div className="bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Icon name="activity" className="w-4 h-4 text-brand" aria-hidden="true" />
                          <h4 className="text-xs font-bold uppercase tracking-wider text-txt-secondary">
                            Control de Peso
                          </h4>
                        </div>
                        <Button
                          type="button"
                          variant="link"
                          size="sm"
                          onClick={() => setActiveTab('weight')}
                          className="text-xs font-semibold h-auto min-h-0 p-0"
                        >
                          Ver historial
                        </Button>
                      </div>

                      <div className="flex items-baseline justify-between">
                        <span className="text-2xl font-bold text-txt-primary">
                          {formatKg(activeClientWeightKg)}
                        </span>
                        {weightHistory.length > 0 && (
                          <span className="text-xs font-mono text-txt-muted">
                            Último: {weightHistory[0].fecha_registro.slice(0, 10)}
                          </span>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* Resumen Contextual para Personas */}
                {subject.kind === 'person' && (
                  <div className="bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center gap-2 border-b border-border pb-2.5">
                      <Icon name="users" className="w-4 h-4 text-brand" />
                      <h3 className="text-sm font-bold text-txt-primary">
                        Vínculos en el Sistema
                      </h3>
                    </div>
                    <div className="flex flex-col gap-2 text-xs">
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-canvas-subtle border border-border">
                        <span className="font-medium text-txt-secondary">Rol de Cliente</span>
                        <Badge variant={subject.data.es_cliente ? 'success' : 'default'} size="sm">
                          {subject.data.es_cliente ? 'Inscrito' : 'No inscrito'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-canvas-subtle border border-border">
                        <span className="font-medium text-txt-secondary">Rol de Proveedor</span>
                        <Badge
                          variant={subject.data.es_proveedor ? 'info' : 'default'}
                          size="sm"
                        >
                          {subject.data.es_proveedor ? 'Activo' : 'No vinculado'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-canvas-subtle border border-border">
                        <span className="font-medium text-txt-secondary">Cuenta de Personal</span>
                        <Badge
                          variant={subject.data.rol_usuario ? 'warning' : 'default'}
                          size="sm"
                        >
                          {subject.data.rol_usuario || 'Sin cuenta'}
                        </Badge>
                      </div>
                    </div>
                  </div>
                )}

                {/* Resumen Contextual para Proveedores y Empresas */}
                {(subject.kind === 'supplier' || subject.kind === 'company') && (
                  <div className="bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3">
                    <div className="flex items-center gap-2 border-b border-border pb-2.5">
                      <Icon name="building" className="w-4 h-4 text-status-info" />
                      <h3 className="text-sm font-bold text-txt-primary">
                        Ficha Comercial
                      </h3>
                    </div>
                    <div className="flex flex-col gap-2.5">
                      {renderReadOnlyField(
                        'Identificación Fiscal',
                        headerInfo.docLabel,
                        true
                      )}
                      {subject.kind === 'supplier' &&
                        renderReadOnlyField(
                          'Modalidad de Proveedor',
                          subject.data.tipo_proveedor === 'EMPRESA'
                            ? 'Empresa Jurídica (RUC 20)'
                            : 'Persona Natural'
                        )}
                      {renderReadOnlyField(
                        'Estado Operativo',
                        headerInfo.isActive ? 'Habilitado para operaciones' : 'Inactivo'
                      )}
                    </div>
                  </div>
                )}

                {/* Resumen Contextual para Usuarios del Sistema */}
                {subject.kind === 'user' && (
                  <div className="bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3.5">
                    <div className="flex items-center gap-2 border-b border-border pb-2.5">
                      <Icon name="shield" className="w-4 h-4 text-accent-indigo" />
                      <h3 className="text-sm font-bold text-txt-primary">
                        Cuenta y Permisos de Acceso
                      </h3>
                    </div>
                    {isEditing ? (
                      <div className="flex flex-col gap-3">
                        <Input
                          label="Nombre de Usuario (@)"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          error={formErrors.username}
                          required
                        />
                        <Select
                          label="Rol del Sistema"
                          value={userRol}
                          onChange={(e) => setUserRol(e.target.value as UserRole)}
                          disabled={currentSession?.rol !== 'ADMINISTRADOR'}
                          options={[
                            { value: 'RECEPCIONISTA', label: 'RECEPCIONISTA' },
                            { value: 'ADMINISTRADOR', label: 'ADMINISTRADOR' },
                          ]}
                        />
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2.5">
                        {renderReadOnlyField('Usuario de Acceso', `@${subject.data.username}`, true)}
                        {renderReadOnlyField('Rol Asignado', subject.data.rol)}
                        {renderReadOnlyField(
                          'Último Inicio de Sesión',
                          subject.data.ultimo_login || 'Nunca'
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </form>
          )}

          {/* PESTAÑA 2: CREDENCIAL QR ENFOCADA (CLIENTES) */}
          {subject.kind === 'client' && activeTab === 'qr' && clientData && (
            <div className="max-w-md mx-auto w-full bg-surface rounded-xl border border-border p-5 shadow-sm flex flex-col items-center gap-4">
              <div className="p-4 bg-white rounded-xl border border-border shadow-xs">
                {qrDataUrl ? (
                  <img
                    src={qrDataUrl}
                    alt={`Código QR de ${headerInfo.title}`}
                    className="w-52 h-52 object-contain"
                  />
                ) : (
                  <div className="w-52 h-52 flex items-center justify-center text-xs text-txt-muted">
                    Generando QR...
                  </div>
                )}
              </div>
              <div className="text-center">
                <h3 className="text-base font-bold text-txt-primary">{headerInfo.title}</h3>
                <p className="text-xs font-mono text-txt-secondary">{headerInfo.docLabel}</p>
                <p className="text-xs font-mono font-bold text-brand mt-1">{qrToken}</p>
              </div>
              <div className="w-full flex flex-col sm:flex-row gap-2">
                <Button
                  type="button"
                  variant={downloadedQrPng ? 'primary' : 'secondary'}
                  size="md"
                  onClick={handleDownloadQrPng}
                  leftIcon={
                    <Icon
                      name={downloadedQrPng ? 'check' : 'download'}
                      className="w-4 h-4"
                    />
                  }
                  className="flex-1"
                >
                  {downloadedQrPng ? '¡PNG Descargado!' : 'Descargar PNG'}
                </Button>
                {headerInfo.whatsappLink && (
                  <a
                    href={headerInfo.whatsappLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleOpenWhatsApp}
                    className="flex-1 py-2 px-4 rounded-md bg-brand hover:bg-brand-hover text-brand-text text-sm font-medium inline-flex items-center justify-center gap-2 shadow-xs transition-colors"
                  >
                    <Icon name="smartphone" className="w-4 h-4" />
                    <span>Enviar WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          )}

          {/* PESTAÑA 3: HISTORIAL Y REGISTRO DE PESO (CLIENTES) */}
          {subject.kind === 'client' && activeTab === 'weight' && clientData && (
            <div className="flex flex-col gap-5">
              {/* Gráfico Estadístico Lineal Interactivo (Reutilizable) */}
              {!isWeightLoading && (
                <InteractiveLineChart
                  data={weightChartData}
                  unit="kg"
                  decimals={2}
                  trendSemantic="neutral"
                  title="Evolución Lineal de Peso Corporal"
                  subtitle="Pasa el cursor o selecciona un nodo para ver fecha, variación (Δ) y nota"
                  emptyTitle="Sin mediciones previas registradas"
                  emptyDescription="Registra el peso actual del socio abajo para comenzar a graficar su evolución."
                />
              )}

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
                <div className="lg:col-span-5 bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3.5">
                  <h3 className="text-sm font-bold text-txt-primary border-b border-border pb-2">
                    Registrar Nuevo Peso
                  </h3>
                  <form
                    noValidate
                    onSubmit={handleRecordNewWeight}
                    onKeyDown={preventEnterKeySubmit}
                    className="flex flex-col gap-3"
                  >
                    <Input
                      label="Peso (kg)"
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej. 75.50"
                      value={newWeightKg}
                      onFocus={selectIfZeroDefault}
                      onChange={(e) => setNewWeightKg(sanitizeDecimalInput(e.target.value))}
                      onBlur={(e) => {
                        setNewWeightKg(formatDecimalOnBlur(e.target.value, { min: 1, max: 400 }));
                      }}
                      error={weightError || undefined}
                      required
                    />
                    <Input
                      label="Nota (opcional)"
                      placeholder="Ej. Control mensual"
                      value={newWeightNote}
                      onChange={(e) => setNewWeightNote(e.target.value)}
                    />
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      isLoading={isSaving}
                      disabled={!onRecordWeight}
                    >
                      Guardar Peso
                    </Button>
                  </form>
                </div>

                <div className="lg:col-span-7 bg-surface rounded-xl border border-border p-4 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center justify-between border-b border-border pb-2">
                    <h3 className="text-sm font-bold text-txt-primary">
                      Historial de Mediciones
                    </h3>
                    <span className="text-xs font-bold text-brand">
                      Actual: {formatKg(activeClientWeightKg)}
                    </span>
                  </div>

                  {isWeightLoading ? (
                    <div className="py-6 text-center text-xs text-txt-muted">
                      Cargando historial...
                    </div>
                  ) : weightHistory.length === 0 ? (
                    <div className="py-6 text-center text-xs text-txt-muted">
                      No hay mediciones previas registradas.
                    </div>
                  ) : (
                    <div className="flex flex-col divide-y divide-border max-h-64 overflow-y-auto">
                      {weightHistory.map((rec) => {
                        const varInfo = formatWeightVariation(rec.variacion_kg);
                        return (
                          <div
                            key={rec.id}
                            className="py-2.5 flex items-center justify-between gap-3 text-xs"
                          >
                            <div>
                              <span className="font-bold text-txt-primary">
                                {formatKg(rec.peso_kg)}
                              </span>
                              {rec.nota && (
                                <span className="text-txt-muted ml-2">— {rec.nota}</span>
                              )}
                              <span className="block text-[11px] font-mono text-txt-muted">
                                {rec.fecha_registro}
                              </span>
                            </div>
                            <Badge variant={varInfo.variant} size="sm">
                              {varInfo.text}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ================================================================ */}
        {/* PIE DEL PERFIL (METADATOS CONCISOS + ACCIONES DE GUARDADO)       */}
        {/* ================================================================ */}
        <div className="shrink-0 px-6 py-3.5 bg-canvas-subtle border-t border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-txt-muted">
            <span>ID #{headerInfo.id}</span>
            {headerInfo.createdAt && (
              <>
                <span>•</span>
                <span>Registro: {headerInfo.createdAt}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            {isEditing ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setIsEditing(false);
                    setFormErrors({});
                  }}
                  disabled={isSaving}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  form="entity-profile-inline-form"
                  variant="primary"
                  size="sm"
                  isLoading={isSaving}
                  leftIcon={<Icon name="check" className="w-3.5 h-3.5" />}
                >
                  Guardar Cambios
                </Button>
              </>
            ) : (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleRequestClose}
              >
                Cerrar
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
