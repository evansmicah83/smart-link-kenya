declare module "https://deno.land/std@0.168.0/http/server.ts" {
  export function serve(
    handler: (req: Request) => Promise<Response> | Response
  ): Promise<void>;
}

declare module "https://esm.sh/@supabase/supabase-js@2" {
  export interface SupabaseClient {
    from(table: string): any;
    functions: {
      invoke(name: string, options?: unknown): any;
    };
    auth?: any;
    storage?: any;
  }

  export function createClient(url: string, key: string): SupabaseClient;
}

declare namespace Deno {
  const env: {
    get(key: string): string | undefined;
  };
  function connect(options: {
    hostname: string;
    port: number;
    transport: "tcp" | "udp";
  }): Promise<
    Deno.Conn & {
      close(): void;
      read(p: Uint8Array): Promise<number | null>;
      write(p: Uint8Array): Promise<number>;
    }
  >;
}
