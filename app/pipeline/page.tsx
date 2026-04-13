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

// ─── PROMPTS (baked in, invisible to users) ───────────────────────────────────

const MERGE_PROMPT = `You are preparing a final input document for a VSL copywriter. You have been given up to three sources: a pre-call intake document, an onboard call note template, and optionally an onboard transcript.

SOURCE PRIORITY:
- Onboard notes win on all strategic decisions (offer type, angle, mechanism name, avatar type, awareness level)
- Transcript wins on emotional detail and specifics
- Intake is the baseline for everything else not covered above

MERGE RULES:
- Use richer version when sources add detail
- Use transcript version when it contradicts intake, note the discrepancy
- Execute exactly against strategic decisions in onboard notes
- Flag anything still missing or vague in GAPS section
- Use client's exact words wherever possible
- Every proof point needs: name, specific before, specific after with numbers, timeframe, unique factor

Output in this exact structure:

---
VSL INPUT DOCUMENT - FINAL
---

OFFER TYPE
[B2B / Lifestyle / Mixed]

OFFER STATEMENT
[One sentence: who / result / timeframe / mechanism]

AVATAR
Demographics: [specific]
Core contradiction: [successful at X, failing at Y]
Day in their life: [detailed emotional picture]
Failed attempts: [what they tried / why each failed]
What they tell themselves: [their justification for staying stuck]
Trigger moment: [what breaks right before they reach out]
Hidden fear: [the one they'd never say out loud]
Real motivation: [what they actually want but wouldn't admit]
Primary life constraint: [what makes standard solutions not work]

MECHANISM
System name: [final name from onboard notes]
Overview: [one sentence]
Components:
[Name]: [what it is] / [what it is NOT] / [why it matters]
[repeat for each]
How mechanism handles constraint: [specific]
Core differentiator: [what makes this the only logical choice]

STORY & CREDIBILITY
Beat 1: [before state - emotional reality]
Beat 2: [discovery / turning point]
Beat 3: [what they built and what happened]
Authority type: [experiential / institutional / results-based]
Credibility markers: [specific, nameable]

AVATAR TYPE
Primary: [analytical / identity-driven / skeptical]
Secondary: [if applicable]
Gender: [male / female / mixed]
Notes: [decision-making patterns, what they respond to]

AWARENESS LEVEL
Level: [problem-aware / solution-aware / product-aware]
Evidence: [what supports this]

PROOF STACK
[Name]: Before - [specific] | After - [specific with numbers] | Time - [timeframe] | Unique - [what made their situation difficult]
[repeat for each client]

URGENCY TYPE
Primary: [compounding trajectory / cost quantification / two-path close / window frame]
Specific cost: [what gets worse the longer they wait]

SALES ANGLE
Core reframe: [why everything else fails at a design level]
Key belief shift: [what avatar needs to believe]
Contrarian argument: [unique insight or differentiating position]
Strategic notes: [anything unique flagged by strategist]

GAPS REMAINING
[List every missing piece, which section it affects, what to do]`;

const HEADLINES_PROMPT = `You are an expert direct response copywriter specializing in high-ticket VSL headlines for cold traffic paid ads. Read both source documents and generate 5 VSL headline options.

Each headline must: speak directly to the avatar using their exact emotional language, enter the conversation already in their head, create identification or curiosity that makes clicking play inevitable, be specific enough to filter the wrong person, never use hype or vague language.

Generate exactly one headline of each type:

HEADLINE 1 - DIRECT PROBLEM/SOLUTION
States the exact problem and promises a specific answer. Avatar reads it and thinks "that's exactly what I'm dealing with."

HEADLINE 2 - REFRAME  
Leads with the core reframe from the VSL. Removes self-blame, redirects at industry. Pulls from the category attack.

HEADLINE 3 - CREDIBILITY-LED
Leads with the coach's most powerful credibility marker attached to a promise of what the video reveals.

HEADLINE 4 - OUTCOME-LED
Sells the emotional outcome - the feeling of the after state. Pulls from real motivation and fantasy outcome.

HEADLINE 5 - CONTRARIAN
Leads with the most surprising truth from the VSL. Contradicts what the avatar has been told.

RULES:
- Every headline specific to this avatar/niche only
- Use avatar's exact emotional language from the VSL
- Never use: journey, revolutionary, groundbreaking, game-changer
- After each headline write one sentence on awareness level optimized for and why

OUTPUT FORMAT:
HEADLINE 1 - DIRECT PROBLEM/SOLUTION
[Headline]
Optimized for: [awareness level] - [one sentence why it works]

HEADLINE 2 - REFRAME
[Headline]
Optimized for: [awareness level] - [one sentence why it works]

HEADLINE 3 - CREDIBILITY-LED
[Headline]
Optimized for: [awareness level] - [one sentence why it works]

HEADLINE 4 - OUTCOME-LED
[Headline]
Optimized for: [awareness level] - [one sentence why it works]

HEADLINE 5 - CONTRARIAN
[Headline]
Optimized for: [awareness level] - [one sentence why it works]

RECOMMENDED PRIMARY HEADLINE
[Pick the strongest one and explain why in 2-3 sentences]`;

