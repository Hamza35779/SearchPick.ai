"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  DragEvent,
} from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProductListing {
  title: string;
  brand: string | null;
  store_name: string;
  price: number;
  shipping: number;
  delivery_days: number | null;
  warranty: string | null;
  url: string;
}

interface BuyingScore {
  overall_score: number;
  price_score: number;
  quality_score: number;
  trust_score: number;
  warranty_score: number;
  repairability_score: number;
  shipping_score: number;
  popularity_score: number;
  value_score: number;
  ai_confidence: number;
  final_recommendation: string;
  explanation: string;
  recommended_store?: string;
  recommended_url?: string;
  recommended_price?: number;
  recommended_image?: string | null;
}

interface AttachedFile {
  id: string;
  name: string;
  type: string;        // "image" | "csv" | "excel" | "docx" | "text"
  size: number;
  preview?: string;    // base64 data URL for images
  extracted_text: string;
  summary: string;
  status: "parsing" | "ready" | "error";
}

interface Message {
  id: string;
  sender: "user" | "ai";
  text: string;
  timestamp: Date;
  attachments?: Pick<AttachedFile, "name" | "type" | "summary">[];
}

type AgentStatus = { agent: string; status: string } | null;

// ─── Constants ────────────────────────────────────────────────────────────────

const SUGGESTED_QUERIES = [
  "Gaming laptop under $1200 with good battery",
  "Wireless noise-cancelling headphones under $300",
  "Standing desk for home office under $500",
  "Budget 4K monitor for video editing",
  "Mechanical keyboard for programming",
];

const SCORE_LABELS: { key: keyof BuyingScore; label: string; color: string }[] = [
  { key: "price_score",         label: "Price",          color: "#8b5cf6" },
  { key: "quality_score",       label: "Quality",        color: "#6366f1" },
  { key: "trust_score",         label: "Trust",          color: "#10b981" },
  { key: "warranty_score",      label: "Warranty",       color: "#f59e0b" },
  { key: "shipping_score",      label: "Shipping",       color: "#3b82f6" },
  { key: "value_score",         label: "Value",          color: "#a855f7" },
  { key: "repairability_score", label: "Repairability",  color: "#14b8a6" },
];

const STORE_ICONS: Record<string, string> = {
  Amazon: "🛒", eBay: "🏷️", BestBuy: "🔵", Walmart: "🟡", Daraz: "🟠", Default: "🏪",
};

const ALLOWED_EXTENSIONS = ".jpg,.jpeg,.png,.webp,.bmp,.tiff,.csv,.xlsx,.xls,.docx,.txt";

const FILE_ICONS: Record<string, string> = {
  image: "🖼️", csv: "📊", excel: "📗", docx: "📄", text: "📝", unknown: "📎",
};

const FILE_COLORS: Record<string, string> = {
  image: "#8b5cf6", csv: "#10b981", excel: "#22c55e", docx: "#3b82f6", text: "#a1a1aa", unknown: "#71717a",
};

function uid() {
  return Math.random().toString(36).slice(2, 9);
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function detectFileType(name: string): AttachedFile["type"] {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "bmp", "tiff"].includes(ext)) return "image";
  if (ext === "csv") return "csv";
  if (["xlsx", "xls"].includes(ext)) return "excel";
  if (ext === "docx") return "docx";
  return "text";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TypingIndicator() {
  return (
    <div style={{ display: "flex", justifyContent: "flex-start" }} className="msg-enter">
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        background: "rgba(19,19,26,0.95)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: "4px 18px 18px 18px",
        padding: "12px 16px",
      }}>
        {[0, 200, 400].map((delay) => (
          <span key={delay} style={{
            display: "inline-block", width: 7, height: 7, borderRadius: "50%",
            background: "#8b5cf6",
            animation: `bounce 1.2s ${delay}ms infinite`,
          }} />
        ))}
      </div>
    </div>
  );
}

function ScoreBar({ value, color }: { value: number; color: string }) {
  const [width, setWidth] = useState(0);
  useEffect(() => { const t = setTimeout(() => setWidth(value), 100); return () => clearTimeout(t); }, [value]);
  return (
    <div style={{ height: 5, background: "rgba(255,255,255,0.06)", borderRadius: 9999, overflow: "hidden", marginTop: 5 }}>
      <div style={{
        height: "100%", borderRadius: 9999,
        background: `linear-gradient(90deg, ${color}99, ${color})`,
        width: `${width}%`,
        transition: "width 1s cubic-bezier(0.22,1,0.36,1)",
      }} />
    </div>
  );
}

