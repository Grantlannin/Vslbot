"use client";

import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type Dispatch,
  type KeyboardEvent,
  type SetStateAction,
} from "react";
import { getSupabase } from "@/lib/supabase";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type Client = { id: string; name: string; createdAt: string };
type StageStatus = "running" | "review" | "approved" | "error" | undefined;

type CardUiStatus = "idle" | "generating" | "ready" | "approved" | "error";

type ChatPanelProps = {
  chatStageId: number;
  stageOutputs: Record<number, string>;
  editingOutput: Record<number, string>;
  setEditingOutput: Dispatch<SetStateAction<Record<number, string>>>;
  stageName: string;
};

type AnthropicResponseJson = {
  error?: { message?: string; type?: string };
  content?: { type: string; text?: string }[];
};

async function runPipelineClaudeApi(
  body: Record<string, unknown>,
): Promise<string> {
  const res = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  let data: AnthropicResponseJson = {};
  try {
    data = (await res.json()) as AnthropicResponseJson;
  } catch {
    throw new Error("Invalid JSON from server");
  }
  if (!res.ok) {
    throw new Error(data.error?.message ?? res.statusText);
  }
  if (data.error?.message) {
    throw new Error(data.error.message);
  }
  const block = data.content?.[0];
  if (block?.type === "text" && typeof block.text === "string") {
    return block.text;
  }
  throw new Error("Unexpected response from the model (no text content).");
}

const OUTPUT_SECTIONS = [
  { id: 2, name: "Merge", color: "#8fb8c8" },
  { id: 3, name: "Headlines", color: "#a8c89a" },
  { id: 4, name: "VSL Script", color: "#c8a8c8" },
  { id: 5, name: "Slides", color: "#c8b88a" },
  { id: 6, name: "Meta Ads", color: "#c88a8a" },
  { id: 7, name: "Email Sequence", color: "#8ac8b8" },
  { id: 8, name: "YouTube", color: "#a898c8" },
] as const;

function normalizeDbStatus(s: string | null): StageStatus {
  if (!s) return undefined;
  if (s === "approved" || s === "review" || s === "running" || s === "error")
    return s;
  return undefined;
}

function toCardStatus(s: StageStatus, hasOutput: boolean): CardUiStatus {
  if (s === "running") return "generating";
  if (s === "approved") return "approved";
  if (s === "error") return "error";
  if (s === "review" || hasOutput) return "ready";
  return "idle";
}

async function upsertPipelineStage(
  clientId: string,
  stageId: number,
  output: string | null,
  status: string,
) {
  const { error } = await getSupabase().from("pipeline_stages").upsert(
    {
      client_id: clientId,
      stage_id: stageId,
      output,
      status,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "client_id,stage_id" },
  );
  if (error) console.error("pipeline_stages upsert:", error);
}

