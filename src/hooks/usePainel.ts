import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { carregarPainel } from "@/lib/sorteio.functions";

export function usePainel() {
  const fn = useServerFn(carregarPainel);
  const navigate = useNavigate();

  // Sem token no cliente: a sessão viaja no cookie httpOnly. Se o servidor
  // disser que não há sessão, é porque expirou ou foi revogada.
  const query = useQuery({
    queryKey: ["painel"],
    queryFn: () => fn({}),
  });

  useEffect(() => {
    if (query.data && query.data.ok === false) navigate({ to: "/" });
  }, [query.data, navigate]);

  return query;
}
