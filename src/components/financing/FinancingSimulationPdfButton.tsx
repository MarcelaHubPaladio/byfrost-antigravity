import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FileDown } from "lucide-react";
import { fmtBRL, fmtPct, type BankSimResult } from "./useSimulationEngine";
import { useTenant } from "@/providers/TenantProvider";
import { supabase } from "@/lib/supabase";

interface Props {
  clientSnapshot: Record<string, any>;
  simulationParams: Record<string, any>;
  bankResults: BankSimResult[];
  referenceNumber: string;
}

function formatDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString("pt-BR");
}

export function FinancingSimulationPdfButton({
  clientSnapshot,
  simulationParams,
  bankResults,
  referenceNumber,
}: Props) {
  const { activeTenant } = useTenant();
  const [loading, setLoading] = useState(false);

  const generatePdf = async () => {
    setLoading(true);
    try {
      const { pdf, Document, Page, Text, View, StyleSheet, Image } = await import("@react-pdf/renderer");

      const tenantName = activeTenant?.name ?? "Byfrost";
      const logoPath = activeTenant?.branding_json?.logo;
      let logoUrl: string | null = null;
      if (logoPath?.bucket && logoPath?.path) {
        try { logoUrl = supabase.storage.from(logoPath.bucket).getPublicUrl(logoPath.path).data.publicUrl; }
        catch { logoUrl = null; }
      }

      const styles = StyleSheet.create({
        page: { fontFamily: "Helvetica", fontSize: 8.5, padding: 32, color: "#1e293b", backgroundColor: "#ffffff" },
        header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 },
        logo: { width: 44, height: 44, borderRadius: 8 },
        tenantName: { fontSize: 13, fontFamily: "Helvetica-Bold", color: "#334155" },
        tenantSub: { fontSize: 7.5, color: "#94a3b8", marginTop: 2 },
        refRow: { fontSize: 7.5, color: "#94a3b8", textAlign: "right" as const },
        hr: { borderBottomWidth: 1, borderBottomColor: "#e2e8f0", marginVertical: 8 },
        sectionTitle: { fontSize: 9, fontFamily: "Helvetica-Bold", color: "#1e40af", marginBottom: 5 },
        row2: { flexDirection: "row", gap: 10 },
        label: { width: "45%", color: "#64748b" },
        value: { width: "55%", fontFamily: "Helvetica-Bold", color: "#0f172a" },
        // Table
        tableHeader: { flexDirection: "row", backgroundColor: "#1e293b", borderRadius: 4, marginBottom: 2 },
        tableHeaderCell: { flex: 1, padding: 5, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#ffffff", textAlign: "center" as const },
        tableHeaderLabel: { width: 120, padding: 5, fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#94a3b8" },
        tableRow: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
        tableRowAlt: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", backgroundColor: "#f8fafc" },
        tableLabel: { width: 120, paddingVertical: 5, paddingHorizontal: 5, color: "#475569" },
        tableCell: { flex: 1, paddingVertical: 5, paddingHorizontal: 4, textAlign: "center" as const, color: "#0f172a" },
        tableCellBest: { flex: 1, paddingVertical: 5, paddingHorizontal: 4, textAlign: "center" as const, color: "#15803d", fontFamily: "Helvetica-Bold", backgroundColor: "#f0fdf4" },
        sectionBand: { flexDirection: "row", backgroundColor: "#eff6ff", marginTop: 4, marginBottom: 2, paddingVertical: 3, paddingHorizontal: 5 },
        sectionBandLabel: { fontSize: 7, fontFamily: "Helvetica-Bold", color: "#1d4ed8" },
        footer: { position: "absolute" as const, bottom: 20, left: 32, right: 32 },
        footerText: { fontSize: 6.5, color: "#94a3b8", textAlign: "center" as const },
      });

      // Find best (lowest) bank for a given getter
      const bestIdx = (getter: (r: BankSimResult) => number) => {
        if (bankResults.length < 2) return -1;
        let minV = Infinity, minI = 0;
        bankResults.forEach((r, i) => { const v = getter(r); if (v < minV) { minV = v; minI = i; } });
        return minI;
      };

      const TableRow = ({ label, getter, format, isAlt }: { label: string; getter: (r: BankSimResult) => number; format: (v: number) => string; isAlt?: boolean }) => {
        const bestI = bestIdx(getter);
        return (
          <View style={isAlt ? styles.tableRowAlt : styles.tableRow}>
            <Text style={styles.tableLabel}>{label}</Text>
            {bankResults.map((r, i) => (
              <Text key={r.bankId} style={i === bestI ? styles.tableCellBest : styles.tableCell}>
                {format(getter(r))}
              </Text>
            ))}
          </View>
        );
      };

      const MyDoc = () => (
        <Document title={`Comparativo de Financiamento ${referenceNumber}`} author={tenantName}>
          <Page size="A4" style={styles.page} orientation={bankResults.length > 3 ? "landscape" : "portrait"}>
            {/* Header */}
            <View style={styles.header}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                {logoUrl ? (
                  <Image style={styles.logo} src={logoUrl} />
                ) : (
                  <View style={{ ...styles.logo, backgroundColor: "#3b82f6", alignItems: "center", justifyContent: "center" }}>
                    <Text style={{ color: "white", fontSize: 16, fontFamily: "Helvetica-Bold" }}>{tenantName.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View>
                  <Text style={styles.tenantName}>{tenantName}</Text>
                  <Text style={styles.tenantSub}>Comparativo de Financiamento Imobiliário</Text>
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
            <View style={styles.row2}>
              <View style={{ flex: 1 }}>
                {[
                  ["Nome", clientSnapshot.name ?? "—"],
                  ["CPF", clientSnapshot.cpf ?? "—"],
                  ["Data de Nascimento", formatDate(clientSnapshot.birth_date)],
                ].map(([l, v]) => (
                  <View key={l} style={{ flexDirection: "row", marginBottom: 3 }}>
                    <Text style={styles.label}>{l}:</Text>
                    <Text style={styles.value}>{v}</Text>
                  </View>
                ))}
              </View>
              <View style={{ flex: 1 }}>
                {[
                  ["Renda Bruta", clientSnapshot.gross_income ? fmtBRL(clientSnapshot.gross_income) : "—"],
                  ["Servidor Público", clientSnapshot.is_public_servant ? "Sim" : "Não"],
                  ["FGTS (anos)", clientSnapshot.fgts_years != null ? String(clientSnapshot.fgts_years) : "—"],
                ].map(([l, v]) => (
                  <View key={l} style={{ flexDirection: "row", marginBottom: 3 }}>
                    <Text style={styles.label}>{l}:</Text>
                    <Text style={styles.value}>{v}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={{ ...styles.row2, marginTop: 3 }}>
              <View style={{ flex: 1, flexDirection: "row", marginBottom: 3 }}>
                <Text style={styles.label}>Valor do imóvel:</Text>
                <Text style={styles.value}>{fmtBRL(simulationParams.property_value ?? 0)}</Text>
              </View>
              <View style={{ flex: 1, flexDirection: "row", marginBottom: 3 }}>
                <Text style={styles.label}>FGTS utilizado:</Text>
                <Text style={styles.value}>{fmtBRL(simulationParams.fgts_amount ?? 0)}</Text>
              </View>
            </View>
            <View style={{ flexDirection: "row", marginBottom: 3 }}>
              <Text style={styles.label}>Prazo:</Text>
              <Text style={styles.value}>{simulationParams.term_months ?? 360} meses</Text>
            </View>
            <View style={styles.hr} />

            {/* Comparativo */}
            <Text style={styles.sectionTitle}>Comparativo entre Bancos</Text>

            {/* Table header */}
            <View style={styles.tableHeader}>
              <Text style={styles.tableHeaderLabel}>Indicador</Text>
              {bankResults.map((r) => (
                <Text key={r.bankId} style={styles.tableHeaderCell}>
                  {r.bankCode}{"\n"}{r.bankName}{"\n"}{fmtPct(r.effectiveRatePct)} a.a.
                </Text>
              ))}
            </View>

            {/* Conditions */}
            <View style={{ ...styles.sectionBand }}>
              <Text style={styles.sectionBandLabel}>CONDIÇÕES</Text>
            </View>
            <TableRow label="Entrada mínima" getter={(r) => r.downPayment} format={fmtBRL} />
            <TableRow label="Valor financiado" getter={(r) => r.loanValue} format={fmtBRL} isAlt />
            <TableRow label="TAC" getter={(r) => r.tac} format={fmtBRL} />
            <TableRow label="CET estimado" getter={(r) => r.cetEstimatePct} format={(v) => `${fmtPct(v)} a.a.`} isAlt />

            {/* SAC */}
            <View style={{ ...styles.sectionBand, backgroundColor: "#eff6ff", marginTop: 4 }}>
              <Text style={{ ...styles.sectionBandLabel, color: "#1d4ed8" }}>SAC — AMORTIZAÇÃO CONSTANTE</Text>
            </View>
            <TableRow label="1ª Parcela" getter={(r) => r.sac.firstPayment} format={fmtBRL} />
            <TableRow label="Última Parcela" getter={(r) => r.sac.lastPayment} format={fmtBRL} isAlt />
            <TableRow label="Total pago (SAC)" getter={(r) => r.sac.totalPaid} format={fmtBRL} />

            {/* Price */}
            <View style={{ ...styles.sectionBand, backgroundColor: "#f0fdf4", marginTop: 4 }}>
              <Text style={{ ...styles.sectionBandLabel, color: "#166534" }}>PRICE — PARCELAS FIXAS</Text>
            </View>
            <TableRow label="Parcela fixa" getter={(r) => r.price.monthlyPayment} format={fmtBRL} />
            <TableRow label="Total pago (Price)" getter={(r) => r.price.totalPaid} format={fmtBRL} isAlt />
            <TableRow label="Renda mín. necessária" getter={(r) => r.minIncomeRequired} format={fmtBRL} />

            {/* Footer */}
            <View style={styles.footer}>
              <View style={{ borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 5 }}>
                <Text style={styles.footerText}>
                  Células em verde indicam o menor valor entre os bancos comparados. Valores gerados em {new Date().toLocaleDateString("pt-BR")} às {new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} por {tenantName} via Byfrost.
                </Text>
                <Text style={{ ...styles.footerText, marginTop: 2 }}>
                  Simulação com fins ilustrativos. Taxas, prazos e valores sujeitos à análise de crédito e condições vigentes de cada banco. Não constitui proposta de crédito.
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
      a.download = `comparativo-financiamento-${referenceNumber}.pdf`;
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
    <Button variant="outline" onClick={generatePdf} disabled={loading} className="h-9 rounded-2xl text-xs">
      <FileDown className="mr-1.5 h-3.5 w-3.5" />
      {loading ? "Gerando PDF…" : "Exportar comparativo PDF"}
    </Button>
  );
}
