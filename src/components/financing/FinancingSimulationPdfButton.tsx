import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { fmtBRL, fmtPct, type SimulationResult } from "./useSimulationEngine";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";

interface Props {
  clientSnapshot: Record<string, any>;
  simulationParams: Record<string, any>;
  simResult: SimulationResult;
  bankName: string;
  referenceNumber: string;
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("pt-BR");
}

export function FinancingSimulationPdfButton({
  clientSnapshot,
  simulationParams,
  simResult,
  bankName,
  referenceNumber,
}: Props) {
  const { activeTenant } = useTenant();
  const [loading, setLoading] = useState(false);

  const generatePdf = async () => {
    setLoading(true);
    try {
      // Dynamic import to keep bundle lean
      const { pdf, Document, Page, Text, View, StyleSheet, Font, Image } = await import("@react-pdf/renderer");

      const tenantName = activeTenant?.name ?? "Byfrost";
      const logoPath = activeTenant?.branding_json?.logo;
      let logoUrl: string | null = null;
      if (logoPath?.bucket && logoPath?.path) {
        try {
          logoUrl = supabase.storage.from(logoPath.bucket).getPublicUrl(logoPath.path).data.publicUrl;
        } catch {
          logoUrl = null;
        }
      }

      const styles = StyleSheet.create({
        page: { fontFamily: "Helvetica", fontSize: 9, padding: 36, color: "#1e293b", backgroundColor: "#ffffff" },
        header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
        logo: { width: 48, height: 48, borderRadius: 8 },
        tenantName: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#334155" },
        tenantSub: { fontSize: 8, color: "#94a3b8", marginTop: 2 },
        refRow: { fontSize: 8, color: "#94a3b8", textAlign: "right" as const },
        hr: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 8 },
        sectionTitle: { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#1e40af", marginBottom: 6 },
        row: { flexDirection: "row", marginBottom: 4 },
        label: { width: "45%", color: "#64748b" },
        value: { width: "55%", fontFamily: "Helvetica-Bold", color: "#0f172a" },
        grid2: { flexDirection: "row", gap: 12 },
        card: { flex: 1, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 8, padding: 10, marginBottom: 8 },
        cardTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#334155", marginBottom: 6 },
        valueHighlight: { fontSize: 14, fontFamily: "Helvetica-Bold", color: "#1d4ed8", marginBottom: 2 },
        cardRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 2 },
        cardLabel: { color: "#64748b" },
        cardValue: { fontFamily: "Helvetica-Bold", color: "#1e293b" },
        footer: { position: "absolute" as const, bottom: 24, left: 36, right: 36 },
        footerText: { fontSize: 7, color: "#94a3b8", textAlign: "center" as const },
        badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, fontSize: 7, fontFamily: "Helvetica-Bold" },
        warningBox: { backgroundColor: "#fef3c7", borderWidth: 1, borderColor: "#fcd34d", borderRadius: 6, padding: 8, marginBottom: 8 },
        infoBox: { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 6, padding: 8, marginBottom: 8 },
      });

      const formatMoney = (v: number) =>
        new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

      const MyDoc = () => (
        <Document title={`Simulação ${referenceNumber}`} author={tenantName}>
          <Page size="A4" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {logoUrl ? (
                  <Image style={styles.logo} src={logoUrl} />
                ) : (
                  <View style={{ ...styles.logo, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 18, fontFamily: "Helvetica-Bold" }}>
                      {tenantName.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
                <View>
                  <Text style={styles.tenantName}>{tenantName}</Text>
                  <Text style={styles.tenantSub}>Simulação de Financiamento Imobiliário</Text>
                </View>
              </View>
              <View>
                <Text style={styles.refRow}>Ref: {referenceNumber}</Text>
                <Text style={styles.refRow}>Data: {new Date().toLocaleDateString("pt-BR")}</Text>
              </View>
            </View>
            <View style={styles.hr} />

            {/* Cliente */}
            <Text style={styles.sectionTitle}>Dados do Cliente</Text>
            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                {[
                  ["Nome", clientSnapshot.name ?? "—"],
                  ["CPF", clientSnapshot.cpf ?? "—"],
                  ["Data de Nascimento", formatDate(clientSnapshot.birth_date)],
                  ["Estado Civil", clientSnapshot.marital_status ?? "—"],
                ].map(([l, v]) => (
                  <View key={l} style={styles.row}>
                    <Text style={styles.label}>{l}:</Text>
                    <Text style={styles.value}>{v}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                {[
                  ["Renda Bruta", clientSnapshot.gross_income ? formatMoney(clientSnapshot.gross_income) : "—"],
                  ["Comprometimento", clientSnapshot.income_commitment_pct != null ? `${clientSnapshot.income_commitment_pct}%` : "—"],
                  ["Anos de FGTS", clientSnapshot.fgts_years != null ? String(clientSnapshot.fgts_years) : "—"],
                  ["Servidor Público", clientSnapshot.is_public_servant ? "Sim" : "Não"],
                ].map(([l, v]) => (
                  <View key={l} style={styles.row}>
                    <Text style={styles.label}>{l}:</Text>
                    <Text style={styles.value}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.hr} />

            {/* Imóvel e condições */}
            <Text style={styles.sectionTitle}>Condições do Financiamento</Text>
            <View style={styles.grid2}>
              <View style={{ flex: 1 }}>
                {[
                  ["Banco", bankName],
                  ["Valor do Imóvel", formatMoney(simulationParams.property_value)],
                  ["Entrada", formatMoney(simulationParams.down_payment)],
                  ["FGTS Aplicado", formatMoney(simulationParams.fgts_amount || 0)],
                ].map(([l, v]) => (
                  <View key={l} style={styles.row}>
                    <Text style={styles.label}>{l}:</Text>
                    <Text style={styles.value}>{v}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                {[
                  ["Valor Financiado", formatMoney(simResult.loanValue)],
                  ["Prazo", `${simulationParams.term_months} meses`],
                  ["Taxa Efetiva", `${fmtPct(simulationParams.effective_rate_pct)} a.a.`],
                  ["CET Estimado", `${fmtPct(simResult.cetEstimatePct)} a.a.`],
                ].map(([l, v]) => (
                  <View key={l} style={styles.row}>
                    <Text style={styles.label}>{l}:</Text>
                    <Text style={styles.value}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.hr} />

            {/* Resultados */}
            <Text style={styles.sectionTitle}>Resultados da Simulação</Text>
            <View style={styles.grid2}>
              {/* SAC */}
              <View style={{ ...styles.card, borderColor: "#bfdbfe", backgroundColor: "#eff6ff" }}>
                <Text style={{ ...styles.cardTitle, color: "#1d4ed8" }}>Sistema SAC — Parcelas Decrescentes</Text>
                <Text style={{ ...styles.valueHighlight, color: "#1d4ed8" }}>{formatMoney(simResult.sac.firstPayment)}</Text>
                <Text style={{ fontSize: 7, color: "#6b7280", marginBottom: 8 }}>1ª parcela (maior)</Text>
                {[
                  ["Última parcela", formatMoney(simResult.sac.lastPayment)],
                  ["Amortização mensal", formatMoney(simResult.sac.monthlyAmortization)],
                  ["Seguro MIP+DFI (1º mês)", formatMoney(simResult.sac.monthlyInsurance)],
                  ["Juros totais", formatMoney(simResult.sac.totalInterest)],
                  ["Total pago", formatMoney(simResult.sac.totalPaid)],
                ].map(([l, v]) => (
                  <View key={l} style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{l}</Text>
                    <Text style={styles.cardValue}>{v}</Text>
                  </View>
                ))}
              </View>

              {/* Price */}
              <View style={{ ...styles.card, borderColor: "#bbf7d0", backgroundColor: "#f0fdf4" }}>
                <Text style={{ ...styles.cardTitle, color: "#166534" }}>Tabela Price — Parcelas Fixas</Text>
                <Text style={{ ...styles.valueHighlight, color: "#15803d" }}>{formatMoney(simResult.price.monthlyPayment)}</Text>
                <Text style={{ fontSize: 7, color: "#6b7280", marginBottom: 8 }}>Parcela fixa (s/ seguro)</Text>
                {[
                  ["Seguro MIP+DFI (1º mês)", formatMoney(simResult.price.monthlyInsurance)],
                  ["Parcela total (c/ seguro)", formatMoney(simResult.price.monthlyPayment + simResult.price.monthlyInsurance)],
                  ["Juros totais", formatMoney(simResult.price.totalInterest)],
                  ["Total pago", formatMoney(simResult.price.totalPaid)],
                ].map(([l, v]) => (
                  <View key={l} style={styles.cardRow}>
                    <Text style={styles.cardLabel}>{l}</Text>
                    <Text style={styles.cardValue}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Renda mínima */}
            <View style={styles.infoBox}>
              <Text style={{ fontFamily: "Helvetica-Bold", color: "#1e40af", marginBottom: 3 }}>
                Renda Mínima Necessária (Tabela Price): {formatMoney(simResult.minIncomeRequired)}
              </Text>
              <Text style={{ color: "#475569" }}>
                TAC (Tarifa de Avaliação de Crédito): {formatMoney(simResult.tac)}
              </Text>
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <View style={{ borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 6 }}>
                <Text style={styles.footerText}>
                  Simulação gerada em {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} por {tenantName} via Byfrost.
                </Text>
                <Text style={{ ...styles.footerText, marginTop: 2 }}>
                  As taxas, prazos e valores apresentados têm caráter exclusivamente informativo e estão sujeitos à análise de crédito, aprovação e
                  condições vigentes do banco. Esta simulação não constitui proposta de crédito ou contrato.
                </Text>
              </View>
            </View>
          </Page>
        </Document>
      );

      const blob = await pdf(<MyDoc />).toBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `simulacao-financiamento-${referenceNumber}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      console.error("PDF generation error:", e);
      import("@/utils/toast").then(({ showError }) => showError("Falha ao gerar PDF: " + (e?.message ?? "erro")));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      onClick={generatePdf}
      disabled={loading}
      className="h-9 rounded-2xl text-xs"
    >
      <FileDown className="mr-1.5 h-3.5 w-3.5" />
      {loading ? "Gerando PDF…" : "Exportar PDF"}
    </Button>
  );
}
