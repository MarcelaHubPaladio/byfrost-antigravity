import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "./ui/button";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * A global error boundary to catch fatal errors and provide a way to recover.
 * Specifically helpful for ChunkLoadErrors that persist even after one auto-reload attempt.
 */
export class GlobalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  private handleReload = () => {
    window.sessionStorage.setItem("page-has-been-force-refreshed", "false");
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      const isChunkError = 
        this.state.error?.name === "ChunkLoadError" || 
        this.state.error?.message?.includes("Failed to fetch dynamically imported module") ||
        this.state.error?.message?.includes("loading chunk");

      return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-slate-50 p-6 text-center dark:bg-slate-950">
          <div className="max-w-md space-y-6">
            <div className="flex justify-center">
              <div className="rounded-full bg-rose-100 p-4 dark:bg-rose-900/20">
                <AlertCircle className="h-12 w-12 text-rose-600" />
              </div>
            </div>
            
            <div className="space-y-2">
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
                {isChunkError ? "Nova versão disponível" : "Algo deu errado"}
              </h1>
              <p className="text-slate-500 dark:text-slate-400">
                {isChunkError 
                  ? "Uma nova atualização do sistema foi publicada. Precisamos recarregar a página para garantir que você tenha a versão mais recente."
                  : "Ocorreu um erro inesperado ao carregar esta parte do sistema."}
              </p>
            </div>

            <Button 
              onClick={this.handleReload}
              className="h-12 w-full rounded-2xl bg-blue-600 px-8 text-base font-medium text-white shadow-lg hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <RefreshCcw className="mr-2 h-5 w-5" />
              Recarregar Sistema
            </Button>

            <button 
              onClick={() => this.setState({ hasError: false, error: null })}
              className="text-sm text-slate-400 underline hover:text-slate-600 dark:hover:text-slate-300"
            >
              Tentar novamente sem recarregar
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