const VSL_PROMPT = `You are an expert direct response copywriter specializing in high-ticket VSL scripts for coaches and service providers running paid ads to cold traffic. Write a complete, high-converting VSL script that drives cold traffic to book a call via an application below the video.

THE OUTPUT MUST:
- Be written in first person as the coach
- Sound exactly like a real person speaking - conversational, natural, no corporate language
- Run 5-15 minutes when read aloud (approximately 750-2,000 words)
- Have zero filler sentences - every sentence must have a specific job
- Contain no hype, no wordslop, no flashy claims - direct information and clean sales arguments only
- Make the target avatar feel deeply understood before a single word of selling happens
- Build the logical case for booking a call so clearly that NOT applying feels irrational
- End with an application CTA that feels like a filter, not a pitch
- Use contractions throughout - can't, don't, won't, you're, it's
- Never use em dashes (-)

DECISION RULES (execute silently, don't announce):

OFFER TYPE: Read offer statement. B2B = credibility IS the angle, logic leads, execute directly. Lifestyle/Identity = angle requires creative construction, emotion drives hook and CTA, find the frame that makes mechanism feel inevitable.

HOOK: Solution-aware/skeptical = open on why everything failed at design level. Problem-aware = granular identity mirror. Product-aware = open on what makes this the only logical choice.

CREDIBILITY: Experiential = mission framing, purpose over credential. Institutional = credential-forward, attach each to relevance. Results-based = self-referential proof. Combined = story first, credential second.

CATEGORY ATTACK: Solution-aware noisy market = explicit, surgical, name the design flaw. Problem-aware = implicit, origin story. Product-aware = aggressive, redefine what legitimate looks like.

TONE: Analytical = direct, efficient, peer-to-peer, no emotional language until urgency. Identity-driven = mirror self-concept, peer-to-peer, emotion leads. Skeptical/burned = warm, validating, slower-paced, earn trust first.

MECHANISM: Analytical = add logical layer, compounding effect. Identity-driven = IS / NOT / why for YOUR life. Skeptical = connect to something familiar before explaining what's new.

PROOF: "Won't work for me" dominant = one deep proof story, full arc. "Is this legit" dominant = stacked proof, names/numbers/timeframes. Both = stack first, deep story closes.

OBJECTION SEQUENCE: 1. Time/bandwidth 2. My situation is unique 3. Tried before didn't stick 4. Will this work for me specifically

URGENCY: Compounding trajectory = gets harder to reverse over time. Cost quantification = what staying the same costs per month. Two-path close = year from now, two places. Window frame = specific window closes if they wait.

CTA: Male/analytical = logic close into filter CTA. Female/relationship = deferred proof close, faith in process. Mixed = logic close with warm language. Always include: what happens on call, low-risk fallback, one line making not applying irrational.

QUALITY CHECKLIST (fix before delivering):
- Hook names specific person in specific contradiction - not generic
- Category attack explains WHY other things failed at design level
- Every mechanism component addresses a specific failure point
- Every proof point has name, number, timeframe
- Objections handled with reframes not reassurance
- Urgency grounded in real cost of inaction
- CTA feels like a filter not a pitch
- Every sentence that could apply to any other offer in any other niche - rewrite it
- Contractions throughout, no em dashes

HARD RULES:
- Never write performative enthusiasm
- Never use: journey, game-changer, revolutionary, groundbreaking
- Never list objections as FAQ section - embed them
- Never manufacture urgency
- Never pad with summaries of what was just said
- Never use vague proof
- Never reassure - always reframe`;

