"use client";

import { useState, useEffect } from "react";
import { Card, Button, Toggle, ModelSelectModal } from "@/shared/components";

export default function TaskRoutingClient() {
  const [enabled, setEnabled] = useState(false);
  const [planningModels, setPlanningModels] = useState([]);
  const [executionModels, setExecutionModels] = useState([]);
  const [autoRouteByTools, setAutoRouteByTools] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [showPicker, setShowPicker] = useState(null); // "planning" | "execution"

  useEffect(() => {
    fetch("/api/task-routing")
      .then((r) => r.json())
      .then((data) => {
        const tr = data.taskRouting || {};
        setEnabled(!!tr.enabled);
        setPlanningModels(tr.planning || []);
        setExecutionModels(tr.execution || []);
        setAutoRouteByTools(tr.autoRouteByTools !== false);
      })
      .catch((e) => console.error("fetch task-routing:", e))
      .finally(() => setLoading(false));
  }, []);

  const handleAddModel = (m) => {
    if (!m?.value) return;
    if (showPicker === "planning" && !planningModels.includes(m.value))
      setPlanningModels([...planningModels, m.value]);
    if (showPicker === "execution" && !executionModels.includes(m.value))
      setExecutionModels([...executionModels, m.value]);
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveMsg("");
    try {
      const res = await fetch("/api/task-routing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, planning: planningModels, execution: executionModels, autoRouteByTools }),
      });
      setSaveMsg(res.ok ? "Saved ✓" : "Error saving");
      if (res.ok) setTimeout(() => setSaveMsg(""), 2000);
    } catch (e) {
      setSaveMsg("Error: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  // Same ModelSection pattern as combos
  const ModelSection = ({ title, sub, color, models, picker }) => (
    <Card className="p-4">
      <label className="block text-sm font-medium mb-1">{title}</label>
      <p className="text-xs text-white/40 mb-3">{sub}</p>
      {models.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          {models.map((m) => (
            <span key={m} className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded ${color}`}>
              {m}
              <button
                onClick={() =>
                  picker === "planning"
                    ? setPlanningModels(planningModels.filter((x) => x !== m))
                    : setExecutionModels(executionModels.filter((x) => x !== m))
                }
                className="hover:text-red-400 ml-1"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Button size="sm" variant="outline" onClick={() => setShowPicker(picker)}>
        + Add model
      </Button>
    </Card>
  );

  if (loading)
    return (
      <div className="max-w-2xl mx-auto p-6 space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-white/5 animate-pulse" />
        ))}
      </div>
    );

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold">Task Routing</h1>
          <p className="text-sm text-white/50 mt-1">Route planning and execution to different models</p>
        </div>
        <div className="flex items-center gap-2">
          {saveMsg && <span className="text-sm text-green-400">{saveMsg}</span>}
          <Button onClick={handleSave} disabled={saving} variant="primary">
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Enable Task Routing</p>
            <p className="text-xs text-white/40 mt-0.5">
              Use <code className="text-green-400">task-router</code> as model name or{" "}
              <code className="text-green-400">X-Task-Mode: plan|execute|auto</code> header
            </p>
          </div>
          <Toggle checked={enabled} onChange={() => setEnabled(!enabled)} />
        </div>
      </Card>

      <ModelSection
        title="Planning Models"
        sub="Used for reasoning/planning — no tool execution"
        color="bg-blue-500/20 text-blue-300"
        models={planningModels}
        picker="planning"
      />
      <ModelSection
        title="Execution Models"
        sub="Used for tool calls and function execution"
        color="bg-green-500/20 text-green-300"
        models={executionModels}
        picker="execution"
      />

      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Auto-route by tools</p>
            <p className="text-xs text-white/40 mt-0.5">Tools present → execution, otherwise → planning</p>
          </div>
          <Toggle checked={autoRouteByTools} onChange={() => setAutoRouteByTools(!autoRouteByTools)} />
        </div>
      </Card>

      <ModelSelectModal
        isOpen={!!showPicker}
        onClose={() => setShowPicker(null)}
        onSelect={handleAddModel}
        title={showPicker === "planning" ? "Add Planning Model" : "Add Execution Model"}
        closeOnSelect={true}
      />
    </div>
  );
}
