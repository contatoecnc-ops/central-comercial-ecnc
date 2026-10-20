import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone();
    url.pathname = path;
    url.search = "";
    const res = NextResponse.redirect(url);
    response.cookies.getAll().forEach((c) => res.cookies.set(c));
    return res;
  };

  if (!user) {
    return pathname === "/login" ? response : redirectTo("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, active")
    .eq("id", user.id)
    .single();

  if (!profile || !profile.active) {
    await supabase.auth.signOut();
    return pathname === "/login" ? response : redirectTo("/login");
  }

  const home = `/${profile.role}/dashboard`;
  if (pathname === "/login") return redirectTo(home);
  // Marketing usa só o próprio painel e as telas compartilhadas de catálogo e manuais.
  const marketingShared =
    /^\/admin\/(catalogo|manuais|conteudo)(\/|$)/.test(pathname) && !/^\/admin\/conteudo\/solicitacoes(\/|$)/.test(pathname);
  if (pathname.startsWith("/admin") && !(profile.role === "admin" || (profile.role === "marketing" && marketingShared))) {
    return redirectTo(home);
  }
  if (pathname.startsWith("/vendedor") && profile.role !== "vendedor") return redirectTo(home);
  if (pathname.startsWith("/marketing") && profile.role !== "marketing") return redirectTo(home);

  return response;
}

// /api/* fica fora do matcher: /api/analise/resumo faz a própria autenticação (Bearer ou sessão admin).
export const config = {
  matcher: ["/login", "/admin/:path*", "/vendedor/:path*", "/marketing/:path*"],
};