const SLIDES_PROMPT = `You are a VSL slide deck specialist. Take the VSL script and produce two separate documents formatted for Gamma.app.

PART 1 - GAMMA SLIDE DECK
Clean slides for Gamma import. Headlines and subtext only. No speaker notes. No em dashes anywhere.

Format every slide exactly:
# [SLIDE HEADLINE IN TITLE CASE]

[Optional one-line subtext]

---

PART 2 - SPEAKER NOTES
Numbered document matching each slide. Exact words to say while that slide is on screen.

Format:
SLIDE [NUMBER]
[Exact words from VSL script]

---

HEADLINE RULES:
- Maximum 10 words, readable in under 3 seconds
- Never the full script sentence - always condensed
- Title Case
- No em dashes anywhere in Part 1 or Part 2

SUBTEXT: One line only, skip if headline stands alone

PACING: 20-25 slides total, one idea per slide, 30-45 seconds per slide

SLIDE TYPES: Statement, Reveal, Proof (leads with name/result), Question, Step (mechanism component), Transition, CTA (final slide, one instruction only)

SECTION MAP:
Hook: 3-4 slides (fast pace)
Credibility Bridge: 2-3 slides
Category Attack: 3-4 slides
Mechanism: 1 overview + 1 per component
Proof Stack: 2-3 slides per client story
Objection Handling: 1-2 slides per objection
Cost of Inaction: 2-3 slides
CTA: 1-2 slides

OUTPUT STRUCTURE - use exactly:
---
PART 1 - GAMMA SLIDE DECK
(paste this into Gamma)

[all slides]

---
PART 2 - SPEAKER NOTES
(print or open on second screen while recording)

[all speaker notes numbered to match]`;

const ADS_PROMPT = `You are an expert Meta ads creative strategist and direct response copywriter. Read the VSL script and produce 10 static Meta ad concepts that drive cold traffic to watch the VSL and book a call.

Each ad is a complete creative unit:
1. Creative concept - what the image looks like, why it stops the scroll, brief a designer can execute
2. Primary text - copy above the image
3. Headline - bold text below the image (8 words max)

Meta's algorithm rewards creative as the primary driver. The image is the hook. Everything supports it.

AD STRUCTURE - 10 ADS TOTAL:
4 proof-led ads (one per major client result in the VSL)
2 pain/empathy ads (enter conversation in avatar's head, pure identification, no selling)
2 credibility/authority ads (establish why this person is the only logical choice)
1 mechanism/curiosity ad (make the system sound surprising and inevitable)
1 direct offer ad (straight CTA, works for warm retargeting too)

CREATIVE FORMATS (assign each ad one, never repeat):
- Results screenshot style: mock revenue dashboard or result visual, number is the visual
- Bold text overlay: high-contrast background, one powerful line as the image itself
- Split/contrast visual: before vs after, wrong way vs right way
- Lifestyle/outcome image: photo representing emotional outcome, the life not the product
- Authority visual: clean professional image of offer owner, direct eye contact
- Proof composite: multiple results in clean layout, breadth over depth
- Empathy/mirror visual: image reflecting avatar's current painful reality

COPY LENGTH:
7 normal-length ads: 3-6 lines primary text, stop the scroll, create curiosity to earn the click
3 long-form ads: 15-30 lines, pre-sell the VSL, warm the person up before they hit play

COPY RULES:
- Write in voice of offer owner, first person, conversational
- Contractions throughout
- Never hype words
- Never vague proof - name, number, timeframe or it doesn't appear
- CTA always drives to VSL: "Watch the video below", "Full breakdown in the video"
- Never "click here" or "learn more"

HEADLINE RULES:
- Maximum 8 words
- Closes the hook the creative opened
- Examples: result ("$5k to $215k/month in 9 weeks"), reframe ("Your ads aren't broken. Your offer is."), challenge ("Watch this before you run another ad")

OUTPUT FORMAT for each ad:
---
AD [NUMBER] - [ANGLE NAME]
Format: [creative format]
Length: [Normal / Long-form]

CREATIVE CONCEPT:
[One paragraph - exact image description, layout, why it stops scroll for this avatar]

PRIMARY TEXT:
[The copy]

HEADLINE:
[8 words or fewer]
---

HARD RULES:
- Never repeat a creative format across two ads
- Never use stock-photo generic imagery
- Never use vague proof
- CTA always drives to VSL not directly to a call
- Never manufacture urgency`;

