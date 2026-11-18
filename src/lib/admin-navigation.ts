import {
  Archive,
  CalendarDays,
  ClipboardList,
  Clock3,
  ContactRound,
  Database,
  LayoutDashboard,
  Images,
  LayoutGrid,
  Trophy,
  History,
  UserRoundCog,
  type LucideIcon,
} from "lucide-react";

export type AdminModuleId =
  | "overview"
  | "agenda"
  | "reservations"
  | "hours"
  | "courts"
  | "tournament"
  | "contact"
  | "backup"
  | "gallery"
  | "legacy"
  | "audit"
  | "users";

export const ADMIN_MODULES: Array<{
  id: AdminModuleId;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "overview", label: "Visão geral", icon: LayoutDashboard },
  { id: "agenda", label: "Agenda", icon: CalendarDays },
  { id: "reservations", label: "Reservas", icon: ClipboardList },
  { id: "hours", label: "Horários", icon: Clock3 },
  { id: "courts", label: "Unidades e quadras", icon: LayoutGrid },
  { id: "gallery", label: "Galeria de fotos", icon: Images },
  { id: "tournament", label: "Torneio", icon: Trophy },
  { id: "contact", label: "Contato", icon: ContactRound },
  { id: "backup", label: "Dados e backup", icon: Database },
  { id: "legacy", label: "Histórico legado", icon: Archive },
  { id: "audit", label: "Alterações feitas", icon: History },
  { id: "users", label: "Gerenciar acessos", icon: UserRoundCog },
];

export type AdminRole = "master" | "caixa" | "midia";
export const ADMIN_MODULE_ROLES: Record<AdminModuleId, AdminRole[]> = {
  overview: ["master", "caixa"],
  agenda: ["master", "midia"],
  reservations: ["master", "caixa"],
  hours: ["master", "caixa"],
  courts: ["master"],
  tournament: ["master", "midia"],
  contact: ["master"],
  backup: ["master"],
  gallery: ["master", "midia"],
  legacy: ["master"],
  audit: ["master"],
  users: ["master"],
};

export function modulesForRole(role: AdminRole) {
  return ADMIN_MODULES.filter((module) => ADMIN_MODULE_ROLES[module.id].includes(role));
}
