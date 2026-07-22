export const COMPANY_NAME = "Jakub Máče";
export const COMPANY_ICO = "17312973";
export const COMPANY_ACCOUNT = "8149273003/5500 (Raiffeisenbank)";
export const COMPANY_IBAN = "CZ2455000000008149273003";
export const COMPANY_IBAN_SPACED = "CZ24 5500 0000 0081 4927 3003";

export const FEE_BALENE = 59;
export const FEE_POSTOVNE = 99;

export function buildSpdQr(iban: string, amount: number, invoiceNumber: string, vs: string): string {
  return `SPD*1.0*ACC:${iban}*AM:${amount.toFixed(2)}*CC:CZK*MSG:${invoiceNumber}*X-VS:${vs}`;
}
