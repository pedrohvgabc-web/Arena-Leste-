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

export type AdminModuleGroup =
  "Comece aqui" | "Operação diária" | "Arena e conteúdo" | "Administração";

export type AdminRole = "master" | "caixa" | "midia";

export type AdminModuleInfo = {
  id: AdminModuleId;
  label: string;
  icon: LucideIcon;
  group: AdminModuleGroup;
  description: string;
  capabilities: string[];
  capabilitiesByRole?: Partial<Record<AdminRole, string[]>>;
  firstStep: string;
};

export const ADMIN_MODULES: AdminModuleInfo[] = [
  {
    id: "overview",
    label: "Visão geral",
    icon: LayoutDashboard,
    group: "Comece aqui",
    description: "Resumo do dia e atalhos para as tarefas que seu perfil pode executar.",
    capabilities: [
      "Ver indicadores",
      "Encontrar reservas próximas",
      "Abrir uma área pelo objetivo",
    ],
    firstStep: "Confira os avisos e abra o cartão da tarefa que deseja resolver.",
  },
  {
    id: "agenda",
    label: "Agenda",
    icon: CalendarDays,
    group: "Operação diária",
    description: "Veja a ocupação das quadras e os horários reservados por data.",
    capabilities: [
      "Consultar horários do dia",
      "Identificar a unidade e a quadra",
      "Abrir os detalhes da reserva",
    ],
    firstStep: "Escolha a data e confira a lista de horários por quadra.",
  },
  {
    id: "reservations",
    label: "Reservas",
    icon: ClipboardList,
    group: "Operação diária",
    description: "Encontre reservas recentes, acompanhe pagamentos e resolva pendências.",
    capabilities: [
      "Buscar por nome, telefone ou código",
      "Filtrar por situação",
      "Confirmar, anotar ou cancelar reservas",
    ],
    capabilitiesByRole: {
      master: ["Criar bloqueio manual imediato, sem pagamento"],
    },
    firstStep: "Use a busca ou os filtros para localizar a reserva e veja o status antes de agir.",
  },
  {
    id: "hours",
    label: "Horários",
    icon: Clock3,
    group: "Operação diária",
    description: "Configure os horários de funcionamento semanal e exceções de datas.",
    capabilities: [
      "Escolher a unidade",
      "Ajustar dias e faixas de funcionamento",
      "Salvar exceções e feriados",
    ],
    firstStep: "Selecione a unidade e o dia; depois confira a faixa antes de tocar em Salvar.",
  },
  {
    id: "courts",
    label: "Unidades e quadras",
    icon: LayoutGrid,
    group: "Arena e conteúdo",
    description: "Mantenha as quadras, preços, duração e publicação da reserva em dia.",
    capabilities: [
      "Escolher uma unidade",
      "Editar nome, preço e duração",
      "Ativar quadras ou adicionar outra",
    ],
    firstStep: "Escolha a unidade, edite os dados da quadra e salve para publicar a alteração.",
  },
  {
    id: "gallery",
    label: "Galeria de fotos",
    icon: Images,
    group: "Arena e conteúdo",
    description: "Envie e organize fotos que podem aparecer nos canais públicos da Arena.",
    capabilities: [
      "Adicionar e otimizar fotos",
      "Editar título e descrição",
      "Publicar, ocultar, ordenar ou excluir",
    ],
    firstStep:
      "Para incluir uma imagem, comece em Adicionar uma foto; para uma existente, use a biblioteca.",
  },
  {
    id: "tournament",
    label: "Torneio",
    icon: Trophy,
    group: "Arena e conteúdo",
    description: "Consulte as pré-inscrições do torneio e atualize a situação de cada equipe.",
    capabilities: [
      "Ver inscrições recebidas",
      "Conferir situação da inscrição e do pagamento",
      "Contatar o capitão",
    ],
    firstStep: "Confira a situação antes de abrir os dados de contato ou atualizar uma inscrição.",
  },
  {
    id: "contact",
    label: "Contato oficial",
    icon: ContactRound,
    group: "Arena e conteúdo",
    description: "Consulte os canais e endereços oficiais exibidos no site.",
    capabilities: [
      "Abrir o WhatsApp oficial",
      "Acessar o Instagram",
      "Conferir os endereços das unidades",
    ],
    firstStep: "Use os links para abrir o canal oficial; os dados são somente para consulta.",
  },
  {
    id: "backup",
    label: "Dados e backup",
    icon: Database,
    group: "Administração",
    description: "Exporte uma cópia administrativa com cuidado com informações pessoais.",
    capabilities: ["Gerar exportação de dados", "Revisar o aviso de privacidade antes de baixar"],
    firstStep: "Leia o aviso exibido e só então solicite o arquivo de backup.",
  },
  {
    id: "legacy",
    label: "Histórico legado",
    icon: Archive,
    group: "Administração",
    description: "Consulte registros do sistema antigo, separados da agenda atual da Arena Leste.",
    capabilities: [
      "Pesquisar pelo dia",
      "Filtrar registros antigos",
      "Verificar manualmente uma informação histórica",
    ],
    firstStep:
      "Escolha a data ou pesquise o registro; histórico antigo não representa disponibilidade atual.",
  },
  {
    id: "audit",
    label: "Alterações feitas",
    icon: History,
    group: "Administração",
    description: "Consulte o histórico das mudanças administrativas registradas no sistema.",
    capabilities: [
      "Filtrar por período e tipo de alteração",
      "Ver módulo, ação e detalhes",
      "Rastrear alterações",
    ],
    firstStep:
      "Defina o período e o tipo; depois toque em Filtrar alterações para ver os resultados.",
  },
  {
    id: "users",
    label: "Gerenciar acessos",
    icon: UserRoundCog,
    group: "Administração",
    description: "Administre acessos do painel e, quando aplicável, logins do WMS/PDV.",
    capabilities: [
      "Criar ou editar contas",
      "Ajustar perfil e situação",
      "Atualizar credenciais conforme necessário",
    ],
    firstStep: "Escolha qual lista de acessos deseja administrar antes de salvar mudanças.",
  },
];

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

export function moduleCapabilitiesForRole(module: AdminModuleInfo, role?: AdminRole) {
  return [...module.capabilities, ...(role ? (module.capabilitiesByRole?.[role] ?? []) : [])];
}