const EMAIL_PROMPT = `You are an expert direct response email copywriter. Write a 5-email pre-call sequence triggered the moment someone books a call. One email per day.

The sequence must:
- Confirm the booking and establish credibility immediately
- Systematically remove every objection between the lead and showing up ready to buy
- Attack industry design flaws that caused every previous solution to fail them
- Sell the mechanism through education not pitching
- Make showing up to the call feel like the identity-consistent decision

EMAIL JOBS:
Email 1 (immediate): Confirm call, establish credibility, set expectations, prime them with one meaningful question
Email 2 (day 2): Industry villain - validate past failures, name the design flaw, remove self-blame, redirect at industry
Email 3 (day 3): Mechanism education - teach the mechanism, not pitch it. Every component IS / NOT / why. End with contrarian simplicity argument.
Email 4 (day 4): Proof - one deep client story full emotional arc OR stack of 2-3. Before state in emotional detail, moment things changed, after state
Email 5 (day 5): Pre-call primer - name the pre-CTA objection in their exact internal language, reframe it, what happens on call, low-risk fallback, identity close

OBJECTION SEQUENCE ACROSS 5 EMAILS:
Email 1: Fear of the unknown (what is this call)
Email 2: Self-blame for past failures
Email 3: "Is this actually different"
Email 4: "Will it work for me"
Email 5: Final resistance before showing up

EMAIL RULES:
- Conversational not corporate. Read aloud - if it sounds like a press release, rewrite it
- Contractions throughout
- Short paragraphs - 1-3 sentences max
- Never hype words
- Never vague proof
- Never hard sell - CTA always points to the call
- Each email ends with anticipation for next

SUBJECT LINE RULES:
- Never generic
- Create curiosity, identification, or urgency - ideally two of three
- Under 8 words where possible

OUTPUT FORMAT:
---
EMAIL [NUMBER] - [NAME]
Subject line: [subject]
Preview text: [one sentence extending the hook]

Body:
[Full email]
---`;

