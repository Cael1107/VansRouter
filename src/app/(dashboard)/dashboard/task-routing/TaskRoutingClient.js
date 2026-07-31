"use client";

import { useState, useEffect, useCallback } from "react";
import { Card, Button, Input, Toggle } from "@/shared/components";

/**
 * TaskRouting page - UI for configuring task routing (planning/execution models)
 */
export default function TaskRoutingClient() {
  const [enabled, setEnabled] = useState(false);
  const [planningModels, setPlanningModels] = useState([]);
  const [executionModels, setExecutionModels] = useState([]);
  const [autoRouteByTools, setAutoRouteByTools] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [allModels, setAllModels] = useState([]);
  const [newPlanning, setNewPlanning] = useState("");
  const [newExecution, setNewExecution] = useState("");

  useEffect(() => {
    fetchTaskRouting();
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      const models = data.models || data || [];
      setAllModels(Array.isArray(models) ? models.map((m) => m.id || m.name || m) : []);
    } catch (e) {
      console.error("Failed to fetch models:", e);
    }
  };

  const fetchTaskRouting = async () => {
    try {
      const res = await fetch("/api/task-routing");
      const data = await res.json();
      const tr = data.taskRouting || {};
      setEnabled(!!tr.enabled);
      setPlanningModels(Array.isArray(tr.planning) ? tr.planning : []);
      setExecutionModels(Array.isArray(tr.execution) ? tr.execution : []);
      setAutoRouteByTools(tr.autoRouteByTools !== false);
    } catch (e) {
      console.error("Failed to fetch task routing:", e);
    } finally {
      setLoading(false);
    }
  };

  const addModel = (list, setter, raw) => {
    const models = raw
      .split(/[,\n]+/)
      .map((m) => m.trim())
      .filter(Boolean);
    if (models.length) {
      setter([...list, ...models.filter((m) => !list.includes(m))]);
    }
    return "";
  };

  const removeModel = (list, setter, model) =>
    setter(list.filter((m) => m !== model));

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/task-routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          planning: planningModels,
          execution: executionModels,
          autoRouteByTools,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const tr = data.taskRouting || {};
        setPlanningModels(tr.planning || planning);
        setExecutionModels(tr.execution || execution);
        setPlanningRaw((tr.planning || planning).join(", "));
        setExecutionRaw((tr.execution || execution).join(", "));
        setSaveMsg("Saved ✓");
        setTimeout(() => setSaveMsg(""), 2000);
      } else {
        setSaveMsg("Error saving");
      }
    } catch (e) {
      setSaveMsg("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Task Routing</h1>
          <p className="text-sm text-white/50 mt-1">
            Route planning and execution to different models
          </p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && (
            <span className="text-sm text-green-400">{saveMsg}</span>
          )}
          <Button onClick={handleSave} disabled={saving} variant="primary">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Enable toggle */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable Task Routing</p>
            <p className="text-xs text-white/40 mt-0.5">
              When enabled, <code className="text-green-400">task-router</code>{" "}
              model name or <code className="text-green-400">X-Task-Mode</code>{" "}
              header routes to different model pools
            </p>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled(!enabled)} />
        </div>
      </Card>

      {/* How it works */}
      <Card className="p-4">
        <p className="text-xs text-white/50 mb-2">How it works</p>
        <ul className="text-xs text-white/40 space-y-1 list-disc list-inside">
          <li>
            Use <code className="text-green-400">task-router</code> as the
            model name in your API request
          </li>
          <li>
            Or send{" "}
            <code className="text-green-400">X-Task-Mode: plan|execute|auto</code>{" "}
            header
          </li>
          <li>
            <b>Planning mode</b> — no tools attached, or explicit plan mode →
            routes to planning models
          </li>
          <li>
            <b>Execution mode</b> — tools present, or explicit execute mode →
            routes to execution models
          </li>
          <li>
            <b>Auto mode</b> — detects by tool presence (configurable)
          </li>
        </ul>
      </Card>

      {/* Planning models */}
      <Card className="p-4">
        <label className="block text-sm font-medium mb-1">Planning Models</label>
        <p className="text-xs text-white/40 mb-2">
          Models used for planning/reasoning (no tool execution)
        </p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-blue-500"
            placeholder="kimi-k2.5, gpt-5.6-sol"
            value={newPlanning}
            onChange={(e) => setNewPlanning(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setNewPlanning(addModel(planningModels, setPlanningModels, newPlanning)) }}
          />
          <Button onClick={() => setNewPlanning(addModel(planningModels, setPlanningModels, newPlanning))} size="sm" disabled={!newPlanning.trim()}>Add</Button>
        </div>
        {planningModels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {planningModels.map((m) => (
              <span key={m} className="flex items-center gap-1 text-xs bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded">
                {m}
                <button onClick={() => removeModel(planningModels, setPlanningModels, m)} className="hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Execution models */}
      <Card className="p-4">
        <label className="block text-sm font-medium mb-1">Execution Models</label>
        <p className="text-xs text-white/40 mb-2">
          Models used for tool execution (tool calls, function calling)
        </p>
        <div className="flex gap-2 mb-2">
          <input
            type="text"
            className="flex-1 bg-white/5 border border-white/10 rounded px-3 py-1.5 text-sm text-white/80 focus:outline-none focus:border-blue-500"
            placeholder="mimo-v2-flash, deepseek-v4-pro"
            value={newExecution}
            onChange={(e) => setNewExecution(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') setNewExecution(addModel(executionModels, setExecutionModels, newExecution)) }}
          />
          <Button onClick={() => setNewExecution(addModel(executionModels, setExecutionModels, newExecution))} size="sm" disabled={!newExecution.trim()}>Add</Button>
        </div>
        {executionModels.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {executionModels.map((m) => (
              <span key={m} className="flex items-center gap-1 text-xs bg-green-500/20 text-green-300 px-2 py-0.5 rounded">
                {m}
                <button onClick={() => removeModel(executionModels, setExecutionModels, m)} className="hover:text-red-400">×</button>
              </span>
            ))}
          </div>
        )}
      </Card>

      {/* Auto-route toggle */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-route by tools</p>
            <p className="text-xs text-white/40 mt-0.5">
              Automatically detect mode: if tools are attached → execution,
              otherwise → planning
            </p>
          </div>
          <Toggle
            checked={autoRouteByTools}
            onChange={() => setAutoRouteByTools(!autoRouteByTools)}
          />
        </div>
      </Card>
    </div>
  );
}
