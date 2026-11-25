import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Download, FileText, Loader2, Search } from "lucide-react";
import { adminFinanceReport } from "@/lib/arena.functions";

type Report = Awaited<ReturnType<typeof adminFinanceReport>>;
type Period = "day" | "week" | "month";
const TIME_ZONE = "America/Porto_Velho";
const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    timeZone: TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
const paymentMethodLabel = (method: string) =>
  ({ pix: "Pix", card_onsite: "Cartão presencial", cash_onsite: "Dinheiro", onsite: "Presencial" })[
    method
  ] ?? method;
const providerLabel = (provider: string) =>
  provider === "infinitepay" ? "InfinitePay" : "Presencial (caixa)";
const unitLabel = (unit: string) =>
  unit === "unidade-1"
    ? "Unidade 1 · Cuniã"
    : unit === "unidade-2"
      ? "Unidade 2 · Pinheiro Machado"
      : unit;

function rangeLabel(report: Report) {
  const lastDay = new Date(`${report.endDateExclusive}T00:00:00Z`);
  lastDay.setUTCDate(lastDay.getUTCDate() - 1);
  const end = lastDay.toISOString().slice(0, 10);
  return report.startDate === end
    ? new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", dateStyle: "long" }).format(
        new Date(`${report.startDate}T12:00:00Z`),
      )
    : `${report.startDate.split("-").reverse().join("/")} a ${end.split("-").reverse().join("/")}`;
}

