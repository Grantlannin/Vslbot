"use client";

import {
  useState,
  useRef,
  useEffect,
  type ChangeEvent,
  type KeyboardEvent,
} from "react";
import { INTAKE_SYSTEM, INTAKE_DOC_PROMPT } from "@/lib/intake-prompts";
import { callClaude } from "@/lib/claude-client";

type ChatRole = "user" | "assistant";
type ChatMessage = { role: ChatRole; content: string };

function StandaloneIntakeChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [generatingDoc, setGeneratingDoc] = useState(false);
  const [doc, setDoc] = useState("");
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    void initChat();
  }, []);

  async function initChat() {
    setLoading(true);
    try {
      const text = await callClaude(INTAKE_SYSTEM, "I'm ready to begin.", 800);
      const clean = text.replace(/\[INTERVIEW_COMPLETE\]/g, "").trim();
      setMessages([{ role: "assistant", content: clean }]);
      if (text.includes("[INTERVIEW_COMPLETE]")) setDone(true);
    } catch {
      setMessages([
        { role: "assistant", content: "Connection error. Please refresh." },
      ]);
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
      const raw = await callClaude(
        INTAKE_SYSTEM,
        updated
          .map((m) =>
            `${m.role === "user" ? "CLIENT" : "ASSISTANT"}: ${m.content}`,
          )
          .join("\n\n"),
        800,
      );
      const clean = raw.replace(/\[INTERVIEW_COMPLETE\]/g, "").trim();
      const next: ChatMessage[] = [
        ...updated,
        { role: "assistant", content: clean },
      ];
      setMessages(next);
      if (raw.includes("[INTERVIEW_COMPLETE]")) setDone(true);
    } catch {
      setMessages([
        ...updated,
        { role: "assistant", content: "Error. Please try again." },
      ]);
    }
    setLoading(false);
  }

  async function generateDoc() {
    setGeneratingDoc(true);
    const transcript = messages
      .map((m) =>
        `${m.role === "user" ? "CLIENT" : "INTERVIEWER"}: ${m.content}`,
      )
      .join("\n\n");
    try {
      const text = await callClaude(
        INTAKE_DOC_PROMPT,
        `INTERVIEW TRANSCRIPT:\n\n${transcript}`,
        2000,
      );
      setDoc(text);
    } catch {
      setDoc("Error generating document. Please try again.");
    }
    setGeneratingDoc(false);
  }

  function copyDoc() {
    void navigator.clipboard.writeText(doc);
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        minHeight: 0,
        gap: 0,
      }}
    >
      <div
        style={{
          flex: 1,
          overflowY: "auto",
          padding: "20px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: m.role === "user" ? "flex-end" : "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#555",
                marginBottom: 4,
                fontFamily: "sans-serif",
              }}
            >
              {m.role === "user" ? "You" : "Intake Bot"}
            </div>
            <div
              style={{
                maxWidth: "85%",
                padding: "12px 16px",
                borderRadius:
                  m.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
                background: m.role === "user" ? "#1e1e1e" : "#161616",
                border: `1px solid ${m.role === "user" ? "#2a2a2a" : "#1e1e1e"}`,
                fontSize: 14,
                lineHeight: 1.7,
                color: m.role === "user" ? "#ccc" : "#ddd",
                whiteSpace: "pre-wrap",
              }}
            >
              {m.content}
            </div>
          </div>
        ))}
        {loading && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                fontSize: 10,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: "#555",
                marginBottom: 4,
                fontFamily: "sans-serif",
              }}
            >
              Intake Bot
            </div>
            <div
              style={{
                padding: "12px 16px",
                background: "#161616",
                border: "1px solid #1e1e1e",
                borderRadius: "12px 12px 12px 2px",
                display: "flex",
                gap: 5,
                alignItems: "center",
              }}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  style={{
                    width: 6,
                    height: 6,
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
        {done && !doc && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              padding: "24px 0",
              gap: 12,
            }}
          >
            <div
              style={{ fontSize: 11, color: "#555", fontFamily: "sans-serif" }}
            >
              Interview complete
            </div>
            <button
              type="button"
              onClick={() => void generateDoc()}
              disabled={generatingDoc}
              style={{
                background: generatingDoc ? "#1e1e1e" : "#c8a96e",
                color: generatingDoc ? "#555" : "#0a0a0a",
                border: "none",
                borderRadius: 4,
                padding: "11px 28px",
                fontSize: 12,
                fontWeight: 600,
                cursor: generatingDoc ? "not-allowed" : "pointer",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                fontFamily: "sans-serif",
              }}
            >
              {generatingDoc ? "Generating..." : "Generate Intake Document"}
            </button>
          </div>
        )}
        {doc && (
          <div
            style={{
              border: "1px solid #222",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: "#141414",
                padding: "14px 18px",
                borderBottom: "1px solid #222",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                flexWrap: "wrap",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  color: "#8fbc8f",
                  fontFamily: "sans-serif",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Intake document ready — copy and email it to us
              </div>
              <button
                type="button"
                onClick={copyDoc}
                style={{
                  background: "#1e1e1e",
                  color: copied ? "#8fbc8f" : "#aaa",
                  border: "1px solid #2a2a2a",
                  borderRadius: 4,
                  padding: "6px 14px",
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "sans-serif",
                }}
              >
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
            <div
              style={{
                padding: 20,
                background: "#0d0d0d",
                fontSize: 12,
                lineHeight: 1.8,
                color: "#bbb",
                whiteSpace: "pre-wrap",
                fontFamily: "monospace",
                maxHeight: "min(50vh, 420px)",
                overflowY: "auto",
              }}
            >
              {doc}
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      {!done && (
        <div
          style={{
            borderTop: "1px solid #1a1a1a",
            padding: "14px 20px",
            background: "#0a0a0a",
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
            <textarea
              ref={textareaRef}
              value={input}
              onChange={handleInput}
              onKeyDown={handleKey}
              placeholder="Type your answer..."
              rows={1}
              disabled={loading}
              style={{
                flex: 1,
                background: "#141414",
                border: "1px solid #222",
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 14,
                color: "#ddd",
                resize: "none",
                outline: "none",
                fontFamily: "Georgia, serif",
                lineHeight: 1.6,
                height: 44,
                minHeight: 44,
                maxHeight: 160,
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
                borderRadius: 8,
                width: 44,
                height: 44,
                cursor: input.trim() && !loading ? "pointer" : "not-allowed",
                fontSize: 18,
                flexShrink: 0,
              }}
            >
              ↑
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function IntakePage() {
  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        background: "#0a0a0a",
        color: "#e0ddd5",
        fontFamily: "Georgia, serif",
      }}
    >
      <style>{`
        * { box-sizing: border-box; }
        @keyframes pulse { 0%,100%{opacity:0.3;transform:scale(0.9)} 50%{opacity:1;transform:scale(1.1)} }
        textarea::placeholder{color:#444}
        textarea:focus{border-color:#333!important;outline:none}
        ::-webkit-scrollbar{width:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#222;border-radius:2px}
      `}</style>
      <header
        style={{
          padding: "16px 20px",
          borderBottom: "1px solid #181818",
          background: "#0d0d0d",
          flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 10,
            letterSpacing: "0.15em",
            color: "#555",
            textTransform: "uppercase",
            fontFamily: "sans-serif",
            marginBottom: 4,
          }}
        >
          Grant Systems
        </div>
        <h1
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 400,
            color: "#c8a96e",
          }}
        >
          VSL intake
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 12,
            color: "#666",
            fontFamily: "sans-serif",
            lineHeight: 1.5,
            maxWidth: 520,
          }}
        >
          Answer each question in the chat. When you finish, generate your intake
          document, copy it, and email it to us.
        </p>
      </header>
      <main
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          maxWidth: 720,
          width: "100%",
          margin: "0 auto",
          minHeight: 0,
        }}
      >
        <StandaloneIntakeChat />
      </main>
    </div>
  );
}
