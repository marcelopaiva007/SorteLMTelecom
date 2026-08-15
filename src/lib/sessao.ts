// Formatação das telas do cliente.
//
// O token de sessão não mora mais aqui: vive num cookie httpOnly, que o
// navegador reenvia sozinho e o JavaScript da página não consegue ler.
// Ver src/lib/sorteio.server.ts.

export function formatarNumero(n: number, digitos = 4) {
  return String(n).padStart(digitos, "0");
}

export function formatarDocumento(v: string) {
  const d = v.replace(/\D/g, "").slice(0, 14);
  if (d.length <= 11) {
    return d
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d)/, "$1.$2")
      .replace(/(\d{3})(\d{1,2})$/, "$1-$2");
  }
  return d
    .replace(/(\d{2})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1/$2")
    .replace(/(\d{4})(\d{1,2})$/, "$1-$2");
}

export function dataHoraBR(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function dataBR(iso: string) {
  return new Date(
    iso + (iso.length === 10 ? "T12:00:00" : ""),
  ).toLocaleDateString("pt-BR");
}
