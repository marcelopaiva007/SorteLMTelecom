import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { carregarPainel } from "@/lib/sorteio.functions";
import { lerToken } from "@/lib/sessao";

export function usePainel() {
  const fn = useServerFn(carregarPainel);
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    const t = lerToken();
    setToken(t);
    setPronto(true);
    if (!t) navigate({ to: "/" });
  }, [navigate]);

  const query = useQuery({
    queryKey: ["painel", token],
    enabled: !!token,
    queryFn: () => fn({ data: { token: token! } }),
  });

  useEffect(() => {
    if (query.data && query.data.ok === false) navigate({ to: "/" });
  }, [query.data, navigate]);

  return { ...query, token, pronto };
}
