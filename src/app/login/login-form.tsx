"use client";

import { useActionState } from "react";
import { LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { loginAction, type LoginState } from "./actions";

const initialState: LoginState = {};

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, pending] = useActionState(loginAction, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />

      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <div className="relative">
          <Mail className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            className="pl-11"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <div className="relative">
          <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-muted" />
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            className="pl-11"
            required
          />
        </div>
      </div>

      {state.message ? (
        <p className="rounded-lg border border-danger/30 bg-danger/10 p-3 text-sm text-red-200">
          {state.message}
        </p>
      ) : null}

      <Button type="submit" size="xl" className="w-full" disabled={pending}>
        {pending ? "Entrando..." : "Entrar no sistema"}
      </Button>
    </form>
  );
}