function ScoreRing({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(0);
  const radius = 40;
  const circ = 2 * Math.PI * radius;
  const offset = circ - (displayed / 100) * circ;
  useEffect(() => { const t = setTimeout(() => setDisplayed(value), 120); return () => clearTimeout(t); }, [value]);
  const color = value >= 85 ? "#10b981" : value >= 70 ? "#f59e0b" : "#ef4444";
  return (
    <div style={{ position: "relative", width: 96, height: 96 }}>
      <svg width="96" height="96" style={{ transform: "rotate(-90deg)", display: "block" }}>
        <circle cx="48" cy="48" r={radius} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={radius} fill="none" stroke={color} strokeWidth="8"
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.22,1,0.36,1)", filter: `drop-shadow(0 0 6px ${color}88)` }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <span className="font-mono" style={{ fontSize: 20, fontWeight: 700, color }}>{Math.round(displayed)}</span>
        <span style={{ fontSize: 9, color: "var(--text-muted)", letterSpacing: "0.06em" }}>SCORE</span>
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="glass" style={{ borderRadius: 16, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="skeleton" style={{ height: 14, width: "40%", borderRadius: 6 }} />
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
        {[...Array(6)].map((_, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="skeleton" style={{ height: 10, width: "55%", borderRadius: 4 }} />
            <div className="skeleton" style={{ height: 5, borderRadius: 999 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function FileChip({
  file,
  onRemove,
}: {
  file: AttachedFile;
  onRemove: (id: string) => void;
}) {
  const icon = FILE_ICONS[file.type] ?? FILE_ICONS.unknown;
  const color = FILE_COLORS[file.type] ?? FILE_COLORS.unknown;

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 8,
      padding: "6px 10px 6px 8px", borderRadius: 10,
      background: `${color}14`,
      border: `1px solid ${color}33`,
      maxWidth: 260,
    }}>
      {/* Image thumbnail or icon */}
      {file.type === "image" && file.preview ? (
        <img
          src={file.preview}
          alt={file.name}
          style={{ width: 32, height: 32, objectFit: "cover", borderRadius: 6, flexShrink: 0 }}
        />
      ) : (
        <span style={{ fontSize: 20, flexShrink: 0 }}>{icon}</span>
      )}

      <div style={{ flex: 1, overflow: "hidden" }}>
        <div style={{
          fontSize: 12, fontWeight: 600, color: "var(--text-primary)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {file.name}
        </div>
        <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
          {file.status === "parsing" ? "Parsing…" : file.status === "error" ? "⚠ Error" : formatBytes(file.size)}
        </div>
      </div>

      {file.status === "parsing" && (
        <span style={{
          width: 12, height: 12, borderRadius: "50%",
          border: "2px solid rgba(255,255,255,0.15)",
          borderTopColor: color,
          display: "inline-block",
          animation: "spin 0.7s linear infinite",
          flexShrink: 0,
        }} />
      )}

      <button
        onClick={() => onRemove(file.id)}
        style={{
          background: "none", border: "none", cursor: "pointer",
          color: "var(--text-muted)", padding: 0, fontSize: 14, lineHeight: 1,
          flexShrink: 0,
        }}
        title="Remove"
      >
        ✕
      </button>
    </div>
  );
}

// ─── Inline SVG Logo (SearchPick Logo) ───────────────────────────────────────
function SearchPickLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" width="34" height="34" className={className} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id="logo-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3b82f6" />
          <stop offset="60%" stopColor="#6366f1" />
          <stop offset="100%" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      {/* Dynamic S curve */}
      <path
        d="M 68,26 
           C 58,16  36,18  34,32 
           C 32,46  68,44  66,60 
           C 64,76  46,80  36,70"
        fill="none"
        stroke="url(#logo-grad)"
        strokeWidth="13"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Motion Trails on the left */}
      <line x1="12" y1="36" x2="22" y2="36" stroke="url(#logo-grad)" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="16" y1="46" x2="24" y2="46" stroke="url(#logo-grad)" strokeWidth="4.5" strokeLinecap="round" />
      <line x1="14" y1="56" x2="22" y2="56" stroke="url(#logo-grad)" strokeWidth="4.5" strokeLinecap="round" />
      {/* Magnifying Glass loop centered */}
      <circle cx="50" cy="46" r="11" fill="var(--bg-elevated)" stroke="url(#logo-grad)" strokeWidth="4.5" />
      <line x1="58" y1="54" x2="72" y2="68" stroke="url(#logo-grad)" strokeWidth="5.5" strokeLinecap="round" />
      {/* Sparkle Star inside loop */}
      <path d="M50 40 L51.5 44.5 L56 46 L51.5 47.5 L50 52 L48.5 47.5 L44 46 L48.5 44.5 Z" fill="#6366f1" />
    </svg>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SearchPickDashboard() {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState<Message[]>([{
    id: uid(), sender: "ai", timestamp: new Date(),
    text: "Hello! I'm SearchPick.ai — your expert commerce AI. Describe any product need in natural language, or upload a file (image, CSV, Excel, Word doc, scanned product photo) and I'll search every marketplace, analyze reviews, and deliver a decisive recommendation.",
  }]);
  const [products, setProducts] = useState<ProductListing[]>([]);
  const [score, setScore] = useState<BuyingScore | null>(null);
  const [agentStatus, setAgentStatus] = useState<AgentStatus>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [activeTab, setActiveTab] = useState<"score" | "comparison">("score");
  const [attachedFiles, setAttachedFiles] = useState<AttachedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLightTheme, setIsLightTheme] = useState(false);

  useEffect(() => {
    if (typeof document !== "undefined") {
      if (isLightTheme) {
        document.documentElement.classList.add("light");
      } else {
        document.documentElement.classList.remove("light");
      }
    }
  }, [isLightTheme]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // ── WebSocket ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const isClient = typeof window !== "undefined";
    const host = isClient ? window.location.host : "localhost:8000";
    // If frontend is running on Next.js dev port 3000, point to backend port 8000
    const finalHost = host.includes(":3000") ? host.replace(":3000", ":8000") : host;
    const protocol = isClient && window.location.protocol === "https:" ? "wss:" : "ws:";
    
    const socket = new WebSocket(`${protocol}//${finalHost}/api/v1/chat/ws/session_dev`);
    socket.onopen = () => setIsConnected(true);
    socket.onclose = () => setIsConnected(false);
    socket.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === "agent_state") {
        setAgentStatus({ agent: data.agent, status: data.status });
      } else if (data.type === "search_results") {
        setProducts(data.products);
        setActiveTab("comparison");
      } else if (data.type === "final_recommendation") {
        setScore(data.buying_score);
        setIsLoading(false);
        setAgentStatus(null);
        setActiveTab("score");
        setMessages((prev) => [...prev, {
          id: uid(), sender: "ai", timestamp: new Date(), text: data.explanation,
        }]);
      } else if (data.type === "error") {
        setIsLoading(false);
        setAgentStatus(null);
        setMessages((prev) => [...prev, {
          id: uid(), sender: "ai", timestamp: new Date(), text: `⚠️ ${data.message}`,
        }]);
      }
    };
    setWs(socket);
    return () => socket.close();
  }, []);

  // ── Auto-scroll ──────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // ── File upload handler ──────────────────────────────────────────────────────
  const processFile = useCallback(async (rawFile: File) => {
    const id = uid();
    const type = detectFileType(rawFile.name);
    let preview: string | undefined;

    // Generate image thumbnail client-side immediately
    if (type === "image") {
      preview = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.readAsDataURL(rawFile);
      });
    }

    // Add chip in "parsing" state
    const stub: AttachedFile = {
      id, name: rawFile.name, type, size: rawFile.size,
      preview, extracted_text: "", summary: "", status: "parsing",
    };
    setAttachedFiles((prev) => [...prev, stub]);

    // Upload to backend for parsing
    try {
      const isClient = typeof window !== "undefined";
      const host = isClient ? window.location.host : "localhost:8000";
      const finalHost = host.includes(":3000") ? host.replace(":3000", ":8000") : host;
      const protocol = isClient ? window.location.protocol : "http:";
      
      const form = new FormData();
      form.append("file", rawFile);
      const res = await fetch(`${protocol}//${finalHost}/api/v1/upload`, { method: "POST", body: form });
      if (!res.ok) throw new Error(await res.text());
      const parsed = await res.json();
      setAttachedFiles((prev) =>
        prev.map((f) =>
          f.id === id
            ? { ...f, extracted_text: parsed.extracted_text ?? "", summary: parsed.summary ?? "", status: "ready" }
            : f
        )
      );
    } catch {
      setAttachedFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "error" } : f))
      );
    }
  }, []);

  const handleFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      list.forEach((f) => processFile(f));
    },
    [processFile]
  );

  // ── Drag-and-drop ────────────────────────────────────────────────────────────
  const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
    if (!chatContainerRef.current?.contains(e.relatedTarget as Node)) setIsDragging(false);
  };
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  // ── Send message ─────────────────────────────────────────────────────────────
  const handleSend = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      const readyFiles = attachedFiles.filter((f) => f.status === "ready");
      if ((!trimmed && readyFiles.length === 0) || !ws || ws.readyState !== WebSocket.OPEN) return;

      const fileContext = readyFiles.map((f) => `[${f.name}]\n${f.extracted_text}`).join("\n\n---\n\n");
      const displayText = trimmed || `Analyze the attached ${readyFiles.length > 1 ? "files" : "file"}.`;

      setMessages((prev) => [...prev, {
        id: uid(), sender: "user", timestamp: new Date(), text: displayText,
        attachments: readyFiles.map((f) => ({ name: f.name, type: f.type, summary: f.summary })),
      }]);

      setProducts([]);
      setScore(null);
      setSelectedProduct(null);
      setIsLoading(true);
      setAgentStatus({ agent: "PlannerAgent", status: "Analyzing request…" });
      setAttachedFiles([]);

      ws.send(JSON.stringify({ message: displayText, file_context: fileContext }));
      setQuery("");
      inputRef.current?.focus();
    },
    [ws, attachedFiles]
  );

  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); handleSend(query); };

  const removeFile = (id: string) => setAttachedFiles((prev) => prev.filter((f) => f.id !== id));

  const lowestPrice = products.length ? Math.min(...products.map((p) => p.price + p.shipping)) : null;
  const hasPendingFiles = attachedFiles.some((f) => f.status === "parsing");
  const canSend = !isLoading && !hasPendingFiles && (query.trim().length > 0 || attachedFiles.some((f) => f.status === "ready"));

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", position: "relative", zIndex: 1 }}>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="glass" style={{
        position: "sticky", top: 0, zIndex: 50,
        border: "none", borderBottom: "1px solid var(--border)",
        padding: "13px 28px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <SearchPickLogo />
          <span style={{
            fontSize: 19, fontWeight: 700, letterSpacing: "-0.02em",
            background: "linear-gradient(135deg,#a78bfa,#818cf8)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>SearchPick.ai</span>
          <span className="font-mono" style={{
            fontSize: 10, padding: "3px 8px", borderRadius: 6,
            background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)",
            color: "#a78bfa", letterSpacing: "0.08em", textTransform: "uppercase" as const,
          }}>Commerce Engine</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {/* Theme Toggle Switch */}
          <button
            onClick={() => setIsLightTheme((prev) => !prev)}
            title="Toggle color theme"
            style={{
              background: "rgba(255,255,255,0.05)",
              border: "1px solid var(--border)",
              borderRadius: "50%",
              width: 32,
              height: 32,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              color: "var(--text-primary)",
              fontSize: 14,
              transition: "all 0.2s",
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = "rgba(255,255,255,0.05)"; }}
          >
            {isLightTheme ? "🌙" : "☀️"}
          </button>

          {/* Live agent badge */}
          {agentStatus && (
            <div style={{
              display: "flex", alignItems: "center", gap: 8,
              padding: "5px 12px", borderRadius: 9999,
              background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.25)",
              fontSize: 11, fontFamily: "'JetBrains Mono', monospace",
            }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#8b5cf6", boxShadow: "0 0 6px #8b5cf6", animation: "bounce 1s infinite alternate" }} />
              <span style={{ color: "#a78bfa", fontWeight: 600 }}>{agentStatus.agent}</span>
              <span style={{ color: "var(--text-muted)" }}>→</span>
              <span style={{ color: "var(--text-secondary)" }}>{agentStatus.status}</span>
            </div>
          )}

          {/* Connection status */}
          <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11, color: "var(--text-muted)" }}>
            <div style={{ position: "relative", width: 8, height: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: "50%",
                background: isConnected ? "#10b981" : "#ef4444",
                boxShadow: isConnected ? "0 0 8px #10b981" : "none",
              }} />
              {isConnected && (
                <div style={{
                  position: "absolute", inset: -3, borderRadius: "50%",
                  border: "2px solid #10b981", animation: "ring-pulse 1.8s ease-out infinite",
                }} />
              )}
            </div>
            <span className="font-mono">{isConnected ? "NODE ACTIVE" : "DISCONNECTED"}</span>
          </div>
        </div>
      </header>

      {/* ── Main Layout ─────────────────────────────────────────────────────── */}
      <main style={{
        flex: 1, display: "flex", gap: 20, padding: "20px 24px",
        maxWidth: 1400, width: "100%", margin: "0 auto", alignItems: "flex-start",
      }}>

        {/* ── LEFT: Chat + Upload Panel ────────────────────────────────────── */}
        <section
          ref={chatContainerRef}
          className="glass"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          style={{
            flex: 1, display: "flex", flexDirection: "column",
            borderRadius: 18, overflow: "hidden",
            minHeight: "calc(100vh - 122px)",
            maxHeight: "calc(100vh - 122px)",
            position: "relative",
            border: isDragging ? "1px solid rgba(139,92,246,0.6)" : "1px solid var(--border)",
            transition: "border-color 0.2s",
          }}
        >
          {/* Drag overlay */}
          {isDragging && (
            <div style={{
              position: "absolute", inset: 0, zIndex: 20,
              background: "rgba(139,92,246,0.08)",
              backdropFilter: "blur(4px)",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 12,
              border: "2px dashed rgba(139,92,246,0.5)",
              borderRadius: 18, pointerEvents: "none",
            }}>
              <div style={{ fontSize: 48 }}>📂</div>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600, color: "#a78bfa" }}>
                Drop files to attach
              </p>
              <p style={{ margin: 0, fontSize: 13, color: "var(--text-muted)" }}>
                Images · CSV · Excel · Word docs · Scanned photos
              </p>
            </div>
          )}

          {/* Panel header */}
          <div style={{
            padding: "13px 18px", borderBottom: "1px solid var(--border)",
            background: "rgba(0,0,0,0.2)",
            display: "flex", alignItems: "center", justifyContent: "space-between",
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>AI Decision Room</span>
              {messages.length > 1 && (
                <span className="font-mono" style={{
                  fontSize: 10, padding: "2px 7px", borderRadius: 9999,
                  background: "rgba(255,255,255,0.05)", color: "var(--text-muted)",
                }}>
                  {messages.length - 1} exchange{messages.length > 2 ? "s" : ""}
                </span>
              )}
            </div>
            {/* Upload hint button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "5px 11px", borderRadius: 9999,
                background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)",
                color: "#a78bfa", fontSize: 11, fontWeight: 600, cursor: "pointer",
                transition: "all 0.18s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.2)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.1)"; }}
            >
              📎 Attach File
            </button>
          </div>

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "18px", display: "flex", flexDirection: "column", gap: 12 }}>
            {messages.map((msg) => (
              <div key={msg.id} className="msg-enter" style={{ display: "flex", justifyContent: msg.sender === "user" ? "flex-end" : "flex-start" }}>
                {msg.sender === "ai" && (
                  <div style={{
                    width: 28, height: 28, borderRadius: 9, flexShrink: 0,
                    background: "linear-gradient(135deg,#7c3aed,#6366f1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 13, marginRight: 8, marginTop: 2, boxShadow: "0 0 12px rgba(139,92,246,0.3)",
                  }}>⚡</div>
                )}
                <div style={{ maxWidth: "80%", display: "flex", flexDirection: "column", gap: 6, alignItems: msg.sender === "user" ? "flex-end" : "flex-start" }}>
                  {/* Attachment chips on user messages */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {msg.attachments.map((a, i) => {
                        const color = FILE_COLORS[a.type] ?? FILE_COLORS.unknown;
                        return (
                          <div key={i} style={{
                            display: "flex", alignItems: "center", gap: 5,
                            padding: "4px 9px", borderRadius: 8,
                            background: `${color}18`, border: `1px solid ${color}30`,
                            fontSize: 11, color: "var(--text-secondary)",
                          }}>
                            <span>{FILE_ICONS[a.type] ?? FILE_ICONS.unknown}</span>
                            <span>{a.name}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  <div style={{
                    padding: "11px 15px",
                    borderRadius: msg.sender === "user" ? "18px 18px 4px 18px" : "4px 18px 18px 18px",
                    background: msg.sender === "user"
                      ? "linear-gradient(135deg, #7c3aed, #6366f1)"
                      : "rgba(19,19,26,0.95)",
                    border: msg.sender === "user"
                      ? "1px solid rgba(139,92,246,0.4)"
                      : "1px solid rgba(255,255,255,0.06)",
                    color: "var(--text-primary)",
                    fontSize: 13.5, lineHeight: 1.65,
                    boxShadow: msg.sender === "user" ? "0 4px 20px rgba(139,92,246,0.25)" : "0 2px 12px rgba(0,0,0,0.3)",
                  }}>
                    <p style={{ margin: 0 }}>{msg.text}</p>
                    <span style={{
                      display: "block", marginTop: 5, fontSize: 10,
                      color: msg.sender === "user" ? "rgba(255,255,255,0.35)" : "var(--text-muted)",
                      fontFamily: "'JetBrains Mono', monospace",
                    }}>
                      {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </div>
              </div>
            ))}

            {isLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested queries (idle state) */}
          {messages.length === 1 && !isLoading && (
            <div style={{ padding: "0 18px 12px", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {SUGGESTED_QUERIES.map((q) => (
                <button key={q} className="chip" onClick={() => handleSend(q)}>
                  🔍 {q}
                </button>
              ))}
            </div>
          )}

          {/* Attached file chips */}
          {attachedFiles.length > 0 && (
            <div style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--border)",
              background: "rgba(0,0,0,0.15)",
              display: "flex", flexWrap: "wrap", gap: 8,
            }}>
              {attachedFiles.map((f) => (
                <FileChip key={f.id} file={f} onRemove={removeFile} />
              ))}
            </div>
          )}

          {/* Upload type hints (only when no files attached yet) */}
          {attachedFiles.length === 0 && (
            <div style={{
              padding: "8px 18px",
              display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap",
              borderTop: "1px solid rgba(255,255,255,0.04)",
            }}>
              {[
                { icon: "🖼️", label: "Product photo" },
                { icon: "📊", label: "CSV price list" },
                { icon: "📗", label: "Excel catalog" },
                { icon: "📄", label: "Word spec doc" },
                { icon: "🗒️", label: "Scanned image" },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => fileInputRef.current?.click()}
                  style={{
                    display: "flex", alignItems: "center", gap: 5,
                    padding: "4px 10px", borderRadius: 9999,
                    background: "rgba(255,255,255,0.03)",
                    border: "1px solid rgba(255,255,255,0.06)",
                    color: "var(--text-muted)", fontSize: 11, cursor: "pointer",
                    transition: "all 0.18s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.08)"; (e.currentTarget as HTMLElement).style.color = "#a78bfa"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.03)"; (e.currentTarget as HTMLElement).style.color = "var(--text-muted)"; }}
                >
                  {item.icon} {item.label}
                </button>
              ))}
            </div>
          )}

          {/* Input bar */}
          <form onSubmit={handleSubmit} style={{
            padding: "12px 16px",
            borderTop: "1px solid var(--border)",
            background: "rgba(0,0,0,0.25)",
            display: "flex", gap: 8, alignItems: "center",
          }}>
            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={ALLOWED_EXTENSIONS}
              style={{ display: "none" }}
              onChange={(e) => { if (e.target.files) { handleFiles(e.target.files); e.target.value = ""; } }}
            />

            {/* Attach button */}
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              title="Attach file"
              style={{
                width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 18, cursor: "pointer", transition: "all 0.18s",
              }}
              onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(139,92,246,0.15)"; (e.currentTarget as HTMLElement).style.borderColor = "rgba(139,92,246,0.4)"; }}
              onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "rgba(255,255,255,0.04)"; (e.currentTarget as HTMLElement).style.borderColor = "var(--border)"; }}
            >
              📎
            </button>

            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              disabled={isLoading}
              placeholder={attachedFiles.length > 0 ? "Add a message or just send the file…" : "Describe your product or procurement need…"}
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: "1px solid var(--border)",
                borderRadius: 12, padding: "11px 15px",
                fontSize: 13.5, color: "var(--text-primary)",
                outline: "none", fontFamily: "inherit",
                transition: "border-color 0.2s",
              }}
              onFocus={(e) => { (e.target as HTMLInputElement).style.borderColor = "rgba(139,92,246,0.6)"; }}
              onBlur={(e) => { (e.target as HTMLInputElement).style.borderColor = "var(--border)"; }}
            />

            <button
              type="submit"
              className="btn-primary"
              disabled={!canSend}
              style={{
                padding: "11px 20px", borderRadius: 12, fontSize: 13.5,
                display: "flex", alignItems: "center", gap: 6,
                opacity: canSend ? 1 : 0.4,
                cursor: canSend ? "pointer" : "not-allowed",
                flexShrink: 0,
              }}
            >
              {isLoading ? (
                <span style={{
                  width: 14, height: 14, borderRadius: "50%",
                  border: "2px solid rgba(255,255,255,0.25)",
                  borderTopColor: "#fff", display: "inline-block",
                  animation: "spin 0.7s linear infinite",
                }} />
              ) : "⚡"}
              {isLoading ? "Analyzing…" : "Analyze"}
            </button>
          </form>
        </section>

        {/* ── RIGHT: Decision Dashboard ─────────────────────────────────────── */}
        <section style={{ width: 420, flexShrink: 0, display: "flex", flexDirection: "column", gap: 14 }}>

          {(score || products.length > 0) && (
            <div style={{
              display: "flex", background: "rgba(255,255,255,0.04)",
              borderRadius: 12, padding: 4, gap: 3,
              border: "1px solid var(--border)",
            }}>
              {(["score", "comparison"] as const).map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)} style={{
                  flex: 1, padding: "8px 0", borderRadius: 9, fontSize: 12,
                  fontWeight: 600, border: "none", cursor: "pointer", transition: "all 0.2s",
                  background: activeTab === tab ? "linear-gradient(135deg,#7c3aed,#6366f1)" : "transparent",
                  color: activeTab === tab ? "#fff" : "var(--text-muted)",
                  boxShadow: activeTab === tab ? "0 2px 12px rgba(139,92,246,0.35)" : "none",
                }}>
                  {tab === "score" ? "🎯 Buying Score" : "📊 Comparison"}
                </button>
              ))}
            </div>
          )}

          {/* Score tab */}
          {activeTab === "score" && (
            <>
              {isLoading && !score && <SkeletonCard />}
              {score && (
                <div className="glass msg-enter" style={{ borderRadius: 18, padding: 22, display: "flex", flexDirection: "column", gap: 20 }}>
                  <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
                    <ScoreRing value={score.overall_score} />
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", marginBottom: 4, textTransform: "uppercase" as const }}>Top Pick</div>
                      <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: "#c4b5fd", lineHeight: 1.4 }}>{score.final_recommendation}</p>
                      
                      {/* Real platform store info + links */}
                      <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}>
                          {STORE_ICONS[score.recommended_store || ""] ?? STORE_ICONS.Default} {score.recommended_store}
                        </span>
                        {score.recommended_price && score.recommended_price > 0 ? (
                          <span className="font-mono" style={{ fontSize: 13, fontWeight: 700, color: "#a78bfa" }}>
                            ${score.recommended_price.toFixed(2)}
                          </span>
                        ) : null}
                        {score.recommended_url && (
                          <a
                            href={score.recommended_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              fontSize: 11, padding: "2px 8px", borderRadius: 6,
                              background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                              border: "1px solid rgba(139,92,246,0.3)",
                              color: "#fff", textDecoration: "none",
                              fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 3
                            }}
                          >
                            🌐 View Link
                          </a>
                        )}
                      </div>

                      <div style={{ marginTop: 8 }}>
                        <span style={{
                          fontSize: 10, padding: "3px 8px", borderRadius: 9999,
                          background: "rgba(16,185,129,0.12)", border: "1px solid rgba(16,185,129,0.25)", color: "#34d399",
                        }}>{Math.round(score.ai_confidence * 100)}% AI Confidence</span>
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                    {SCORE_LABELS.map(({ key, label, color }) => {
                      const val = score[key] as number;
                      return (
                        <div key={key}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{label}</span>
                            <span className="font-mono" style={{ fontSize: 11, color, fontWeight: 600 }}>{Math.round(val)}</span>
                          </div>
                          <ScoreBar value={val} color={color} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(139,92,246,0.07)", border: "1px solid rgba(139,92,246,0.15)", fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                    <span style={{ color: "#a78bfa", fontWeight: 600 }}>AI Rationale: </span>{score.explanation}
                  </div>

                  {/* Sourced platform links list */}
                  {products.length > 0 && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 4 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 12, fontWeight: 600, color: "var(--text-primary)", letterSpacing: "0.03em" }}>
                        SOURCED PLATFORM LINKS
                      </h4>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {products.map((prod, idx) => {
                          const icon = STORE_ICONS[prod.store_name] ?? STORE_ICONS.Default;
                          return (
                            <div
                              key={idx}
                              style={{
                                display: "flex", alignItems: "center", justifyContent: "space-between",
                                padding: "8px 10px", borderRadius: 8,
                                background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)",
                                fontSize: 12,
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "center", gap: 6, overflow: "hidden", marginRight: 10 }}>
                                <span style={{ fontSize: 14, flexShrink: 0 }}>{icon}</span>
                                <span style={{ fontWeight: 600, color: "var(--text-secondary)", flexShrink: 0 }}>
                                  {prod.store_name}
                                </span>
                                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>•</span>
                                <span
                                  style={{
                                    color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis",
                                    whiteSpace: "nowrap"
                                  }}
                                  title={prod.title}
                                >
                                  {prod.title}
                                </span>
                              </div>
                              <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                                <span className="font-mono" style={{ color: "#a78bfa", fontWeight: 600 }}>
                                  ${prod.price.toFixed(2)}
                                </span>
                                {prod.url && (
                                  <a
                                    href={prod.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    style={{
                                      fontSize: 10, padding: "3px 8px", borderRadius: 6,
                                      background: "rgba(255,255,255,0.06)",
                                      border: "1px solid var(--border)",
                                      color: "var(--text-primary)", textDecoration: "none",
                                      fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 2
                                    }}
                                  >
                                    Visit Store ↗
                                  </a>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
              {!isLoading && !score && (
                <div className="glass" style={{ borderRadius: 18, padding: 40, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 14, minHeight: 280 }}>
                  <div style={{ width: 56, height: 56, borderRadius: 16, background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>⚡</div>
                  <div>
                    <h4 style={{ margin: "0 0 8px", fontSize: 14, fontWeight: 600 }}>SearchPick Decision Hub</h4>
                    <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)", maxWidth: 250, lineHeight: 1.65 }}>
                      Your buying score, review analysis, and AI recommendation will appear here.
                    </p>
                  </div>
                  {/* File type hints in empty state */}
                  <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 4 }}>
                    {["🖼️ Image", "📊 CSV", "📗 Excel", "📄 Word"].map((label) => (
                      <span key={label} style={{
                        fontSize: 11, padding: "4px 10px", borderRadius: 9999,
                        background: "rgba(255,255,255,0.04)", border: "1px solid var(--border)",
                        color: "var(--text-muted)",
                      }}>{label}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Comparison tab */}
          {activeTab === "comparison" && (
            <>
              {isLoading && !products.length && <SkeletonCard />}
              {products.length > 0 && (
                <div className="glass msg-enter" style={{ borderRadius: 18, padding: 20, display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h3 style={{ margin: 0, fontSize: 13.5, fontWeight: 600, color: "var(--text-primary)" }}>Marketplace Results</h3>
                    <span className="font-mono" style={{ fontSize: 11, color: "var(--text-muted)" }}>{products.length} listing{products.length !== 1 ? "s" : ""}</span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {products.map((prod, i) => {
                      const total = prod.price + prod.shipping;
                      const isBest = total === lowestPrice;
                      const isSelected = selectedProduct === i;
                      const icon = STORE_ICONS[prod.store_name] ?? STORE_ICONS.Default;
                      return (
                        <div
                          key={i}
                          onClick={() => setSelectedProduct(isSelected ? null : i)}
                          style={{
                            padding: "12px 14px", borderRadius: 12, cursor: "pointer", transition: "all 0.2s",
                            border: isSelected ? "1px solid rgba(139,92,246,0.5)" : isBest ? "1px solid rgba(16,185,129,0.3)" : "1px solid var(--border)",
                            background: isSelected ? "rgba(139,92,246,0.07)" : "rgba(255,255,255,0.02)",
                            boxShadow: isSelected ? "0 0 20px rgba(139,92,246,0.12)" : "none",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                              <span style={{ fontSize: 15 }}>{icon}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary)" }}>{prod.store_name}</span>
                              {isBest && (
                                <span style={{
                                  fontSize: 9, padding: "2px 6px", borderRadius: 9999,
                                  background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)",
                                  color: "#34d399", fontWeight: 700, letterSpacing: "0.05em",
                                }}>BEST</span>
                              )}
                            </div>
                            <span className="font-mono" style={{ fontSize: 15, fontWeight: 700, color: "#a78bfa" }}>${prod.price.toFixed(2)}</span>
                          </div>
                          <p style={{ margin: "0 0 0", fontSize: 11.5, color: "var(--text-secondary)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {prod.title}
                          </p>
                          {isSelected && (
                            <div className="msg-enter" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border)" }}>
                              {([["Shipping", prod.shipping === 0 ? "Free" : `$${prod.shipping.toFixed(2)}`], ["Delivery", prod.delivery_days ? `${prod.delivery_days} days` : "N/A"], ["Warranty", prod.warranty ?? "N/A"], ["Total", `$${total.toFixed(2)}`]] as [string, string][]).map(([label, value]) => (
                                <div key={label}>
                                  <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 2 }}>{label}</div>
                                  <div className="font-mono" style={{ fontSize: 12, color: "var(--text-secondary)", fontWeight: 500 }}>{value}</div>
                                </div>
                              ))}
                              {prod.url && (
                                <div style={{ gridColumn: "span 2", marginTop: 6 }}>
                                  <a
                                    href={prod.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    style={{
                                      display: "block", textAlign: "center",
                                      padding: "6px 12px", borderRadius: 8,
                                      background: "linear-gradient(135deg, #7c3aed, #6366f1)",
                                      color: "#fff", textDecoration: "none",
                                      fontSize: 11.5, fontWeight: 600,
                                    }}
                                  >
                                    🌐 Open Retailer Link
                                  </a>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p style={{ margin: 0, fontSize: 11, color: "var(--text-muted)", textAlign: "center" as const }}>Tap any listing to expand details</p>
                </div>
              )}
            </>
          )}
        </section>
      </main>

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes bounce  { 0%,80%,100%{transform:translateY(0);opacity:.5} 40%{transform:translateY(-6px);opacity:1} }
        @keyframes ring-pulse { 0%{opacity:.8;transform:scale(1)} 100%{opacity:0;transform:scale(2.2)} }
      `}</style>
    </div>
  );
}