export default function Page() {
  const [showChat, setShowChat] = useState(true);
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [newClientName, setNewClientName] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);

  const [intakeDocument, setIntakeDocument] = useState("");
  const [onboardNotes, setOnboardNotes] = useState("");

  const [stageOutputs, setStageOutputs] = useState<Record<number, string>>({});
  const [stageStatus, setStageStatus] = useState<Record<number, StageStatus>>(
    {},
  );
  const [runningStages, setRunningStages] = useState<Record<number, boolean>>(
    {},
  );
  const [pipelineRunning, setPipelineRunning] = useState(false);
  const [editingOutput, setEditingOutput] = useState<Record<number, string>>({});

  const [expandedStageId, setExpandedStageId] = useState<number | null>(null);
  const [chatStageId, setChatStageId] = useState<number>(2);

  const outputsRef = useRef(stageOutputs);
  const intakeRef = useRef(intakeDocument);
  const onboardRef = useRef(onboardNotes);

  useEffect(() => {
    outputsRef.current = stageOutputs;
  }, [stageOutputs]);
  useEffect(() => {
    intakeRef.current = intakeDocument;
  }, [intakeDocument]);
  useEffect(() => {
    onboardRef.current = onboardNotes;
  }, [onboardNotes]);

  useEffect(() => {
    let cancelled = false;
    async function loadClients() {
      const { data, error } = await getSupabase()
        .from("clients")
        .select("id,name,created_at")
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("clients load:", error);
        return;
      }
      setClients(
        (data ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: new Date(row.created_at).toLocaleDateString(),
        })),
      );
    }
    void loadClients();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadPipelineStagesForClient(clientId: string) {
    const { data, error } = await getSupabase()
      .from("pipeline_stages")
      .select("stage_id,output,status")
      .eq("client_id", clientId);
    if (error) {
      console.error("pipeline_stages load:", error);
      setStageOutputs({});
      setStageStatus({});
      setEditingOutput({});
      setIntakeDocument("");
      return;
    }
    const outputs: Record<number, string> = {};
    const statuses: Record<number, StageStatus> = {};
    const editing: Record<number, string> = {};
    let legacyIntake = "";
    for (const row of data ?? []) {
      const sid = row.stage_id;
      if (sid === 1) {
        legacyIntake = row.output ?? "";
        continue;
      }
      outputs[sid] = row.output ?? "";
      statuses[sid] = normalizeDbStatus(row.status);
      editing[sid] = row.output ?? "";
    }
    setStageOutputs(outputs);
    setStageStatus(statuses);
    setEditingOutput(editing);
    if (legacyIntake) setIntakeDocument(legacyIntake);
  }

  async function handleCreateClient(name: string) {
    if (!name.trim()) return;
    const { data, error } = await getSupabase()
      .from("clients")
      .insert({ name: name.trim() })
      .select("id,name,created_at")
      .single();
    if (error || !data) {
      console.error("clients insert:", error);
      return;
    }
    const client: Client = {
      id: data.id,
      name: data.name,
      createdAt: new Date(data.created_at).toLocaleDateString(),
    };
    setClients((prev) => [client, ...prev]);
    setActiveClient(client);
    setStageOutputs({});
    setStageStatus({});
    setEditingOutput({});
    setIntakeDocument("");
    setOnboardNotes("");
    setExpandedStageId(null);
    setChatStageId(2);
    setShowNewClient(false);
    setNewClientName("");
  }

  async function selectClient(client: Client) {
    setActiveClient(client);
    setOnboardNotes("");
    setExpandedStageId(null);
    setChatStageId(2);
    await loadPipelineStagesForClient(client.id);
  }

  function setRunning(stageId: number, v: boolean) {
    setRunningStages((p) => ({ ...p, [stageId]: v }));
  }

  type StageCtx = {
    intakeDoc: string;
    onboardNotes: string;
    transcript: string;
    mergedInput: string;
    vslScript: string;
  };

  async function runSingleStage(
    clientId: string,
    stageId: number,
    ctx: StageCtx,
  ): Promise<string> {
    const priorOut = outputsRef.current[stageId] ?? "";
    setRunning(stageId, true);
    setStageStatus((prev) => ({ ...prev, [stageId]: "running" }));
    await upsertPipelineStage(clientId, stageId, priorOut, "running");
    try {
      const output = await runPipelineClaudeApi({
        stageId,
        intakeDoc: ctx.intakeDoc,
        onboardNotes: ctx.onboardNotes,
        transcript: ctx.transcript,
        mergedInput: ctx.mergedInput,
        vslScript: ctx.vslScript,
        maxTokens: 4000,
      });
      setStageOutputs((prev) => ({ ...prev, [stageId]: output }));
      setEditingOutput((prev) => ({ ...prev, [stageId]: output }));
      setStageStatus((prev) => ({ ...prev, [stageId]: "review" }));
      outputsRef.current = { ...outputsRef.current, [stageId]: output };
      await upsertPipelineStage(clientId, stageId, output, "review");
      return output;
    } catch (e) {
      console.error("runSingleStage", stageId, e);
      setStageStatus((prev) => ({ ...prev, [stageId]: "error" }));
      await upsertPipelineStage(clientId, stageId, priorOut, "error");
      throw e;
    } finally {
      setRunning(stageId, false);
    }
  }

  function buildCtx(
    mergedInput: string,
    vslScript: string,
    intakeOverride?: string,
    onboardOverride?: string,
  ): StageCtx {
    return {
      intakeDoc: intakeOverride ?? intakeRef.current,
      onboardNotes: onboardOverride ?? onboardRef.current,
      transcript: "",
      mergedInput,
      vslScript,
    };
  }

  async function runFullPipeline() {
    const cid = activeClient?.id;
    if (!cid) return;
    if (!intakeDocument.trim() || !onboardNotes.trim()) return;
    setPipelineRunning(true);
    const intake = intakeDocument;
    const onboard = onboardNotes;
    try {
      const mergeOutput = await runSingleStage(cid, 2, {
        intakeDoc: intake,
        onboardNotes: onboard,
        transcript: "",
        mergedInput: "",
        vslScript: "",
      });

      const headlinesP = runSingleStage(
        cid,
        3,
        buildCtx(mergeOutput, "", intake, onboard),
      );
      const vslP = runSingleStage(
        cid,
        4,
        buildCtx(mergeOutput, "", intake, onboard),
      );

      let vslOutput: string;
      try {
        vslOutput = await vslP;
      } catch {
        await headlinesP.catch(() => {});
        throw new Error("VSL stage failed");
      }

      await Promise.all([
        runSingleStage(cid, 5, buildCtx(mergeOutput, vslOutput, intake, onboard)),
        runSingleStage(cid, 6, buildCtx(mergeOutput, vslOutput, intake, onboard)),
        runSingleStage(cid, 7, buildCtx(mergeOutput, vslOutput, intake, onboard)),
        runSingleStage(cid, 8, buildCtx(mergeOutput, vslOutput, intake, onboard)),
      ]);

      await headlinesP.catch((e) => console.error("Headlines error", e));
    } catch (e) {
      console.error("runFullPipeline", e);
    } finally {
      setPipelineRunning(false);
    }
  }

  async function runOneSection(stageId: number) {
    const cid = activeClient?.id;
    if (!cid) return;
    const o = outputsRef.current;
    const mergeOut = o[2] || "";
    const vslOut = o[4] || "";
    const intake = intakeRef.current;
    const onboard = onboardRef.current;
    try {
      if (stageId === 2) {
        if (!intake.trim() || !onboard.trim()) return;
        await runSingleStage(cid, 2, {
          intakeDoc: intake,
          onboardNotes: onboard,
          transcript: "",
          mergedInput: "",
          vslScript: "",
        });
        return;
      }
      if (stageId === 3 || stageId === 4) {
        if (!mergeOut.trim()) return;
        await runSingleStage(cid, stageId, buildCtx(mergeOut, "", intake, onboard));
        return;
      }
      if (!mergeOut.trim() || !vslOut.trim()) return;
      await runSingleStage(
        cid,
        stageId,
        buildCtx(mergeOut, vslOut, intake, onboard),
      );
    } catch {
      /* status already error */
    }
  }

  async function approveStage(stageId: number) {
    const cid = activeClient?.id;
    if (!cid) return;
    const finalOutput = editingOutput[stageId] || stageOutputs[stageId] || "";
    setStageOutputs((prev) => ({ ...prev, [stageId]: finalOutput }));
    setStageStatus((prev) => ({ ...prev, [stageId]: "approved" }));
    setEditingOutput((prev) => ({ ...prev, [stageId]: finalOutput }));
    outputsRef.current = { ...outputsRef.current, [stageId]: finalOutput };
    await upsertPipelineStage(cid, stageId, finalOutput, "approved");
  }

  function persistStageDraft(stageId: number, text: string) {
    const cid = activeClient?.id;
    if (!cid) return;
    setStageOutputs((prev) => ({ ...prev, [stageId]: text }));
    void upsertPipelineStage(cid, stageId, text, "review");
  }

  function canRunSection(stageId: number): boolean {
    const o = outputsRef.current;
    const mergeOut = o[2] || "";
    const vslOut = o[4] || "";
    if (stageId === 2)
      return intakeRef.current.trim().length > 0 && onboardRef.current.trim().length > 0;
    if (stageId === 3 || stageId === 4) return mergeOut.trim().length > 0;
    return mergeOut.trim().length > 0 && vslOut.trim().length > 0;
  }

  function cardLabel(stageId: number): CardUiStatus {
    const s = stageStatus[stageId];
    const has = Boolean(
      (stageOutputs[stageId] || editingOutput[stageId] || "").trim(),
    );
    return toCardStatus(s, has);
  }

  function cardStatusText(id: CardUiStatus): string {
    switch (id) {
      case "idle":
        return "Idle";
      case "generating":
        return "Generating";
      case "ready":
        return "Ready";
      case "approved":
        return "Approved";
      case "error":
        return "Error";
    }
  }

  function openCard(stageId: number) {
    setExpandedStageId(stageId);
    setChatStageId(stageId);
  }

  const chatSectionMeta = OUTPUT_SECTIONS.find((s) => s.id === chatStageId);
  const expandedMeta = expandedStageId
    ? OUTPUT_SECTIONS.find((s) => s.id === expandedStageId)
    : null;

  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        minHeight: "100vh",
        background: "#0a0a0a",
        color: "#e0ddd5",
        fontFamily: "Georgia, serif",
        overflow: "hidden",
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        body, html { background: #0a0a0a !important; margin: 0; padding: 0; }
        @keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.1)} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        textarea::placeholder{color:#444}
        textarea:focus{border-color:#333!important;outline:none}
        input::placeholder{color:#444}
        input:focus{border-color:#333!important;outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:2px}
      `}</style>

      <div
        style={{
          width: 220,
          borderRight: "1px solid #181818",
          display: "flex",
          flexDirection: "column",
          background: "#0d0d0d",
          flexShrink: 0,
        }}
      >
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #181818" }}>
          <div style={{ fontSize: 15, color: "#c8a96e", fontWeight: 400 }}>
            VSL Pipeline
          </div>
        </div>
        <div style={{ padding: "12px 12px 8px" }}>
          <button
            type="button"
            onClick={() => setShowNewClient(true)}
            style={{
              width: "100%",
              background: "#161616",
              border: "1px solid #222",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              color: "#aaa",
              cursor: "pointer",
              fontFamily: "sans-serif",
              letterSpacing: "0.05em",
              textAlign: "left",
            }}
          >
            + New Client
          </button>
        </div>
        {showNewClient && (
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #181818" }}>
            <input
              value={newClientName}
              onChange={(e) => setNewClientName(e.target.value)}
              onKeyDown={(e) =>
                e.key === "Enter" && void handleCreateClient(newClientName)
              }
              placeholder="Client name..."
              autoFocus
              style={{
                width: "100%",
                background: "#161616",
                border: "1px solid #333",
                borderRadius: 4,
                padding: "7px 10px",
                fontSize: 12,
                color: "#ddd",
                boxSizing: "border-box",
                fontFamily: "sans-serif",
              }}
            />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button
                type="button"
                onClick={() => void handleCreateClient(newClientName)}
                style={{
                  flex: 1,
                  background: "#c8a96e",
                  color: "#0a0a0a",
                  border: "none",
                  borderRadius: 4,
                  padding: "6px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "sans-serif",
                  fontWeight: 600,
                }}
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowNewClient(false);
                  setNewClientName("");
                }}
                style={{
                  flex: 1,
                  background: "#1a1a1a",
                  color: "#888",
                  border: "1px solid #222",
                  borderRadius: 4,
                  padding: "6px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "sans-serif",
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        )}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {clients.length === 0 && (
            <div
              style={{
                fontSize: 11,
                color: "#444",
                fontFamily: "sans-serif",
                padding: "8px 0",
              }}
            >
              No clients yet
            </div>
          )}
          {clients.map((client) => (
            <div
              key={client.id}
              role="button"
              tabIndex={0}
              onClick={() => void selectClient(client)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") void selectClient(client);
              }}
              style={{
                padding: "10px 10px",
                borderRadius: 6,
                cursor: "pointer",
                marginBottom: 2,
                background:
                  activeClient?.id === client.id ? "#161616" : "transparent",
                border:
                  activeClient?.id === client.id
                    ? "1px solid #222"
                    : "1px solid transparent",
              }}
            >
              <div
                style={{
                  fontSize: 13,
                  color: activeClient?.id === client.id ? "#e0ddd5" : "#888",
                }}
              >
                {client.name}
              </div>
              <div
                style={{
                  fontSize: 10,
                  color: "#444",
                  fontFamily: "sans-serif",
                  marginTop: 2,
                }}
              >
                {client.createdAt}
              </div>
            </div>
          ))}
        </div>
      </div>

      {!activeClient ? (
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div style={{ fontSize: 13, color: "#555", fontFamily: "sans-serif" }}>
            Select or create a client to begin
          </div>
        </div>
      ) : (
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            minWidth: 0,
          }}
        >
          <div
            style={{
              borderBottom: "1px solid #181818",
              padding: "14px 20px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "#0d0d0d",
              flexShrink: 0,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  color: "#555",
                  fontFamily: "sans-serif",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                  marginBottom: 2,
                }}
              >
                Active client
              </div>
              <div style={{ fontSize: 16, color: "#e0ddd5" }}>
                {activeClient.name}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowChat((p) => !p)}
              style={{
                background: showChat ? "#c8a96e22" : "#141414",
                color: showChat ? "#c8a96e" : "#666",
                border: `1px solid ${showChat ? "#c8a96e44" : "#222"}`,
                borderRadius: 4,
                padding: "6px 14px",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "sans-serif",
              }}
            >
              {showChat ? "Hide Chat" : "Chat"}
            </button>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "row",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            <div
              style={{
                flex: 1,
                overflowY: "auto",
                padding: "20px",
                minWidth: 0,
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 16,
                  marginBottom: 16,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#888",
                      fontFamily: "sans-serif",
                      marginBottom: 8,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Intake Document
                  </div>
                  <textarea
                    value={intakeDocument}
                    onChange={(e) => setIntakeDocument(e.target.value)}
                    placeholder="Paste or type the client intake document here..."
                    style={{
                      width: "100%",
                      minHeight: 160,
                      background: "#111",
                      border: "1px solid #222",
                      borderRadius: 8,
                      padding: 14,
                      fontSize: 13,
                      color: "#ddd",
                      resize: "vertical",
                      fontFamily: "Georgia, serif",
                      lineHeight: 1.7,
                    }}
                  />
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 11,
                      color: "#888",
                      fontFamily: "sans-serif",
                      marginBottom: 8,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                    }}
                  >
                    Onboard Notes
                  </div>
                  <textarea
                    value={onboardNotes}
                    onChange={(e) => setOnboardNotes(e.target.value)}
                    placeholder="Your notes from the onboard call — angle, mechanism, avatar, awareness, gaps..."
                    style={{
                      width: "100%",
                      minHeight: 160,
                      background: "#111",
                      border: "1px solid #222",
                      borderRadius: 8,
                      padding: 14,
                      fontSize: 13,
                      color: "#ddd",
                      resize: "vertical",
                      fontFamily: "Georgia, serif",
                      lineHeight: 1.7,
                    }}
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => void runFullPipeline()}
                disabled={
                  pipelineRunning ||
                  !intakeDocument.trim() ||
                  !onboardNotes.trim()
                }
                style={{
                  marginBottom: 24,
                  background:
                    pipelineRunning || !intakeDocument.trim() || !onboardNotes.trim()
                      ? "#1a1a1a"
                      : "#c8a96e",
                  color:
                    pipelineRunning || !intakeDocument.trim() || !onboardNotes.trim()
                      ? "#444"
                      : "#0a0a0a",
                  border: "none",
                  borderRadius: 6,
                  padding: "12px 28px",
                  fontSize: 13,
                  fontWeight: 600,
                  cursor:
                    pipelineRunning || !intakeDocument.trim() || !onboardNotes.trim()
                      ? "not-allowed"
                      : "pointer",
                  fontFamily: "sans-serif",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {pipelineRunning ? "Running pipeline…" : "Run Full Pipeline"}
              </button>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: 14,
                }}
              >
                {OUTPUT_SECTIONS.map((sec) => {
                  const st = cardLabel(sec.id);
                  const isRun = runningStages[sec.id] || false;
                  const text =
                    editingOutput[sec.id] ?? stageOutputs[sec.id] ?? "";
                  const preview =
                    text.trim().length > 0
                      ? text.slice(0, 280) + (text.length > 280 ? "…" : "")
                      : "No output yet.";
                  return (
                    <div
                      key={sec.id}
                      role="button"
                      tabIndex={0}
                      onClick={() => openCard(sec.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") openCard(sec.id);
                      }}
                      style={{
                        border: `1px solid ${st === "error" ? "#4a2828" : "#222"}`,
                        borderRadius: 10,
                        padding: 14,
                        background: "#101010",
                        cursor: "pointer",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                        minHeight: 200,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <div
                            style={{
                              width: 8,
                              height: 8,
                              borderRadius: "50%",
                              background: sec.color,
                            }}
                          />
                          <div
                            style={{
                              fontSize: 14,
                              color: "#e0ddd5",
                              fontWeight: 400,
                            }}
                          >
                            {sec.name}
                          </div>
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            fontFamily: "sans-serif",
                            color:
                              st === "approved"
                                ? "#8fbc8f"
                                : st === "generating"
                                  ? "#8ab4c8"
                                  : st === "ready"
                                    ? "#c8a96e"
                                    : st === "error"
                                      ? "#c87878"
                                      : "#555",
                            textTransform: "uppercase",
                            letterSpacing: "0.06em",
                          }}
                        >
                          {isRun ? "Generating" : cardStatusText(st)}
                        </div>
                      </div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#666",
                          lineHeight: 1.6,
                          whiteSpace: "pre-wrap",
                          flex: 1,
                          overflow: "hidden",
                          fontFamily: "sans-serif",
                        }}
                      >
                        {preview}
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          flexWrap: "wrap",
                        }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => void runOneSection(sec.id)}
                          disabled={
                            isRun ||
                            pipelineRunning ||
                            !canRunSection(sec.id)
                          }
                          style={{
                            background:
                              !isRun &&
                              !pipelineRunning &&
                              canRunSection(sec.id)
                                ? "#1e2e1e"
                                : "#1a1a1a",
                            color:
                              !isRun &&
                              !pipelineRunning &&
                              canRunSection(sec.id)
                                ? "#8fbc8f"
                                : "#444",
                            border: "1px solid #2a2a2a",
                            borderRadius: 4,
                            padding: "6px 12px",
                            fontSize: 10,
                            cursor:
                              isRun || pipelineRunning || !canRunSection(sec.id)
                                ? "not-allowed"
                                : "pointer",
                            fontFamily: "sans-serif",
                          }}
                        >
                          Run
                        </button>
                        {(st === "ready" || st === "approved") && (
                          <button
                            type="button"
                            onClick={() => void approveStage(sec.id)}
                            disabled={st === "approved"}
                            style={{
                              background:
                                st === "approved" ? "#1a2e1a" : "#c8a96e",
                              color:
                                st === "approved" ? "#6a8a6a" : "#0a0a0a",
                              border: "none",
                              borderRadius: 4,
                              padding: "6px 12px",
                              fontSize: 10,
                              cursor:
                                st === "approved" ? "default" : "pointer",
                              fontFamily: "sans-serif",
                              fontWeight: 600,
                            }}
                          >
                            Approve
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {showChat && (
              <ChatPanel
                chatStageId={chatStageId}
                stageOutputs={stageOutputs}
                editingOutput={editingOutput}
                setEditingOutput={setEditingOutput}
                stageName={chatSectionMeta?.name ?? "Section"}
              />
            )}
          </div>
        </div>
      )}

      {expandedStageId && expandedMeta && activeClient && (
        <ExpandedSectionModal
          stageId={expandedStageId}
          name={expandedMeta.name}
          color={expandedMeta.color}
          status={stageStatus[expandedStageId]}
          text={editingOutput[expandedStageId] ?? stageOutputs[expandedStageId] ?? ""}
          running={runningStages[expandedStageId] || false}
          onClose={() => setExpandedStageId(null)}
          onChangeText={(t) =>
            setEditingOutput((p) => ({ ...p, [expandedStageId]: t }))
          }
          onBlurPersist={(latest) => persistStageDraft(expandedStageId, latest)}
          onApprove={() => void approveStage(expandedStageId)}
          onRun={() => void runOneSection(expandedStageId)}
          canRun={canRunSection(expandedStageId)}
          pipelineRunning={pipelineRunning}
        />
      )}
    </div>
  );
}

function ExpandedSectionModal({
  stageId,
  name,
  color,
  status,
  text,
  running,
  onClose,
  onChangeText,
  onBlurPersist,
  onApprove,
  onRun,
  canRun,
  pipelineRunning,
}: {
  stageId: number;
  name: string;
  color: string;
  status: StageStatus;
  text: string;
  running: boolean;
  onClose: () => void;
  onChangeText: (t: string) => void;
  onBlurPersist: (latest: string) => void;
  onApprove: () => void;
  onRun: () => void;
  canRun: boolean;
  pipelineRunning: boolean;
}) {
  const approved = status === "approved";
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.72)",
        zIndex: 50,
        display: "flex",
        alignItems: "stretch",
        justifyContent: "center",
        padding: "24px 48px 24px 244px",
      }}
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`section-${stageId}-title`}
        onClick={(e) => e.stopPropagation()}
        style={{
          flex: 1,
          maxWidth: 900,
          background: "#0d0d0d",
          border: "1px solid #252525",
          borderRadius: 10,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          boxShadow: "0 24px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid #1e1e1e",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: color,
              }}
            />
            <div
              id={`section-${stageId}-title`}
              style={{ fontSize: 16, color: "#e0ddd5" }}
            >
              {name}
            </div>
            {running && (
              <div
                style={{
                  width: 14,
                  height: 14,
                  border: "2px solid #8ab4c8",
                  borderTopColor: "transparent",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                }}
              />
            )}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button
              type="button"
              onClick={onRun}
              disabled={running || pipelineRunning || !canRun}
              style={{
                background: "#1e2e1e",
                color: running || pipelineRunning || !canRun ? "#444" : "#8fbc8f",
                border: "1px solid #2a3a2a",
                borderRadius: 4,
                padding: "6px 14px",
                fontSize: 11,
                cursor:
                  running || pipelineRunning || !canRun ? "not-allowed" : "pointer",
                fontFamily: "sans-serif",
              }}
            >
              Run
            </button>
            <button
              type="button"
              onClick={onApprove}
              disabled={approved || status !== "review"}
              style={{
                background: approved ? "#1a2e1a" : "#c8a96e",
                color: approved ? "#6a8a6a" : "#0a0a0a",
                border: "none",
                borderRadius: 4,
                padding: "6px 14px",
                fontSize: 11,
                fontWeight: 600,
                cursor:
                  approved || status !== "review" ? "not-allowed" : "pointer",
                fontFamily: "sans-serif",
              }}
            >
              Approve
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                background: "#1a1a1a",
                color: "#888",
                border: "1px solid #2a2a2a",
                borderRadius: 4,
                padding: "6px 12px",
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "sans-serif",
              }}
            >
              Close
            </button>
          </div>
        </div>
        <textarea
          value={text}
          onChange={(e) => onChangeText(e.target.value)}
          onBlur={() => onBlurPersist(text)}
          readOnly={approved}
          style={{
            flex: 1,
            minHeight: 360,
            width: "100%",
            border: "none",
            padding: 20,
            fontSize: 13,
            lineHeight: 1.75,
            color: approved ? "#8ab88a" : "#ddd",
            background: "#080808",
            resize: "none",
            fontFamily: "Georgia, serif",
            outline: "none",
          }}
        />
      </div>
    </div>
  );
}

function ChatPanel({
  chatStageId,
  stageOutputs,
  editingOutput,
  setEditingOutput,
  stageName,
}: ChatPanelProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    setMessages([]);
  }, [chatStageId]);

  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "44px";
    try {
      const apiMessages = updated.map((m) => ({ role: m.role, content: m.content }));
      const currentOut =
        editingOutput[chatStageId] || stageOutputs[chatStageId] || "";
      const reply = await runPipelineClaudeApi({
        stageId: "chat",
        messages: apiMessages,
        activeStageName: stageName,
        currentStageOutput: currentOut,
        mergedInputDoc: stageOutputs[2] || "",
        vslScript: stageOutputs[4] || "",
        maxTokens: 1500,
      });
      setMessages([...updated, { role: "assistant", content: reply }]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error. Try again.";
      setMessages([...updated, { role: "assistant", content: msg }]);
    }
    setLoading(false);
  }

  function handleKey(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  function handleInput(e: ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    const ta = textareaRef.current;
    if (ta) {
      ta.style.height = "44px";
      ta.style.height = Math.min(ta.scrollHeight, 120) + "px";
    }
  }

  function applyToStage(text: string) {
    const current =
      editingOutput[chatStageId] || stageOutputs[chatStageId] || "";
    setEditingOutput((prev) => ({
      ...prev,
      [chatStageId]: current + "\n\n--- CHAT SUGGESTION ---\n" + text,
    }));
  }

  return (
    <div
      style={{
        width: 320,
        borderLeft: "1px solid #181818",
        display: "flex",
        flexDirection: "column",
        background: "#0d0d0d",
        flexShrink: 0,
      }}
    >
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #181818" }}>
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.12em",
            color: "#555",
            textTransform: "uppercase",
            fontFamily: "sans-serif",
            marginBottom: 2,
          }}
        >
          Chat — section
        </div>
        <div style={{ fontSize: 13, color: "#c8a96e" }}>{stageName}</div>
        <div
          style={{
            fontSize: 10,
            color: "#444",
            fontFamily: "sans-serif",
            marginTop: 4,
          }}
        >
          Context follows the section you open. Append applies to that
          section&apos;s output.
        </div>
      </div>
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "12px 14px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              "Make the category attack more aggressive",
              "Rewrite the hook for a more skeptical avatar",
              "The proof section needs more emotional detail",
              "Make the CTA feel less like a pitch",
              "Tighten the mechanism section",
            ].map((s, i) => (
              <button
                key={i}
                type="button"
                onClick={() => setInput(s)}
                style={{
                  background: "#141414",
                  border: "1px solid #1e1e1e",
                  borderRadius: 6,
                  padding: "8px 12px",
                  fontSize: 11,
                  color: "#777",
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "sans-serif",
                  lineHeight: 1.4,
                }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
              gap: 4,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#444",
                fontFamily: "sans-serif",
              }}
            >
              {m.role === "user" ? "You" : "Claude"}
            </div>
            <div
              style={{
                maxWidth: "95%",
                padding: "10px 12px",
                borderRadius:
                  m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
                background: m.role === "user" ? "#1a1a1a" : "#141414",
                border: `1px solid ${m.role === "user" ? "#252525" : "#1e1e1e"}`,
                fontSize: 12,
                lineHeight: 1.65,
                color: m.role === "user" ? "#bbb" : "#ccc",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
            {m.role === "assistant" && (
              <button
                type="button"
                onClick={() => applyToStage(m.content)}
                style={{
                  fontSize: 9,
                  color: "#555",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  fontFamily: "sans-serif",
                  padding: "2px 0",
                  textAlign: "left",
                }}
              >
                + append to section output
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div
              style={{
                padding: "10px 12px",
                background: "#141414",
                border: "1px solid #1e1e1e",
                borderRadius: "10px 10px 10px 2px",
                display: "flex",
                gap: 4,
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: 5,
                    borderRadius: "50%",
                    background: "#555",
                    animation: "pulse 1.2s infinite",
                    animationDelay: `${i * 0.2}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div
        style={{
          borderTop: "1px solid #181818",
          padding: "10px 14px",
          background: "#0a0a0a",
        }}
      >
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInput}
            onKeyDown={handleKey}
            placeholder="Ask Claude to tweak this section..."
            rows={1}
            disabled={loading}
            style={{
              flex: 1,
              background: "#141414",
              border: "1px solid #222",
              borderRadius: 6,
              padding: "8px 12px",
              fontSize: 12,
              color: "#ddd",
              resize: "none",
              outline: "none",
              fontFamily: "Georgia, serif",
              lineHeight: 1.5,
              height: 38,
              minHeight: 38,
              maxHeight: 120,
            }}
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={!input.trim() || loading}
            style={{
              background: input.trim() && !loading ? "#c8a96e" : "#1a1a1a",
              color: input.trim() && !loading ? "#0a0a0a" : "#333",
              border: "none",
              borderRadius: 6,
              width: 36,
              height: 36,
              cursor: input.trim() && !loading ? "pointer" : "not-allowed",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}
