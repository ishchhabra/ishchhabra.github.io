import { Settings, X } from "lucide-react";
import { useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

export interface LocalAIConfig {
  baseUrl: string;
  model: string;
}

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: LocalAIConfig;
  onConfigChange: (config: LocalAIConfig) => void;
}

export function SettingsModal({ open, onOpenChange, config, onConfigChange }: SettingsModalProps) {
  const [localConfig, setLocalConfig] = useState<LocalAIConfig>(config);

  if (!open) return null;

  return (
    <>
      <div 
        className="fixed inset-0 z-[10002] bg-black/20 backdrop-blur-sm transition-opacity pointer-events-auto" 
        onClick={() => onOpenChange(false)} 
      />
      <div 
        className="fixed left-[50%] top-[50%] z-[10003] w-full max-w-sm translate-x-[-50%] translate-y-[-50%] rounded-xl border border-zinc-200 bg-white/70 p-6 shadow-2xl backdrop-blur-2xl dark:border-zinc-800 dark:bg-zinc-950/70 pointer-events-auto"
      >
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Settings className="w-4 h-4 text-emerald-500" />
            Local Edge Settings
          </h2>
          <button 
            onClick={() => onOpenChange(false)} 
            className="text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Ollama API URL</label>
            <Input 
              value={localConfig.baseUrl} 
              onChange={e => setLocalConfig(c => ({ ...c, baseUrl: e.target.value }))}
              placeholder="http://localhost:11434"
              className="bg-white/50 dark:bg-zinc-900/50 dark:border-zinc-800"
            />
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Model Name</label>
            <Input 
              value={localConfig.model} 
              onChange={e => setLocalConfig(c => ({ ...c, model: e.target.value }))}
              placeholder="llama3.2"
              className="bg-white/50 dark:bg-zinc-900/50 dark:border-zinc-800"
            />
            <p className="text-[10px] text-zinc-500">
              Run <code className="px-1 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800">ollama list</code> to see available models.
            </p>
          </div>
        </div>

        <div className="mt-8 flex justify-end gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={() => onOpenChange(false)}
            className="text-zinc-500"
          >
            Cancel
          </Button>
          <Button 
            size="sm" 
            onClick={() => {
              onConfigChange(localConfig);
              onOpenChange(false);
            }}
            className="bg-emerald-500 hover:bg-emerald-600 text-white border-0"
          >
            Save Settings
          </Button>
        </div>
      </div>
    </>
  );
}