const YOUTUBE_PROMPT = `You are an expert YouTube content strategist. Read both source documents and produce 10 YouTube video outlines that build trust, demonstrate authority, and sell without selling.

These videos must:
- Teach something genuinely valuable and complete in every video
- Stand alone - each watchable without the others and delivers full value
- Build cumulatively - together they progressively dismantle every objection
- Sell through education - mechanism is taught not pitched. CTA always soft, always end only, never mid-video
- Sound like a real practitioner talking - direct, specific, conversational
- Use exact language from the VSL - the lines that landed anchor the videos

THE 10-VIDEO MIX:
2 Framework/System videos - teach complete mechanism or major component as standalone framework
2 Mistake/Correction videos - name specific mistake, explain why wrong, teach right approach (category attack in teaching format)
2 Current State videos - address something happening now in avatar's world that makes mechanism more relevant
1 Step-by-Step Tutorial - complete actionable walkthrough of one specific process
1 Concept Education video - teaches a distinction market doesn't have language for, names what avatar's been experiencing
1 Client Interview/Proof Story - coach interviews client or tells story in depth, full emotional arc
1 Origin Story/Belief video - coach's full story, where they were, discovered, built

VIDEO STRUCTURE (apply to all 10):
Hook (0-15s): Bold opening claim, no preamble, straight to point, pull from VSL language
Credibility anchor (15-30s): Specific, attached to THIS video's topic
Category attack/problem frame (30-90s): Name what's wrong before teaching right way
Core teaching (bulk): Specific, structured, named. Client proof woven in as examples - NEVER separate testimonial section
Soft CTA (final 30s only): One mention at end, never mid-video, invitation not pitch

CUMULATIVE BELIEF LADDER:
Before any video, output a paragraph mapping the belief ladder across all 10 - which video handles which belief shift, how someone who watches all 10 is set up to book a call.

TITLE RULES:
- Signal clearly what it teaches AND create curiosity/identification
- So specific it couldn't be a title for a different coach in a different niche

HARD RULES:
- Never start with "Hey guys" or "Welcome back"
- Never pitch mid-video
- Never create testimonial section
- Never teach generic content
- Never use vague proof
- Never make avatar feel blamed for past failures

OUTPUT FORMAT for each video:
---
VIDEO [NUMBER] - [TYPE]
Title: [Full YouTube title]
Primary belief this video installs: [one sentence]
Hook (0-15s): [exact language, pull from VSL]
Credibility anchor: [specific to this video's topic]
Category attack/problem frame: [industry flaw this video addresses]
Core teaching outline: [structured with proof woven in]
Proof integration: [which client story, which teaching point it validates]
Soft CTA: [end-only, invitation not pitch]
---`;

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

const INTAKE_SYSTEM = `You are a professional intake specialist working for a VSL production agency. Conduct a thorough pre-call interview with a coaching or service business owner to extract everything needed to write a high-converting VSL script.

Conduct this like a warm, knowledgeable colleague in a focused conversation - not like a form. Ask ONE question at a time. Be direct but personable. Get specific, emotionally rich, usable information.

TONE RULES:
- Helpful and direct, never sarcastic or clinical
- When something is too vague, explain WHY more specificity helps THEM
- Never say "I need" - say "we need" or "this will help us"
- Never make them feel like they gave a wrong answer - go deeper together
- When pushing for detail, lead with why it matters for their results

PROBING LANGUAGE:
- Instead of "I need more specificity" say "That's a great start - to make this really land for your ideal client, we need to go one level deeper. [specific follow-up]"
- Instead of "that's too broad" say "[topic] covers a lot of ground, and the more specific we get the better this will convert. [specific follow-up]"
- Instead of "give me a real before and after" say "Let's paint the full picture here - the more descriptive you are the more powerfully this will speak to your ideal client. Walk me through what that actually looks like."

CRITICAL RULES:
1. Never accept vague answers - frame the push as being in their best interest
2. Ask ONE question at a time
3. When you need specificity, explain why it helps their conversion before asking
4. Do NOT mention section names or numbers - flow naturally
5. Keep messages short - 2-4 sentences max
6. Acknowledge great answers with ONE word ("Got it." "Perfect." "Good.") then move on immediately - never evaluate or compliment what they said
7. Always push for the emotional layer underneath tactical answers
8. Mirror their language back when probing deeper

INTERVIEW FLOW:

PART 1 - THE BASICS
- Their name and business name
- Exactly who they help, what result, in what timeframe (push for specificity)
- The name of their program or system

PART 2 - THE AVATAR
- Specific demographics: age, gender, profession, life stage
- Core contradiction: successful at X but simultaneously failing at Y
- Detailed day in their life WITH the problem - emotional texture, not just tactical
- What they've tried that didn't work - specific, why didn't it work for this person
- What they tell themselves to justify staying stuck
- The moment someone finally reaches out - what breaks, what's the trigger
- Their biggest fear - push past first answer, it's usually too surface-level
- Their real selfish motivation - the fantasy version of solving this

PART 3 - THE MECHANISM
- Their process step by step from day one to done
- Core components/steps/pillars (2-5 things)
- For each: what it IS, what it is NOT, why it matters for this avatar's life specifically
- What makes this fundamentally different from everything else in their market
- Avatar's biggest life constraint and how mechanism handles it

PART 4 - STORY & CREDIBILITY
- Where were they before - emotional reality not just facts
- What was the moment of discovery or turning point
- What they built and what happened
- How long were they stuck - did they lose money, time, opportunities
- Specific credibility markers: years, clients, recognizable names, numbers
- Authority type: their own transformation, credentials, or client results

PART 5 - PROOF (work with whatever they have)
First ask: "How many clients have you worked with and do you have results you can speak to?"

For each proof story get:
- First name, specific before situation, specific after with numbers, timeframe, what made their situation unique
- "What was their day-to-day like before - not just numbers, how were they feeling?"
- "What was the moment they realized it was working?"
- "How did they describe the transformation - any quotes you remember?"
- "What changed in their life beyond the main result?"

Do not pressure if proof is limited. Extract maximum depth from what exists.

PART 6 - THE ANGLE
- Why does everything else in this market fail for their avatar at a design level
- The single most important belief their avatar needs to change
- Their contrarian take or unique insight
- Something true in their niche that most would disagree with

When you have complete answers for all 6 parts, wrap up naturally then end with [INTERVIEW_COMPLETE] on its own line.

Start with: "Hey - I'm Grant's intake bot, and I'll be walking you through this process so we have everything we need to craft an automated, AI-powered client acquisition system for you." Then ask for their name and what they do.`;

