import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import {
  getAdminPushSettings,
  removeAdminPushSubscription,
  saveAdminPushSubscription,
} from "@/lib/admin-push.functions";

type Props = { adminId: string };

function urlBase64ToArrayBuffer(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const raw = window.atob(padded);
  const buffer = new ArrayBuffer(raw.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return buffer;
}

function isIosHomeScreenApp() {
  const nav = window.navigator as Navigator & { standalone?: boolean };
  const isAppleTouchDevice =
    /iPhone|iPad|iPod/i.test(nav.userAgent) ||
    (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
  const standalone =
    nav.standalone === true || window.matchMedia("(display-mode: standalone)").matches;
  return !isAppleTouchDevice || standalone;
}

export function MasterPushNotifications({ adminId }: Props) {
  const queryClient = useQueryClient();
  const load = useServerFn(getAdminPushSettings);
  const save = useServerFn(saveAdminPushSubscription);
  const remove = useServerFn(removeAdminPushSubscription);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [deviceActive, setDeviceActive] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    async function readDeviceSubscription() {
      if (!("serviceWorker" in navigator)) {
        setDeviceActive(false);
        return;
      }
      try {
        const registration = await navigator.serviceWorker.getRegistration("/");
        const subscription = await registration?.pushManager.getSubscription();
        if (!cancelled) setDeviceActive(Boolean(subscription));
      } catch {
        if (!cancelled) setDeviceActive(false);
      }
    }
    void readDeviceSubscription();
    return () => {
      cancelled = true;
    };
  }, [adminId]);
  const query = useQuery({
    queryKey: ["admin-push-settings", adminId],
    queryFn: () => load(),
    retry: false,
    staleTime: 15_000,
  });
  const settings = query.data;

  async function activate() {
    setMessage(null);
    if (!settings?.configured || !settings.publicKey) {
      setMessage("As chaves de Web Push ainda não foram configuradas no servidor.");
      return;
    }
    if (!isIosHomeScreenApp()) {
      setMessage(
        "No iPhone ou iPad, adicione primeiro o site à Tela de Início. Abra-o pelo ícone instalado e toque em ativar notificações.",
      );
      return;
    }
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      !("Notification" in window)
    ) {
      setMessage("Este navegador não oferece notificações push para este site.");
      return;
    }

    setBusy(true);
    try {
      // A permissão só é solicitada em resposta ao toque explícito do admin master.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setMessage(
          permission === "denied"
            ? "A permissão foi bloqueada. Altere-a nas configurações do navegador e tente novamente."
            : "A permissão não foi concedida. Você pode ativá-la quando quiser.",
        );
        return;
      }

      const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToArrayBuffer(settings.publicKey),
        }));
      const serialized = subscription.toJSON();
      if (!serialized.endpoint || !serialized.keys?.["p256dh"] || !serialized.keys["auth"]) {
        throw new Error("A assinatura do navegador está incompleta.");
      }

      await save({
        data: {
          endpoint: serialized.endpoint,
          keys: {
            p256dh: serialized.keys["p256dh"],
            auth: serialized.keys["auth"],
          },
        },
      });
      setDeviceActive(true);
      await queryClient.invalidateQueries({ queryKey: ["admin-push-settings", adminId] });
      setMessage("Notificações ativadas neste dispositivo.");
    } catch {
      setMessage("Não foi possível ativar agora. Confira a conexão e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function deactivate() {
    setMessage(null);
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        await remove({ data: { endpoint: subscription.endpoint } });
      }
      setDeviceActive(false);
      await queryClient.invalidateQueries({ queryKey: ["admin-push-settings", adminId] });
      setMessage("Notificações desativadas neste dispositivo.");
    } catch {
      setMessage("Não foi possível desativar a assinatura. Tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="my-5 flex flex-col gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
      aria-labelledby="master-push-heading"
    >
      <div className="flex min-w-0 items-start gap-3">
        <Bell className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0">
          <h2 id="master-push-heading" className="font-display text-xl font-bold uppercase">
            Avisos de novas reservas
          </h2>
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
            Receba no dispositivo o nome, a data, a unidade e o intervalo de horas. A notificação
            não exibe valor, telefone, CPF ou endereço. Ela pode aparecer na tela bloqueada.
          </p>
          {query.isError && (
            <p className="mt-2 text-sm text-destructive" role="alert">
              Não foi possível consultar a configuração. Atualize o painel e tente novamente.
            </p>
          )}
          {!query.isLoading && settings && !settings.configured && (
            <p className="mt-2 text-sm text-warning" role="status">
              As chaves de Web Push ainda não estão configuradas no servidor.
            </p>
          )}
          {!deviceActive && settings?.active && (
            <p className="mt-2 text-sm text-muted-foreground" role="status">
              Há notificações habilitadas em outro dispositivo desta conta.
            </p>
          )}
          {message && (
            <p className="mt-2 text-sm" role="status">
              {message}
            </p>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => void (deviceActive ? deactivate() : activate())}
        disabled={
          busy || query.isLoading || query.isError || !settings?.configured || deviceActive === null
        }
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy || query.isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : deviceActive ? (
          <BellOff className="h-4 w-4" aria-hidden="true" />
        ) : (
          <Bell className="h-4 w-4" aria-hidden="true" />
        )}
        {deviceActive ? "Desativar neste dispositivo" : "Ativar notificações"}
      </button>
    </section>
  );
}
