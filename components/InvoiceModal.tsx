"use client";

import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type { ProdejFull } from "@/lib/data";
import { generateInvoiceNumber, setProdejInvoice } from "@/lib/data";
import { formatKc, formatDateCZ } from "@/lib/format";
import { COMPANY_NAME, COMPANY_ICO, COMPANY_ACCOUNT, COMPANY_IBAN, COMPANY_IBAN_SPACED, buildSpdQr } from "@/lib/invoice";

export default function InvoiceModal({
  prodej,
  onClose,
  onUpdated,
}: {
  prodej: ProdejFull;
  onClose: () => void;
  onUpdated: (updated: Partial<ProdejFull>) => void;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState(prodej.invoice_number);
  const [invoiceVs, setInvoiceVs] = useState(prodej.invoice_vs);
  const [issueDate, setIssueDate] = useState(prodej.invoice_date_issue);
  const [dueDate, setDueDate] = useState(prodej.invoice_date_due);
  const [ready, setReady] = useState(!!prodej.invoice_number);

  useEffect(() => {
    if (ready) return;
    (async () => {
      const { number, vs } = await generateInvoiceNumber();
      const issue = new Date();
      const due = new Date();
      due.setDate(due.getDate() + 14);
      const issueIso = issue.toISOString().slice(0, 10);
      const dueIso = due.toISOString().slice(0, 10);

      await setProdejInvoice(prodej.id, {
        invoice_number: number,
        invoice_vs: vs,
        invoice_date_issue: issueIso,
        invoice_date_due: dueIso,
      });

      setInvoiceNumber(number);
      setInvoiceVs(vs);
      setIssueDate(issueIso);
      setDueDate(dueIso);
      onUpdated({ invoice_number: number, invoice_vs: vs, invoice_date_issue: issueIso, invoice_date_due: dueIso });
      setReady(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready || !invoiceNumber || !invoiceVs) {
    return (
      <div className="invoice-overlay">
        <div className="invoice-paper">
          <div className="entry-form-title">Vytvářím fakturu…</div>
        </div>
      </div>
    );
  }

  const doplnkyTotal = prodej.doplnky.reduce((s, d) => s + d.cena, 0);
  const total = prodej.cena + doplnkyTotal;
  const spd = buildSpdQr(COMPANY_IBAN, total, invoiceNumber, invoiceVs);

  return (
    <div className="invoice-overlay">
      <div className="invoice-paper">
        <button className="invoice-close" onClick={onClose}>
          ✕
        </button>

        <div className="invoice-title">Faktura — daňový doklad</div>
        <div className="invoice-number">{invoiceNumber}</div>

        <div className="invoice-grid">
          <div>
            <div className="invoice-col-label">Dodavatel</div>
            <div className="invoice-col-name">{COMPANY_NAME}</div>
            <div className="invoice-col-line">
              IČO: {COMPANY_ICO}
              <br />
              Číslo účtu: {COMPANY_ACCOUNT}
              <br />
              IBAN: {COMPANY_IBAN_SPACED}
            </div>
          </div>
          <div>
            <div className="invoice-col-label">Odběratel</div>
            <div className="invoice-col-name">{prodej.klient_jmeno}</div>
            <div className="invoice-col-line">
              {prodej.klient_adresa || "adresa neuvedena"}
              <br />
              {prodej.klient_telefon || "—"} · {prodej.klient_email || "—"}
            </div>
          </div>
        </div>

        <div className="invoice-col-line" style={{ marginBottom: 10 }}>
          Datum vystavení:{" "}
          <b style={{ fontFamily: "var(--mono)", color: "#000" }}>{issueDate ? formatDateCZ(new Date(issueDate)) : "—"}</b> · Datum
          splatnosti: <b style={{ fontFamily: "var(--mono)", color: "#000" }}>{dueDate ? formatDateCZ(new Date(dueDate)) : "—"}</b> ·
          Variabilní symbol: <b style={{ fontFamily: "var(--mono)", color: "#000" }}>{invoiceVs}</b>
        </div>

        <table className="invoice-table">
          <thead>
            <tr>
              <th>Položka</th>
              <th style={{ textAlign: "right" }}>Cena</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{prodej.polozka}</td>
              <td className="num">{formatKc(prodej.cena)}</td>
            </tr>
            {prodej.doplnky.map((d) => (
              <tr key={d.id}>
                <td>
                  {d.polozka} × {d.pocet_ks} ks
                </td>
                <td className="num">{formatKc(d.cena)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="invoice-total-row">
          <span className="label">Celkem k úhradě</span>
          <span className="value">{formatKc(total)}</span>
        </div>

        <div className="invoice-payment">
          <div className="invoice-payment-details">
            Platbu prosím proveďte na účet <b>{COMPANY_IBAN_SPACED}</b>
            <br />s variabilním symbolem <b>{invoiceVs}</b>
            <br />v celkové výši <b>{formatKc(total)}</b>
          </div>
          <div className="invoice-qr-box">
            <QRCodeSVG value={spd} size={120} />
            <div className="qr-caption">QR platba</div>
          </div>
        </div>

        <div className="invoice-actions">
          <button className="invoice-btn-print" onClick={() => window.print()}>
            Vytisknout / Uložit PDF
          </button>
        </div>
      </div>
    </div>
  );
}
