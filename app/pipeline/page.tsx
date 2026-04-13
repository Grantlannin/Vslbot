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
import { INTAKE_SYSTEM, INTAKE_DOC_PROMPT } from "@/lib/intake-prompts";
import { callClaude } from "@/lib/claude-client";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };
type Client = { id: string; name: string; createdAt: string };
type StageStatus = "running" | "review" | "approved" | "error" | undefined;

type ChatPanelProps = {
  activeStage: number;
  stageOutputs: Record<number, string>;
  editingOutput: Record<number, string>;
  setEditingOutput: Dispatch<SetStateAction<Record<number, string>>>;
  stageName: string;
};

type StageOutputProps = {
  stageId: number;
  output: string | undefined;
  editingOutput: Record<number, string>;
  setEditingOutput: Dispatch<SetStateAction<Record<number, string>>>;
  status: StageStatus;
  onApprove: () => void;
  onRerun: () => void;
  onDraftPersist?: (stageId: number, text: string) => void;
};

type AnthropicResponseJson = {
  error?: { message?: string; type?: string };
  content?: { type: string; text?: string }[];
};

/** Pipeline stages 2–8 and side chat: prompts live on /api/claude only. */
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

// ─── STAGE CONFIG ─────────────────────────────────────────────────────────────

const STAGES = [
  { id: 1, name: "Intake Bot", short: "Intake", description: "AI-powered client interview", color: "#c8a96e", requiresInput: false },
  { id: 2, name: "Merge", short: "Merge", description: "Reconcile intake + onboard notes", color: "#8fb8c8", requiresInput: true },
  { id: 3, name: "Headlines", short: "Headlines", description: "5 VSL headline variants", color: "#a8c89a", requiresInput: false },
  { id: 4, name: "VSL Script", short: "VSL", description: "Full VSL script", color: "#c8a8c8", requiresInput: false },
  { id: 5, name: "Slides", short: "Slides", description: "Gamma deck + speaker notes", color: "#c8b88a", requiresInput: false },
  { id: 6, name: "Meta Ads", short: "Ads", description: "10 static ad concepts", color: "#c88a8a", requiresInput: false },
  { id: 7, name: "Email Sequence", short: "Emails", description: "5-email pre-call sequence", color: "#8ac8b8", requiresInput: false },
  { id: 8, name: "YouTube", short: "YouTube", description: "10 video outlines", color: "#a898c8", requiresInput: false },
];

// ─── COMPONENTS ───────────────────────────────────────────────────────────────