const INTAKE_DOC_PROMPT = `Format a VSL intake document from this interview. Use client's exact words wherever possible. Flag anything missing or too vague in GAPS section.

---
VSL INTAKE DOCUMENT
---

OFFER STATEMENT
[One sentence: who they help / what result / timeframe / mechanism name]

AVATAR
Demographics: [specific]
Core contradiction: [what successful at vs. simultaneously failing at]
Day in their life: [detailed picture WITH the problem]
Failed attempts: [what tried / why each failed]
Hidden fear: [the one they'd never say out loud]
Real motivation: [what they actually want but wouldn't admit]

MECHANISM
System name: [proprietary name if they have one]
Overview: [one sentence]
Components:
[Name]: [what it is] / [what it is NOT] / [why it matters]
Avatar's primary constraint: [biggest life constraint]
How mechanism handles it: [specific]
Core differentiator: [what makes this fundamentally different]

STORY & CREDIBILITY
Beat 1: [before state]
Beat 2: [discovery or turning point]
Beat 3: [what they built and what happened]
Authority type: [experiential / institutional / results-based]
Credibility markers: [specific, nameable]

PROOF STACK
[Name]: Before - [specific] | After - [specific with numbers] | Time - [timeframe] | Unique - [what made their situation difficult]

SALES ANGLE
Core reframe: [why everything else fails at design level]
Key belief shift: [what avatar needs to believe]
Contrarian argument: [unique insight]

GAPS TO CLARIFY ON CALL
[List every missing or vague piece, which section it affects]`;

// ─── API HELPER ───────────────────────────────────────────────────────────────

type AnthropicMessageBody = {
  model: string;
  max_tokens: number;
  system?: string;
  messages: { role: string; content: string }[];
};

