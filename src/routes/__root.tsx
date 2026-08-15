import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="num text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl">Página não encontrada</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          O endereço que você abriu não existe ou mudou de lugar.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="titulo inline-flex items-center justify-center border border-primary bg-primary px-4 py-3 text-sm tracking-widest text-primary-foreground"
          >
            Ir para o início
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl">Esta página não carregou</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Alguma coisa falhou do nosso lado. Tente de novo ou volte ao início.
          Seus números continuam guardados.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="titulo inline-flex items-center justify-center border border-primary bg-primary px-4 py-3 text-sm tracking-widest text-primary-foreground"
          >
            Tentar de novo
          </button>
          <a
            href="/"
            className="titulo inline-flex items-center justify-center border border-border bg-background px-4 py-3 text-sm tracking-widest text-foreground"
          >
            Ir para o início
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1" },
        { title: "Sorteio LM — L&M Telecom" },
        {
          name: "description",
          content:
            "Sistema de sorteios da L&M Telecom: você ganha números por ser bom cliente e escolhe quais quer. Participar não custa nada.",
        },
        { name: "author", content: "L&M Telecom" },
        { property: "og:type", content: "website" },
        { property: "og:locale", content: "pt_BR" },
        // A campanha vive de link compartilhado no WhatsApp: sem imagem, o
        // preview do link fica vazio e o link parece suspeito.
        { property: "og:image", content: "/marca/simbolo.png" },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:image", content: "/marca/simbolo.png" },
        { name: "theme-color", content: "#1368C0" },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        { rel: "icon", href: "/favicon.png", type: "image/png" },
      ],
    }),
    shellComponent: RootShell,
    component: RootComponent,
    notFoundComponent: NotFoundComponent,
    errorComponent: ErrorComponent,
  },
);

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