export function AdminFinanceReport() {
  const runReport = useServerFn(adminFinanceReport);
  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const today = `${todayParts.find((part) => part.type === "year")?.value}-${todayParts.find((part) => part.type === "month")?.value}-${todayParts.find((part) => part.type === "day")?.value}`;
  const [period, setPeriod] = useState<Period>("day");
  const [date, setDate] = useState(today);
  const [report, setReport] = useState<Report | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  async function generate() {
    setBusy(true);
    setError(null);
    setReport(null);
    try {
      setReport(await runReport({ data: { period, date } }));
    } catch {
      setError("Não foi possível carregar o relatório. Verifique seu acesso e tente novamente.");
    } finally {
      setBusy(false);
    }
  }

  async function downloadPdf() {
    if (!report) return;
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      const margin = 14;
      let y = 18;
      const addPageIfNeeded = (needed = 8) => {
        if (y + needed <= 195) return;
        doc.addPage();
        y = 16;
      };
      doc.setFillColor(20, 45, 39);
      doc.rect(0, 0, pageWidth, 39, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(17);
      doc.text("ARENA LESTE  /  RELATÓRIO FINANCEIRO", margin, y);
      y += 9;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(
        `${period === "day" ? "Dia" : period === "week" ? "Semana" : "Mês"}: ${rangeLabel(report)} · fuso ${TIME_ZONE}`,
        margin,
        y,
      );
      y += 19;
      doc.setTextColor(20, 45, 39);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text(`TOTAL RECEBIDO  ${money(report.totalCents)}`, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(`InfinitePay  ${money(report.subtotals.infinitepayCents)}`, 112, y);
      doc.text(`Presencial (caixa)  ${money(report.subtotals.onsiteCents)}`, 190, y);
      y += 11;

      const columns = [
        { title: "Pagamento", x: margin, width: 35 },
        { title: "Cliente", x: 51, width: 43 },
        { title: "Reserva (data / hora)", x: 96, width: 52 },
        { title: "Quadra / unidade", x: 151, width: 54 },
        { title: "Método / origem", x: 208, width: 39 },
        { title: "Valor", x: 252, width: 30 },
      ];
      const drawHeader = () => {
        doc.setFillColor(236, 241, 237);
        doc.rect(margin, y - 5, pageWidth - margin * 2, 9, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(35, 52, 45);
        columns.forEach((column) => doc.text(column.title, column.x, y));
        y += 7;
      };
      drawHeader();
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      doc.setTextColor(30, 38, 34);
      for (const payment of report.payments) {
        const reservationLines = payment.bookings.map(
          (booking) =>
            `${booking.date.split("-").reverse().join("/")} ${booking.start}–${booking.end}`,
        );
        const courtLines = payment.bookings.map(
          (booking) => `${booking.court} · ${unitLabel(booking.unit)}`,
        );
        const paidAt = dateTime(payment.paidAt);
        const values = [
          [paidAt],
          [payment.customerName],
          reservationLines,
          courtLines,
          [paymentMethodLabel(payment.method), providerLabel(payment.provider)],
          [money(payment.amountCents)],
        ];
        const wrappedValues = values.map((column, index) =>
          column.flatMap((line) =>
            doc.splitTextToSize(String(line), (columns[index]?.width ?? 30) - 2),
          ),
        );
        const maxLines = Math.max(1, ...wrappedValues.map((column) => column.length));
        const rowHeight = maxLines * 4.3 + 3;
        addPageIfNeeded(rowHeight);
        if (y === 16) drawHeader();
        columns.forEach((column, index) => {
          const content = wrappedValues[index] ?? [];
          content.forEach((line, lineIndex) => {
            doc.text(line, column.x, y + lineIndex * 4.2);
          });
        });
        y += rowHeight;
        doc.setDrawColor(225, 230, 226);
        doc.line(margin, y - 1, pageWidth - margin, y - 1);
      }
      if (!report.payments.length) {
        doc.setFontSize(9);
        doc.text("Nenhum pagamento confirmado neste período.", margin, y + 4);
      }
      const pageCount = doc.getNumberOfPages();
      for (let page = 1; page <= pageCount; page += 1) {
        doc.setPage(page);
        doc.setFontSize(7);
        doc.setTextColor(110, 120, 114);
        doc.text("Documento restrito · dados de telefone não incluídos", margin, 202);
        doc.text(`${page}/${pageCount}`, pageWidth - margin, 202, { align: "right" });
      }
      doc.save(`arena-leste-financeiro-${report.startDate}-${report.endDateExclusive}.pdf`);
    } catch {
      setError("Não foi possível gerar o PDF neste dispositivo.");
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="admin-chart-card" aria-labelledby="finance-report-title">
      <header className="admin-chart-heading">
        <div>
          <p className="admin-chart-eyebrow">Receita confirmada</p>
          <h2 id="finance-report-title">Relatório financeiro</h2>
        </div>
        <FileText aria-hidden="true" />
      </header>
      <p className="admin-chart-caption">
        Considera a data e hora do pagamento confirmado, no fuso de Porto Velho. Bloqueios e
        pagamentos pendentes não entram.
      </p>
      <div className="flex flex-wrap items-end gap-3 py-4">
        <label className="flex flex-col gap-1 text-sm">
          Período
          <select
            value={period}
            onChange={(event) => {
              setPeriod(event.target.value as Period);
              setReport(null);
            }}
            className="rounded-md border px-3 py-2"
          >
            <option value="day">Dia</option>
            <option value="week">Semana (segunda a domingo)</option>
            <option value="month">Mês</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Data de referência
          <input
            type="date"
            value={date}
            onChange={(event) => {
              setDate(event.target.value);
              setReport(null);
            }}
            className="rounded-md border px-3 py-2"
          />
        </label>
        <button
          type="button"
          onClick={generate}
          disabled={busy || !date}
          className="inline-flex items-center gap-2 rounded-md bg-emerald-900 px-4 py-2 text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
          Gerar relatório
        </button>
        {report && (
          <button
            type="button"
            onClick={downloadPdf}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-md border px-4 py-2 disabled:opacity-60"
          >
            {exporting ? <Loader2 className="animate-spin" size={16} /> : <Download size={16} />}
            Baixar PDF
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <SummaryCard label="Total recebido" value={money(report.totalCents)} />
            <SummaryCard label="InfinitePay" value={money(report.subtotals.infinitepayCents)} />
            <SummaryCard label="Presencial (caixa)" value={money(report.subtotals.onsiteCents)} />
          </div>
          <p className="py-3 text-sm text-slate-600">
            {rangeLabel(report)} · {report.payments.length} pagamento(s) · {TIME_ZONE}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] border-collapse text-left text-sm">
              <thead>
                <tr className="border-b text-xs uppercase text-slate-500">
                  <th className="p-2">Pagamento</th>
                  <th className="p-2">Cliente</th>
                  <th className="p-2">Reserva</th>
                  <th className="p-2">Quadra / unidade</th>
                  <th className="p-2">Método / origem</th>
                  <th className="p-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {report.payments.map((payment, index) => (
                  <tr
                    className="border-b align-top"
                    key={`${payment.provider}-${payment.paidAt}-${index}`}
                  >
                    <td className="whitespace-nowrap p-2">{dateTime(payment.paidAt)}</td>
                    <td className="p-2">{payment.customerName}</td>
                    <td className="p-2">
                      {payment.bookings.map((booking) => (
                        <div key={`${booking.date}-${booking.start}-${booking.court}`}>
                          {booking.date.split("-").reverse().join("/")} · {booking.start}–
                          {booking.end}
                        </div>
                      ))}
                    </td>
                    <td className="p-2">
                      {payment.bookings.map((booking) => (
                        <div key={`${booking.date}-${booking.start}-${booking.court}`}>
                          {booking.court} · {unitLabel(booking.unit)}
                        </div>
                      ))}
                    </td>
                    <td className="p-2">
                      {paymentMethodLabel(payment.method)}
                      <br />
                      <span className="text-xs text-slate-500">
                        {providerLabel(payment.provider)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap p-2 text-right font-semibold">
                      {money(payment.amountCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!report.payments.length && (
              <p className="p-4 text-sm text-slate-600">
                Nenhum pagamento confirmado neste período.
              </p>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-lg border bg-white p-4">
      <p className="text-sm text-slate-600">{label}</p>
      <p className="pt-1 text-xl font-semibold text-slate-900">{value}</p>
    </article>
  );
}