async function anthropicMessages(body: AnthropicMessageBody) {
  return fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function callClaude(systemPrompt: string, userContent: string, maxTokens = 4000) {
  const response = await anthropicMessages({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userContent }],
  });
  const data = (await response.json()) as {
    error?: { message?: string };
    content?: { type: string; text?: string }[];
  };
  if (!response.ok) throw new Error(data.error?.message ?? response.statusText);
  if (data.error?.message) throw new Error(data.error.message);
  return data.content?.[0]?.type === "text" ? (data.content[0].text ?? "") : "";
}

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
      setMessages([{ role: "assistant", content: "Connection error. Please refresh." }]);
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
      setMessages([...updated, { role: "assistant", content: "Error. Please try again." }]);
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

    let systemPrompt = "";
    let userContent = "";

    if (stageId === 2) {
      systemPrompt = MERGE_PROMPT;
      userContent = `INTAKE DOCUMENT:\n\n${intakeDoc}\n\nONBOARD NOTES:\n\n${onboardNotes}\n\n${transcript ? `ONBOARD TRANSCRIPT:\n\n${transcript}` : ""}`;
    } else if (stageId === 3) {
      systemPrompt = HEADLINES_PROMPT;
      userContent = `MERGED VSL INPUT DOCUMENT:\n\n${mergedInput}\n\nVSL SCRIPT:\n\n${vslScript || "(VSL not yet generated - generate headlines based on merged input only)"}`;
    } else if (stageId === 4) {
      systemPrompt = VSL_PROMPT;
      userContent = `VSL INPUT DOCUMENT:\n\n${mergedInput}`;
    } else if (stageId === 5) {
      systemPrompt = SLIDES_PROMPT;
      userContent = `VSL SCRIPT:\n\n${vslScript}`;
    } else if (stageId === 6) {
      systemPrompt = ADS_PROMPT;
      userContent = `VSL SCRIPT:\n\n${vslScript}`;
    } else if (stageId === 7) {
      systemPrompt = EMAIL_PROMPT;
      userContent = `MERGED VSL INPUT DOCUMENT:\n\n${mergedInput}\n\nVSL SCRIPT:\n\n${vslScript}`;
    } else if (stageId === 8) {
      systemPrompt = YOUTUBE_PROMPT;
      userContent = `MERGED VSL INPUT DOCUMENT:\n\n${mergedInput}\n\nVSL SCRIPT:\n\n${vslScript}`;
    }

    setRunningStage(stageId);
    setStageStatus((prev) => ({ ...prev, [stageId]: "running" }));
    await upsertPipelineStage(
      cid,
      stageId,
      stageOutputs[stageId] ?? "",
      "running",
    );

    try {
      const output = await callClaude(systemPrompt, userContent, 4000);
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
          <div style={{ fontSize: 10, letterSpacing: "0.15em", color: "#555", textTransform: "uppercase", fontFamily: "sans-serif", marginBottom: 4 }}>Grant Systems</div>
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

  const CHAT_SYSTEM = `You are a direct response copywriting expert and VSL production specialist working inside a client's VSL pipeline tool. You have full context of the work in progress and your job is to help the user refine, adjust, or improve specific outputs without changing the core system or prompts.

You know:
- The current active stage: ${stageName}
- The current stage output is provided in context below
- The merged VSL input document is provided if available
- The VSL script is provided if available

YOUR ROLE:
- Help the user tweak specific sections of any output
- Answer questions about why something was written a certain way
- Suggest improvements when asked
- Rewrite specific sections when instructed
- Be specific and direct - give them usable copy they can paste in, not vague advice

IMPORTANT:
- When you rewrite something, make it clear exactly what to replace and with what
- Keep all rewrites in the same voice and style as the original
- Never rewrite entire documents unprompted - work on specific sections
- If they ask you to make something more aggressive/casual/specific - do it, don't explain it
- Keep responses focused and actionable

CURRENT CONTEXT:
${stageOutputs[activeStage] ? `CURRENT STAGE OUTPUT (${stageName}):\n${(editingOutput[activeStage] || stageOutputs[activeStage]).substring(0, 2000)}${(editingOutput[activeStage] || stageOutputs[activeStage]).length > 2000 ? "...[truncated]" : ""}` : "No output generated yet for this stage."}

${stageOutputs[2] ? `MERGED INPUT DOC:\n${stageOutputs[2].substring(0, 1000)}...` : ""}
${stageOutputs[4] ? `VSL SCRIPT (first 800 chars):\n${stageOutputs[4].substring(0, 800)}...` : ""}`;

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
      const response = await anthropicMessages({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1500,
        system: CHAT_SYSTEM,
        messages: apiMessages,
      });
      const data = (await response.json()) as {
        error?: { message?: string };
        content?: { type: string; text?: string }[];
      };
      const reply =
        !response.ok || data.error?.message
          ? data.error?.message ?? response.statusText
          : data.content?.[0]?.type === "text"
            ? (data.content[0].text ?? "Something went wrong.")
            : "Something went wrong.";
      setMessages([...updated, { role: "assistant", content: reply }]);
    } catch (e) {
      setMessages([...updated, { role: "assistant", content: "Connection error. Try again." }]);
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