function IntakeChat({ onComplete }: { onComplete: (doc: string) => void }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [doc, setDoc] = useState("");
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  useEffect(() => {
    initChat();
  }, []);

  async function initChat() {
    setLoading(true);
    try {
      const text = await callClaude(INTAKE_SYSTEM, "I'm ready to begin.", 800);
      const clean = text.replace(/\[INTERVIEW_COMPLETE\]/g, "").trim();
      setMessages([{ role: "assistant" as const, content: clean }]);
      if (text.includes("[INTERVIEW_COMPLETE]")) setDone(true);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Something went wrong. Please refresh.";
      setMessages([{ role: "assistant", content: msg }]);
    }
    setLoading(false);
  }

  async function send() {
    const text = input.trim();
    if (!text || loading || done) return;
    const userMsg: ChatMessage = { role: "user", content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput("");
    setLoading(true);
    if (textareaRef.current) textareaRef.current.style.height = "44px";
    try {
      const raw = await callClaude(INTAKE_SYSTEM, updated.map(m => `${m.role === "user" ? "CLIENT" : "ASSISTANT"}: ${m.content}`).join("\n\n"), 800);
      const clean = raw.replace(/\[INTERVIEW_COMPLETE\]/g, "").trim();
      const next: ChatMessage[] = [...updated, { role: "assistant", content: clean }];
      setMessages(next);
      if (raw.includes("[INTERVIEW_COMPLETE]")) setDone(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error. Please try again.";
      setMessages([...updated, { role: "assistant", content: msg }]);
    }
    setLoading(false);
  }

  async function generateDoc() {
    setGeneratingDoc(true);
    const transcript = messages.map(m => `${m.role === "user" ? "CLIENT" : "INTERVIEWER"}: ${m.content}`).join("\n\n");
    try {
      const text = await callClaude(INTAKE_DOC_PROMPT, `INTERVIEW TRANSCRIPT:\n\n${transcript}`, 2000);
      setDoc(text);
    } catch (e) {
      setDoc("Error generating document. Please try again.");
    }
    setGeneratingDoc(false);
  }

  function copyDoc() {
    navigator.clipboard.writeText(doc);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      ta.style.height = Math.min(ta.scrollHeight, 160) + "px";
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", gap: 0 }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16 }}>
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555", marginBottom: 4, fontFamily: "sans-serif" }}>
              {m.role === "user" ? "You" : "Intake Bot"}
            </div>
            <div style={{ maxWidth: "85%", padding: "12px 16px", borderRadius: m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px", background: m.role === "user" ? "#1e1e1e" : "#161616", border: `1px solid ${m.role === "user" ? "#2a2a2a" : "#1e1e1e"}`, fontSize: 14, lineHeight: 1.7, color: m.role === "user" ? "#ccc" : "#ddd", whiteSpace: "pre-wrap" }}>
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "#555", marginBottom: 4, fontFamily: "sans-serif" }}>Intake Bot</div>
            <div style={{ padding: "12px 16px", background: "#161616", border: "1px solid #1e1e1e", borderRadius: "12px 12px 12px 2px", display: "flex", gap: 5, alignItems: "center" }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: "50%", background: "#555", animation: "pulse 1.2s infinite", animationDelay: `${i*0.2}s` }} />)}
            </div>
          </div>
        )}
        {done && !doc && (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "24px 0", gap: 12 }}>
            <div style={{ fontSize: 11, color: "#555", fontFamily: "sans-serif" }}>Interview complete</div>
            <button onClick={generateDoc} disabled={generatingDoc} style={{ background: generatingDoc ? "#1e1e1e" : "#c8a96e", color: generatingDoc ? "#555" : "#0a0a0a", border: "none", borderRadius: 4, padding: "11px 28px", fontSize: 12, fontWeight: 600, cursor: generatingDoc ? "not-allowed" : "pointer", letterSpacing: "0.08em", textTransform: "uppercase", fontFamily: "sans-serif" }}>
              {generatingDoc ? "Generating..." : "Generate Intake Document"}
            </button>
          </div>
        )}
        {doc && (
          <div style={{ border: "1px solid #222", borderRadius: 8, overflow: "hidden" }}>
            <div style={{ background: "#141414", padding: "14px 18px", borderBottom: "1px solid #222", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontSize: 11, color: "#8fbc8f", fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>Intake document ready</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={copyDoc} style={{ background: "#1e1e1e", color: copied ? "#8fbc8f" : "#aaa", border: "1px solid #2a2a2a", borderRadius: 4, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif" }}>
                  {copied ? "Copied" : "Copy"}
                </button>
                <button onClick={() => onComplete(doc)} style={{ background: "#c8a96e", color: "#0a0a0a", border: "none", borderRadius: 4, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif", fontWeight: 600 }}>
                  Use This Intake
                </button>
              </div>
            </div>
            <div style={{ padding: 20, background: "#0d0d0d", fontSize: 12, lineHeight: 1.8, color: "#bbb", whiteSpace: "pre-wrap", fontFamily: "monospace", maxHeight: 300, overflowY: "auto" }}>
              {doc}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {!done && (
        <div style={{ borderTop: "1px solid #1a1a1a", padding: "14px 20px", background: "#0a0a0a" }}>
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea ref={textareaRef} value={input} onChange={handleInput} onKeyDown={handleKey} placeholder="Type your answer..." rows={1} disabled={loading} style={{ flex: 1, background: "#141414", border: "1px solid #222", borderRadius: 8, padding: "10px 14px", fontSize: 14, color: "#ddd", resize: "none", outline: "none", fontFamily: "Georgia, serif", lineHeight: 1.6, height: 44, minHeight: 44, maxHeight: 160 }} />
            <button onClick={send} disabled={!input.trim() || loading} style={{ background: input.trim() && !loading ? "#c8a96e" : "#1a1a1a", color: input.trim() && !loading ? "#0a0a0a" : "#333", border: "none", borderRadius: 8, width: 44, height: 44, cursor: input.trim() && !loading ? "pointer" : "not-allowed", fontSize: 18, flexShrink: 0 }}>
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

function normalizeDbStatus(s: string | null): StageStatus {
  if (!s) return undefined;
  if (s === "approved" || s === "review" || s === "running" || s === "error") return s;
  return undefined;
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
  const [showChat, setShowChat] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [activeClient, setActiveClient] = useState<Client | null>(null);
  const [activeStage, setActiveStage] = useState(1);
  const [newClientName, setNewClientName] = useState("");
  const [showNewClient, setShowNewClient] = useState(false);

  const [onboardNotes, setOnboardNotes] = useState("");
  const [transcript, setTranscript] = useState("");

  const [stageOutputs, setStageOutputs] = useState<Record<number, string>>({});
  const [stageStatus, setStageStatus] = useState<Record<number, StageStatus>>({});
  const [runningStage, setRunningStage] = useState<number | null>(null);
  const [editingOutput, setEditingOutput] = useState<Record<number, string>>({});

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
      return;
    }
    const outputs: Record<number, string> = {};
    const statuses: Record<number, StageStatus> = {};
    const editing: Record<number, string> = {};
    for (const row of data ?? []) {
      const sid = row.stage_id;
      outputs[sid] = row.output ?? "";
      statuses[sid] = normalizeDbStatus(row.status);
      editing[sid] = row.output ?? "";
    }
    setStageOutputs(outputs);
    setStageStatus(statuses);
    setEditingOutput(editing);
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
    setActiveStage(1);
    setStageOutputs({});
    setStageStatus({});
    setEditingOutput({});
    setOnboardNotes("");
    setTranscript("");
    setShowNewClient(false);
    setNewClientName("");
  }

  async function selectClient(client: Client) {
    setActiveClient(client);
    setActiveStage(1);
    setOnboardNotes("");
    setTranscript("");
    await loadPipelineStagesForClient(client.id);
  }

  async function handleIntakeComplete(intakeDoc: string) {
    const cid = activeClient?.id;
    if (!cid) return;
    setStageOutputs((prev) => ({ ...prev, 1: intakeDoc }));
    setStageStatus((prev) => ({ ...prev, 1: "approved" }));
    setEditingOutput((prev) => ({ ...prev, 1: intakeDoc }));
    setActiveStage(2);
    await upsertPipelineStage(cid, 1, intakeDoc, "approved");
  }

  async function runStage(stageId: number) {
    const cid = activeClient?.id;
    if (!cid) return;

    const mergedInput = stageOutputs[2] || "";
    const vslScript = stageOutputs[4] || "";
    const intakeDoc = stageOutputs[1] || "";

    setRunningStage(stageId);
    setStageStatus((prev) => ({ ...prev, [stageId]: "running" }));
    await upsertPipelineStage(
      cid,
      stageId,
      stageOutputs[stageId] ?? "",
      "running",
    );

    try {
      const output = await runPipelineClaudeApi({
        stageId,
        intakeDoc,
        onboardNotes,
        transcript,
        mergedInput,
        vslScript,
        maxTokens: 4000,
      });
      setStageOutputs((prev) => ({ ...prev, [stageId]: output }));
      setEditingOutput((prev) => ({ ...prev, [stageId]: output }));
      setStageStatus((prev) => ({ ...prev, [stageId]: "review" }));
      await upsertPipelineStage(cid, stageId, output, "review");
    } catch (e) {
      setStageStatus((prev) => ({ ...prev, [stageId]: "error" }));
      await upsertPipelineStage(
        cid,
        stageId,
        stageOutputs[stageId] ?? "",
        "error",
      );
    }
    setRunningStage(null);
  }

  async function approveStage(stageId: number) {
    const cid = activeClient?.id;
    if (!cid) return;
    const finalOutput = editingOutput[stageId] || stageOutputs[stageId] || "";
    setStageOutputs((prev) => ({ ...prev, [stageId]: finalOutput }));
    setStageStatus((prev) => ({ ...prev, [stageId]: "approved" }));
    setEditingOutput((prev) => ({ ...prev, [stageId]: finalOutput }));
    if (stageId < 8) setActiveStage(stageId + 1);
    await upsertPipelineStage(cid, stageId, finalOutput, "approved");
  }

  function persistStageDraft(stageId: number, text: string) {
    const cid = activeClient?.id;
    if (!cid) return;
    setStageOutputs((prev) => ({ ...prev, [stageId]: text }));
    void upsertPipelineStage(cid, stageId, text, "review");
  }

  function getStageStatusColor(stageId: number) {
    const s = stageStatus[stageId];
    if (s === "approved") return "#8fbc8f";
    if (s === "review") return "#c8a96e";
    if (s === "running") return "#8ab4c8";
    if (s === "error") return "#c87878";
    return "#333";
  }

  function getStageStatusLabel(stageId: number) {
    const s = stageStatus[stageId];
    if (s === "approved") return "Approved";
    if (s === "review") return "Review";
    if (s === "running") return "Running...";
    if (s === "error") return "Error";
    return "Pending";
  }

  const canRunStage = (stageId: number) => {
    if (stageId === 1) return true;
    if (stageId === 2) return stageStatus[1] === "approved" && onboardNotes.trim();
    if (stageId === 3) return stageStatus[2] === "approved";
    if (stageId === 4) return stageStatus[2] === "approved";
    if (stageId === 5) return stageStatus[4] === "approved";
    if (stageId === 6) return stageStatus[4] === "approved";
    if (stageId === 7) return stageStatus[2] === "approved" && stageStatus[4] === "approved";
    if (stageId === 8) return stageStatus[2] === "approved" && stageStatus[4] === "approved";
    return false;
  };

  const currentStageData = STAGES.find(s => s.id === activeStage);

  return (
    <div style={{ display: "flex", height: "100vh", minHeight: "100vh", background: "#0a0a0a", color: "#e0ddd5", fontFamily: "Georgia, serif", overflow: "hidden", position: "fixed", top: 0, left: 0, right: 0, bottom: 0 }}>
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

      {/* Sidebar */}
      <div style={{ width: 220, borderRight: "1px solid #181818", display: "flex", flexDirection: "column", background: "#0d0d0d", flexShrink: 0 }}>
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid #181818" }}>
          <div style={{ fontSize: 15, color: "#c8a96e", fontWeight: 400 }}>VSL Pipeline</div>
        </div>

        <div style={{ padding: "12px 12px 8px" }}>
          <button onClick={() => setShowNewClient(true)} style={{ width: "100%", background: "#161616", border: "1px solid #222", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#aaa", cursor: "pointer", fontFamily: "sans-serif", letterSpacing: "0.05em", textAlign: "left" }}>
            + New Client
          </button>
        </div>

        {showNewClient && (
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #181818" }}>
            <input value={newClientName} onChange={e => setNewClientName(e.target.value)} onKeyDown={(e) =>
              e.key === "Enter" && void handleCreateClient(newClientName)
            } placeholder="Client name..." autoFocus style={{ width: "100%", background: "#161616", border: "1px solid #333", borderRadius: 4, padding: "7px 10px", fontSize: 12, color: "#ddd", boxSizing: "border-box", fontFamily: "sans-serif" }} />
            <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
              <button
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
              <button onClick={() => { setShowNewClient(false); setNewClientName(""); }} style={{ flex: 1, background: "#1a1a1a", color: "#888", border: "1px solid #222", borderRadius: 4, padding: "6px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif" }}>Cancel</button>
            </div>
          </div>
        )}

        <div style={{ flex: 1, overflowY: "auto", padding: "8px 12px" }}>
          {clients.length === 0 && <div style={{ fontSize: 11, color: "#444", fontFamily: "sans-serif", padding: "8px 0" }}>No clients yet</div>}
          {clients.map(client => (
            <div
              key={client.id}
              onClick={() => void selectClient(client)}
              style={{ padding: "10px 10px", borderRadius: 6, cursor: "pointer", marginBottom: 2, background: activeClient?.id === client.id ? "#161616" : "transparent", border: activeClient?.id === client.id ? "1px solid #222" : "1px solid transparent", transition: "all 0.15s" }}>
              <div style={{ fontSize: 13, color: activeClient?.id === client.id ? "#e0ddd5" : "#888" }}>{client.name}</div>
              <div style={{ fontSize: 10, color: "#444", fontFamily: "sans-serif", marginTop: 2 }}>{client.createdAt}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Main area */}
      {!activeClient ? (
        <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", flexDirection: "column", gap: 12 }}>
          <div style={{ fontSize: 13, color: "#555", fontFamily: "sans-serif" }}>Select or create a client to begin</div>
        </div>
      ) : (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

          {/* Header */}
          <div style={{ borderBottom: "1px solid #181818", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#0d0d0d", flexShrink: 0 }}>
            <div>
              <div style={{ fontSize: 11, color: "#555", fontFamily: "sans-serif", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Active client</div>
              <div style={{ fontSize: 16, color: "#e0ddd5" }}>{activeClient.name}</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {STAGES.map(s => (
                <div key={s.id} onClick={() => setActiveStage(s.id)} title={s.name} style={{ width: 28, height: 28, borderRadius: "50%", background: activeStage === s.id ? "#1e1e1e" : "#141414", border: `2px solid ${getStageStatusColor(s.id)}`, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: getStageStatusColor(s.id), fontFamily: "sans-serif", fontWeight: 600, transition: "all 0.15s" }}>
                  {s.id}
                </div>
              ))}
            </div>
          </div>

          {/* Stage area */}
          <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>

            {/* Stage header */}
            <div style={{ padding: "16px 24px 12px", borderBottom: "1px solid #141414", flexShrink: 0 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: currentStageData?.color }} />
                    <div style={{ fontSize: 14, color: "#e0ddd5", fontWeight: 400 }}>Stage {activeStage}: {currentStageData?.name}</div>
                    <div style={{ fontSize: 10, color: getStageStatusColor(activeStage), fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>{getStageStatusLabel(activeStage)}</div>
                  </div>
                  <div style={{ fontSize: 11, color: "#555", fontFamily: "sans-serif", marginTop: 3, marginLeft: 18 }}>{currentStageData?.description}</div>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button onClick={() => setShowChat(p => !p)} style={{ background: showChat ? "#c8a96e22" : "#141414", color: showChat ? "#c8a96e" : "#666", border: `1px solid ${showChat ? "#c8a96e44" : "#222"}`, borderRadius: 4, padding: "5px 12px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif", letterSpacing: "0.06em" }}>
                    {showChat ? "Hide Chat" : "Chat"}
                  </button>
                  {activeStage > 1 && <button onClick={() => setActiveStage(activeStage - 1)} style={{ background: "#141414", color: "#888", border: "1px solid #222", borderRadius: 4, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif" }}>Back</button>}
                  {activeStage < 8 && stageStatus[activeStage] === "approved" && <button onClick={() => setActiveStage(activeStage + 1)} style={{ background: "#141414", color: "#888", border: "1px solid #222", borderRadius: 4, padding: "6px 14px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif" }}>Next Stage</button>}
                </div>
              </div>
            </div>

            {/* Stage content */}
            <div style={{ flex: 1, overflow: "hidden" }}>

              {/* Stage 1: Intake Bot */}
              {activeStage === 1 && (
                <div style={{ height: "100%" }}>
                  {stageStatus[1] === "approved" ? (
                    <div style={{ padding: 24 }}>
                      <div style={{ background: "#0d1a0d", border: "1px solid #1a2e1a", borderRadius: 8, padding: 16, marginBottom: 16 }}>
                        <div style={{ fontSize: 11, color: "#8fbc8f", fontFamily: "sans-serif", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>Intake complete and approved</div>
                        <div style={{ fontSize: 12, color: "#6a9a6a", fontFamily: "sans-serif" }}>The intake document has been saved. Proceed to Stage 2 to merge with your onboard notes.</div>
                      </div>
                      <div style={{ background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: 16, maxHeight: 400, overflowY: "auto" }}>
                        <div style={{ fontSize: 11, color: "#555", fontFamily: "monospace", whiteSpace: "pre-wrap", lineHeight: 1.8 }}>{stageOutputs[1]}</div>
                      </div>
                    </div>
                  ) : (
                    <IntakeChat onComplete={(doc) => void handleIntakeComplete(doc)} />
                  )}
                </div>
              )}

              {/* Stage 2: Merge */}
              {activeStage === 2 && (
                <div style={{ padding: 24, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
                  {stageStatus[2] !== "approved" && (
                    <div style={{ marginBottom: 20 }}>
                      <div style={{ fontSize: 11, color: "#888", fontFamily: "sans-serif", marginBottom: 8, letterSpacing: "0.05em", textTransform: "uppercase" }}>Onboard Notes (required)</div>
                      <textarea value={onboardNotes} onChange={e => setOnboardNotes(e.target.value)} placeholder="Paste your onboard call notes here — angle decision, mechanism name, avatar type, awareness level, strategic notes, any gaps from intake..." style={{ width: "100%", minHeight: 140, background: "#111", border: "1px solid #222", borderRadius: 6, padding: 14, fontSize: 13, color: "#ddd", resize: "vertical", boxSizing: "border-box", fontFamily: "Georgia, serif", lineHeight: 1.7 }} />
                      <div style={{ fontSize: 11, color: "#888", fontFamily: "sans-serif", marginBottom: 8, marginTop: 16, letterSpacing: "0.05em", textTransform: "uppercase" }}>Onboard Transcript (optional)</div>
                      <textarea value={transcript} onChange={e => setTranscript(e.target.value)} placeholder="Paste your onboard transcript here if you have one..." style={{ width: "100%", minHeight: 100, background: "#111", border: "1px solid #222", borderRadius: 6, padding: 14, fontSize: 13, color: "#ddd", resize: "vertical", boxSizing: "border-box", fontFamily: "Georgia, serif", lineHeight: 1.7 }} />
                      <button
                        onClick={() => void runStage(2)}
                        disabled={!canRunStage(2) || runningStage === 2} style={{ marginTop: 16, background: canRunStage(2) ? "#c8a96e" : "#1a1a1a", color: canRunStage(2) ? "#0a0a0a" : "#444", border: "none", borderRadius: 4, padding: "10px 24px", fontSize: 12, cursor: canRunStage(2) ? "pointer" : "not-allowed", fontFamily: "sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {runningStage === 2 ? "Merging..." : "Run Merge"}
                      </button>
                    </div>
                  )}
                  {(stageStatus[2] === "review" || stageStatus[2] === "approved") && (
                    <StageOutput
                      stageId={2}
                      output={stageOutputs[2]}
                      editingOutput={editingOutput}
                      setEditingOutput={setEditingOutput}
                      status={stageStatus[2]}
                      onApprove={() => void approveStage(2)}
                      onRerun={() => void runStage(2)}
                      onDraftPersist={persistStageDraft}
                    />
                  )}
                </div>
              )}

              {/* Stages 3-8: Generated outputs */}
              {activeStage >= 3 && (
                <div style={{ padding: 24, overflowY: "auto", height: "100%", boxSizing: "border-box" }}>
                  {!stageStatus[activeStage] && (
                    <div>
                      {activeStage === 3 && !stageStatus[4] && (
                        <div style={{ background: "#1a1600", border: "1px solid #2a2200", borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 12, color: "#aa9960", fontFamily: "sans-serif" }}>
                          Note: VSL Script (Stage 4) hasn't been generated yet. Headlines will be generated from the merged input only. You can regenerate after Stage 4 is approved.
                        </div>
                      )}
                      {!canRunStage(activeStage) && (
                        <div style={{ background: "#1a1010", border: "1px solid #2a1818", borderRadius: 6, padding: 12, marginBottom: 16, fontSize: 12, color: "#aa6060", fontFamily: "sans-serif" }}>
                          {activeStage === 5 || activeStage === 6 ? "Complete Stage 4 (VSL Script) first." : activeStage === 7 || activeStage === 8 ? "Complete Stages 2 (Merge) and 4 (VSL Script) first." : "Complete previous stages first."}
                        </div>
                      )}
                      <button
                        onClick={() => void runStage(activeStage)}
                        disabled={!canRunStage(activeStage) || runningStage === activeStage} style={{ background: canRunStage(activeStage) ? "#c8a96e" : "#1a1a1a", color: canRunStage(activeStage) ? "#0a0a0a" : "#444", border: "none", borderRadius: 4, padding: "10px 24px", fontSize: 12, cursor: canRunStage(activeStage) ? "pointer" : "not-allowed", fontFamily: "sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                        {runningStage === activeStage ? `Generating ${currentStageData?.name}...` : `Generate ${currentStageData?.name}`}
                      </button>
                    </div>
                  )}
                  {(stageStatus[activeStage] === "running") && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "#8ab4c8", fontFamily: "sans-serif", fontSize: 13 }}>
                      <div style={{ width: 16, height: 16, border: "2px solid #8ab4c8", borderTopColor: "transparent", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
                      Generating {currentStageData?.name}...
                    </div>
                  )}
                  {(stageStatus[activeStage] === "review" || stageStatus[activeStage] === "approved") && (
                    <StageOutput
                      stageId={activeStage}
                      output={stageOutputs[activeStage]}
                      editingOutput={editingOutput}
                      setEditingOutput={setEditingOutput}
                      status={stageStatus[activeStage]}
                      onApprove={() => void approveStage(activeStage)}
                      onRerun={() => void runStage(activeStage)}
                      onDraftPersist={persistStageDraft}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {showChat && activeClient && (
        <ChatPanel
          activeStage={activeStage}
          stageOutputs={stageOutputs}
          editingOutput={editingOutput}
          setEditingOutput={setEditingOutput}
          stageName={currentStageData?.name || ""}
        />
      )}
    </div>
  );
}

function ChatPanel({
  activeStage,
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

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

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
        editingOutput[activeStage] || stageOutputs[activeStage] || "";
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
    const current = editingOutput[activeStage] || stageOutputs[activeStage] || "";
    setEditingOutput((prev) => ({
      ...prev,
      [activeStage]: current + "\n\n--- CHAT SUGGESTION ---\n" + text,
    }));
  }

  return (
    <div style={{ width: 320, borderLeft: "1px solid #181818", display: "flex", flexDirection: "column", background: "#0d0d0d", flexShrink: 0 }}>
      <div style={{ padding: "14px 16px", borderBottom: "1px solid #181818" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.12em", color: "#555", textTransform: "uppercase", fontFamily: "sans-serif", marginBottom: 2 }}>Working on</div>
        <div style={{ fontSize: 13, color: "#c8a96e" }}>Stage {activeStage}: {stageName}</div>
        <div style={{ fontSize: 10, color: "#444", fontFamily: "sans-serif", marginTop: 4 }}>Ask me to tweak, rewrite, or improve any part of the current output. Changes apply to the editable area.</div>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "12px 14px", display: "flex", flexDirection: "column", gap: 12 }}>
        {messages.length === 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {["Make the category attack more aggressive", "Rewrite the hook for a more skeptical avatar", "The proof section needs more emotional detail", "Make the CTA feel less like a pitch", "Tighten the mechanism section"].map((s, i) => (
              <button key={i} onClick={() => { setInput(s); }} style={{ background: "#141414", border: "1px solid #1e1e1e", borderRadius: 6, padding: "8px 12px", fontSize: 11, color: "#777", cursor: "pointer", textAlign: "left", fontFamily: "sans-serif", lineHeight: 1.4 }}>
                {s}
              </button>
            ))}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start", gap: 4 }}>
            <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: "#444", fontFamily: "sans-serif" }}>
              {m.role === "user" ? "You" : "Claude"}
            </div>
            <div style={{ maxWidth: "95%", padding: "10px 12px", borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px", background: m.role === "user" ? "#1a1a1a" : "#141414", border: `1px solid ${m.role === "user" ? "#252525" : "#1e1e1e"}`, fontSize: 12, lineHeight: 1.65, color: m.role === "user" ? "#bbb" : "#ccc", whiteSpace: "pre-wrap" }}>
              {m.content}
            </div>
            {m.role === "assistant" && (
              <button onClick={() => applyToStage(m.content)} style={{ fontSize: 9, color: "#555", background: "none", border: "none", cursor: "pointer", fontFamily: "sans-serif", padding: "2px 0", textAlign: "left" }}>
                + append to stage output
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
            <div style={{ padding: "10px 12px", background: "#141414", border: "1px solid #1e1e1e", borderRadius: "10px 10px 10px 2px", display: "flex", gap: 4 }}>
              {[0,1,2].map(i => <div key={i} style={{ width: 5, height: 5, borderRadius: "50%", background: "#555", animation: "pulse 1.2s infinite", animationDelay: `${i*0.2}s` }} />)}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: "1px solid #181818", padding: "10px 14px", background: "#0a0a0a" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <textarea ref={textareaRef} value={input} onChange={handleInput} onKeyDown={handleKey} placeholder="Ask Claude to tweak anything..." rows={1} disabled={loading} style={{ flex: 1, background: "#141414", border: "1px solid #222", borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#ddd", resize: "none", outline: "none", fontFamily: "Georgia, serif", lineHeight: 1.5, height: 38, minHeight: 38, maxHeight: 120 }} />
          <button onClick={send} disabled={!input.trim() || loading} style={{ background: input.trim() && !loading ? "#c8a96e" : "#1a1a1a", color: input.trim() && !loading ? "#0a0a0a" : "#333", border: "none", borderRadius: 6, width: 36, height: 36, cursor: input.trim() && !loading ? "pointer" : "not-allowed", fontSize: 16, flexShrink: 0 }}>
            ↑
          </button>
        </div>
      </div>
    </div>
  );
}

function StageOutput({
  stageId,
  output,
  editingOutput,
  setEditingOutput,
  status,
  onApprove,
  onRerun,
  onDraftPersist,
}: StageOutputProps) {
  const [copied, setCopied] = useState(false);
  const currentEdit = editingOutput[stageId] ?? output;

  function copy() {
    navigator.clipboard.writeText(currentEdit);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, alignItems: "center" }}>
        {status === "review" && (
          <>
            <div style={{ fontSize: 11, color: "#c8a96e", fontFamily: "sans-serif", marginRight: 4 }}>Review and edit below, then approve to continue</div>
            <button onClick={onApprove} style={{ background: "#c8a96e", color: "#0a0a0a", border: "none", borderRadius: 4, padding: "7px 18px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif", fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase" }}>Approve</button>
            <button onClick={onRerun} style={{ background: "#141414", color: "#888", border: "1px solid #222", borderRadius: 4, padding: "7px 14px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif" }}>Regenerate</button>
          </>
        )}
        {status === "approved" && (
          <div style={{ fontSize: 11, color: "#8fbc8f", fontFamily: "sans-serif", letterSpacing: "0.08em", textTransform: "uppercase" }}>Approved</div>
        )}
        <button onClick={copy} style={{ background: "#141414", color: copied ? "#8fbc8f" : "#888", border: "1px solid #222", borderRadius: 4, padding: "7px 14px", fontSize: 11, cursor: "pointer", fontFamily: "sans-serif", marginLeft: "auto" }}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <textarea
        value={currentEdit}
        onChange={(e) =>
          setEditingOutput((prev) => ({ ...prev, [stageId]: e.target.value }))
        }
        onBlur={() => {
          if (status === "review" && onDraftPersist) {
            onDraftPersist(stageId, currentEdit);
          }
        }}
        readOnly={status === "approved"}
        style={{
          width: "100%",
          minHeight: 500,
          background: "#0d0d0d",
          border: `1px solid ${status === "approved" ? "#1a2e1a" : "#222"}`,
          borderRadius: 8,
          padding: 18,
          fontSize: 13,
          color: status === "approved" ? "#8ab88a" : "#ddd",
          resize: "vertical",
          boxSizing: "border-box",
          fontFamily: "Georgia, serif",
          lineHeight: 1.8,
        }}
      />
    </div>
  );
}
