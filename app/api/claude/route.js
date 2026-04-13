export const runtime = "nodejs";
/** Vercel: max serverless duration (seconds). Requires Pro/Enterprise for >60s on most plans. */
export const maxDuration = 300;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Uniform error JSON for the client: always includes message + full details. */
function anthropicErrorResponse(httpStatus, upstreamJson) {
  const s = httpStatus || 502;
  const message =
    (upstreamJson &&
      typeof upstreamJson.error?.message === "string" &&
      upstreamJson.error.message) ||
    (upstreamJson &&
      typeof upstreamJson.message === "string" &&
      upstreamJson.message) ||
    `Anthropic request failed (HTTP ${s})`;
  const errType =
    (upstreamJson && upstreamJson.error && upstreamJson.error.type) ||
    (upstreamJson && upstreamJson.type) ||
    "api_error";
  return Response.json(
    {
      type: "error",
      error: {
        type: errType,
        message,
        details: upstreamJson && Object.keys(upstreamJson).length ? upstreamJson : {},
        httpStatus: s,
      },
    },
    { status: s },
  );
}

function parseFailureResponse(httpStatus, rawText, parseErr) {
  const s = httpStatus || 502;
  const message = `Anthropic returned non-JSON (HTTP ${s}). ${parseErr ? String(parseErr.message || parseErr) : ""}`.trim();
  return Response.json(
    {
      type: "error",
      error: {
        type: "parse_error",
        message,
        details: {
          rawBody: typeof rawText === "string" ? rawText : String(rawText ?? ""),
          parseError: parseErr ? String(parseErr) : undefined,
        },
        httpStatus: s,
      },
    },
    { status: s },
  );
}

const PROMPTS = {
  "merge": "You are preparing a final input document for a VSL copywriter. You have been given up to three sources: a pre-call intake document, an onboard call note template, and optionally an onboard transcript.\n\nSOURCE PRIORITY:\n- Onboard notes win on all strategic decisions (offer type, angle, mechanism name, avatar type, awareness level)\n- Transcript wins on emotional detail and specifics\n- Intake is the baseline for everything else not covered above\n\nMERGE RULES:\n- Use richer version when sources add detail\n- Use transcript version when it contradicts intake, note the discrepancy\n- Execute exactly against strategic decisions in onboard notes\n- Flag anything still missing or vague in GAPS section\n- Use client's exact words wherever possible\n- Every proof point needs: name, specific before, specific after with numbers, timeframe, unique factor\n\nOutput in this exact structure:\n\n---\nVSL INPUT DOCUMENT - FINAL\n---\n\nOFFER TYPE\n[B2B / Lifestyle / Mixed]\n\nOFFER STATEMENT\n[One sentence: who / result / timeframe / mechanism]\n\nAVATAR\nDemographics: [specific]\nCore contradiction: [successful at X, failing at Y]\nDay in their life: [detailed emotional picture]\nFailed attempts: [what they tried / why each failed]\nWhat they tell themselves: [their justification for staying stuck]\nTrigger moment: [what breaks right before they reach out]\nHidden fear: [the one they'd never say out loud]\nReal motivation: [what they actually want but wouldn't admit]\nPrimary life constraint: [what makes standard solutions not work]\n\nMECHANISM\nSystem name: [final name from onboard notes]\nOverview: [one sentence]\nComponents:\n[Name]: [what it is] / [what it is NOT] / [why it matters]\n[repeat for each]\nHow mechanism handles constraint: [specific]\nCore differentiator: [what makes this the only logical choice]\n\nSTORY & CREDIBILITY\nBeat 1: [before state - emotional reality]\nBeat 2: [discovery / turning point]\nBeat 3: [what they built and what happened]\nAuthority type: [experiential / institutional / results-based]\nCredibility markers: [specific, nameable]\n\nAVATAR TYPE\nPrimary: [analytical / identity-driven / skeptical]\nSecondary: [if applicable]\nGender: [male / female / mixed]\nNotes: [decision-making patterns, what they respond to]\n\nAWARENESS LEVEL\nLevel: [problem-aware / solution-aware / product-aware]\nEvidence: [what supports this]\n\nPROOF STACK\n[Name]: Before - [specific] | After - [specific with numbers] | Time - [timeframe] | Unique - [what made their situation difficult]\n[repeat for each client]\n\nURGENCY TYPE\nPrimary: [compounding trajectory / cost quantification / two-path close / window frame]\nSpecific cost: [what gets worse the longer they wait]\n\nSALES ANGLE\nCore reframe: [why everything else fails at a design level]\nKey belief shift: [what avatar needs to believe]\nContrarian argument: [unique insight or differentiating position]\nStrategic notes: [anything unique flagged by strategist]\n\nGAPS REMAINING\n[List every missing piece, which section it affects, what to do]",
  "headlines": "You are an expert direct response copywriter specializing in high-ticket VSL headlines for cold traffic paid ads. Read both source documents and generate 5 VSL headline options.\n\nEach headline must: speak directly to the avatar using their exact emotional language, enter the conversation already in their head, create identification or curiosity that makes clicking play inevitable, be specific enough to filter the wrong person, never use hype or vague language.\n\nGenerate exactly one headline of each type:\n\nHEADLINE 1 - DIRECT PROBLEM/SOLUTION\nStates the exact problem and promises a specific answer. Avatar reads it and thinks \"that's exactly what I'm dealing with.\"\n\nHEADLINE 2 - REFRAME  \nLeads with the core reframe from the VSL. Removes self-blame, redirects at industry. Pulls from the category attack.\n\nHEADLINE 3 - CREDIBILITY-LED\nLeads with the coach's most powerful credibility marker attached to a promise of what the video reveals.\n\nHEADLINE 4 - OUTCOME-LED\nSells the emotional outcome - the feeling of the after state. Pulls from real motivation and fantasy outcome.\n\nHEADLINE 5 - CONTRARIAN\nLeads with the most surprising truth from the VSL. Contradicts what the avatar has been told.\n\nRULES:\n- Every headline specific to this avatar/niche only\n- Use avatar's exact emotional language from the VSL\n- Never use: journey, revolutionary, groundbreaking, game-changer\n- After each headline write one sentence on awareness level optimized for and why\n\nOUTPUT FORMAT:\nHEADLINE 1 - DIRECT PROBLEM/SOLUTION\n[Headline]\nOptimized for: [awareness level] - [one sentence why it works]\n\nHEADLINE 2 - REFRAME\n[Headline]\nOptimized for: [awareness level] - [one sentence why it works]\n\nHEADLINE 3 - CREDIBILITY-LED\n[Headline]\nOptimized for: [awareness level] - [one sentence why it works]\n\nHEADLINE 4 - OUTCOME-LED\n[Headline]\nOptimized for: [awareness level] - [one sentence why it works]\n\nHEADLINE 5 - CONTRARIAN\n[Headline]\nOptimized for: [awareness level] - [one sentence why it works]\n\nRECOMMENDED PRIMARY HEADLINE\n[Pick the strongest one and explain why in 2-3 sentences]",
  "vsl": `You are an expert direct response copywriter specializing in high-ticket VSL scripts for coaches and service providers running paid ads to cold traffic. Write a complete, high-converting VSL script that drives cold traffic to book a call via an application below the video.

BEFORE WRITING ANYTHING — DO THIS FIRST:

STEP 1 — EXTRACT AVATAR LANGUAGE
Read the avatar description, day in their life, failed attempts, hidden fear, real motivation, and any client quotes in the input document. Extract:
- The specific words and phrases this avatar uses to describe their problem
- The emotional register they speak in — casual, raw, frustrated, hopeful, defeated
- Any specific phrases from the coach's description that sound like the avatar's own voice
- The words they would NEVER use — clinical, technical, marketing language

Write every word of this script in that language. Every sentence should sound like it came from inside the avatar's head — not from a copywriter describing their situation. If a word sounds like it belongs in a health article, a marketing deck, or a clinical report — rewrite it in the avatar's actual language. Read every line aloud. If it sounds like copy — rewrite it. If it sounds like a real person talking — keep it.

STEP 2 — IDENTIFY THE TWO CORE DESIRES / FEARS
Every avatar has two fears underneath everything else they're experiencing. Find them in the input document. These are not surface frustrations — they are the questions the avatar is privately asking that they haven't said out loud to anyone. Name them explicitly. The entire script exists to validate both fears, explain why they exist, and answer both through the mechanism.

STEP 3 — IDENTIFY THE ONE PROBLEM
Every VSL is selling ONE idea. Find the single root cause that explains why everything the avatar has tried has failed. This ONE problem is the spine of the entire script. Everything — the hook, the category attack, the mechanism, the proof — exists to make them understand this one problem and why your mechanism is the only thing that solves it.

CORE ARCHITECTURE:
Everything the avatar has tried hasn't worked because of ONE specific problem. Your mechanism is the only thing built to solve that problem directly. The entire script exists to make them think: "I can only solve my problem with this."

THE 6-PART STRUCTURE — no section labels in output:

1. HOOK + SECOND LINE
One scroll-stopping sentence. Uses "imagine" or equivalent to pull them into the experience before they've processed it. Names exactly who this is for. Ends on the innermost fear — not the surface frustration, the actual stakes. The thing they think about but never say out loud.

Immediately followed by this exact pattern:
"And I'm going to make this quick. If you're [specific avatar] who's been [the silent struggle nobody sees] while every [villain — doctor, industry, person who should be helping] has just [what they did that was wrong] and [the emotional wound — what that made her feel or believe about herself] — then I have the answer you've been waiting for."

The emotional wound is the last thing in the sentence. Not what the villain did logistically — what it made the avatar feel or believe about themselves. That is where the sentence ends. Nothing comes after it.

2. YOU'VE TRIED EVERYTHING — IT HASN'T WORKED
Written entirely from inside the avatar's head. This is not a description of them — it is a narration of their internal experience using their exact language.

Use "you know" and "you've" constantly. Name specifically what they've tried. Name specifically how each one felt. Name the cycle they keep living. Use mini stories and hyper-specific details that make them think "how does she know that" — the kind of specificity that only comes from truly understanding someone's private experience. The goal is for the avatar to feel like you're reading their mind.

End this section by naming the two core fears explicitly — the questions living in the back of their head that they haven't said out loud. Name them as questions in their voice.

3. HERE'S WHY — THE ONE PROBLEM
Lead with the punchline. State the ONE problem directly in plain language first — before any explanation or metaphor. Deliver it as a complete thought. Then confirm it: "That's it. That's the whole thing." Then explain it with a metaphor from their actual world — something they already understand deeply from their own life. Then use the metaphor as the frame for the category attack.

The metaphor must come from their world — their daily life, their kids, their relationships, something they already understand instinctively. Never use a metaphor that belongs to a different world unless that is specifically their world.

After the metaphor, attack each thing they tried specifically — explain the design flaw for each one using the metaphor as the frame. Not "it didn't work" — exactly why it couldn't have worked given the ONE problem.

Redirect all blame from them to the design flaw. By the end of this section they should think: "That's exactly right. That's why nothing worked. It was never going to work."

SENTENCE STRUCTURE RULE — applies to every sentence in the script:
The most emotionally important word or phrase always ends the sentence. Never follow the thing that matters with something minor or logistical. Get to the thing that hurts. Say it. Stop. If you catch yourself ending on a logistical detail after an emotional one — flip it. The last word is where the emphasis lives. Never bury what matters most in the middle.

Examples:
Wrong: "every doctor she's seen has told her she's crazy and then sent her home"
Right: "every doctor she's seen has run the tests, looked at the results, and told her she's crazy"

Wrong: "she stopped going to dinners because food scared her and she didn't know what would happen"
Right: "she stopped going to dinners with her friends because she was scared of what food would do to her"

4. THE MECHANISM — THE ONLY LOGICAL SOLUTION
Introduce the mechanism as the obvious answer to the obvious problem. Not a new complicated thing — the thing that should have existed all along.

Name it. Explain what makes it fundamentally different at the level of design — not features, design. Why is it the only thing that actually solves the ONE problem?

Show explicitly how the mechanism answers both core fears. Fear 1 — how does it prove they're not crazy? Fear 2 — how does it show them they can actually be okay? The mechanism resolves both simultaneously.

Make the logical argument: if the problem is X, and everything else doesn't address X, then the only thing that can work is something that addresses X directly. This is that thing. Make the logic feel airtight.

DO NOT do a week by week timeline breakdown unless the mechanism is inherently time-based. Sell the CONCEPT — the idea that this is the only approach that addresses the actual problem. The mechanism is the missing piece, not a curriculum.

5. PROOF
One deep client story. Full emotional arc.

Open from inside the avatar's perspective using their language. Describe who the client was and what their life felt like — including which of the two core fears they were living with — so the reader sees themselves immediately.

Use "you know what that feels like" to pull the reader into the story alongside the client.

The turning point: what changed when they found the actual solution. How did it answer fear 1? How did it answer fear 2?

Close on the emotional outcome — the specific moment their life changed. Not just the metric. The moment. End on the most emotionally powerful detail. Nothing after it.

6. CTA
Direct and tight. No fluff. No summary of what was just said.

One line that closes on both fears — validates fear 1 and answers fear 2 in the same breath.
What happens on the call — specific, not vague, reduces fear of unknown.
Low-risk fallback — if it's not a fit you'll say so directly.
One final line that makes not applying the irrational choice — stated as a logical conclusion, not a pressure tactic.

TONE:
Direct. Punchy. Peer-to-peer. Like someone who genuinely knows the answer and is frustrated on behalf of the person watching that nobody has shown it to them sooner. Not salesy. Not performative. Confident, warm, direct, no filler.

Short sentences. Declarative statements. Written as if speaking — rhythm matters, contractions everywhere, it should sound right read aloud. Never sounds like marketing. Always sounds like a real person talking to another real person.

OUTPUT MUST:
- Be written in first person as the coach
- Sound exactly like a real person speaking
- Run approximately 700-1000 words — tight, no padding
- Have zero filler sentences — every sentence has a job or it gets cut
- Use contractions throughout
- Never use em dashes
- Never use the word journey
- Never use hype words
- Use the avatar's actual language throughout — not clinical or marketing language

QUALITY CHECKLIST — fix every item before delivering:
- Did you extract the avatar's actual language before writing?
- Did you identify the two core fears before writing?
- Does the hook end on the innermost fear — the actual stakes?
- Does the second line end on the emotional wound — not a logistical detail?
- Is the "you've tried everything" section written from inside their head with hyper-specific details?
- Are the two core fears named explicitly as questions in the avatar's voice?
- Is the ONE problem delivered as a direct punchline first — before explanation or metaphor?
- Is the metaphor from their actual world?
- Does the category attack explain the design flaw for each thing they tried?
- Does the mechanism show explicitly how it resolves both core fears?
- Does the proof story open in the avatar's language so the reader sees themselves?
- Does the proof story close on the most emotionally powerful detail with nothing after it?
- Does the CTA close on both fears in one line?
- Does every sentence end on the most emotionally important word or phrase?
- Read it aloud — does every sentence sound like a real person talking?
- Does the whole script make them think: "I can only solve my problem with this"?

HARD RULES:
- Never list objections as a FAQ — embed them naturally
- Never manufacture urgency
- Never use vague proof — name, result, timeframe or it doesn't appear
- Never reassure — always reframe
- Never do a week by week breakdown unless the mechanism is inherently time-based
- Never write more than 1000 words
- Never pad — if a sentence doesn't have a job, cut it
- Never use language the avatar wouldn't use in normal conversation
- Never bury the emotionally important word in the middle of a sentence
- Never end a sentence on something logistical after something emotional`,
  "slides": "You are a VSL slide deck specialist. Take the VSL script and produce two separate documents formatted for Gamma.app.\n\nPART 1 - GAMMA SLIDE DECK\nClean slides for Gamma import. Headlines and subtext only. No speaker notes. No em dashes anywhere.\n\nFormat every slide exactly:\n# [SLIDE HEADLINE IN TITLE CASE]\n\n[Optional one-line subtext]\n\n---\n\nPART 2 - SPEAKER NOTES\nNumbered document matching each slide. Exact words to say while that slide is on screen.\n\nFormat:\nSLIDE [NUMBER]\n[Exact words from VSL script]\n\n---\n\nHEADLINE RULES:\n- Maximum 10 words, readable in under 3 seconds\n- Never the full script sentence - always condensed\n- Title Case\n- No em dashes anywhere in Part 1 or Part 2\n\nSUBTEXT: One line only, skip if headline stands alone\n\nPACING: 20-25 slides total, one idea per slide, 30-45 seconds per slide\n\nSLIDE TYPES: Statement, Reveal, Proof (leads with name/result), Question, Step (mechanism component), Transition, CTA (final slide, one instruction only)\n\nSECTION MAP:\nHook: 3-4 slides (fast pace)\nCredibility Bridge: 2-3 slides\nCategory Attack: 3-4 slides\nMechanism: 1 overview + 1 per component\nProof Stack: 2-3 slides per client story\nObjection Handling: 1-2 slides per objection\nCost of Inaction: 2-3 slides\nCTA: 1-2 slides\n\nOUTPUT STRUCTURE - use exactly:\n---\nPART 1 - GAMMA SLIDE DECK\n(paste this into Gamma)\n\n[all slides]\n\n---\nPART 2 - SPEAKER NOTES\n(print or open on second screen while recording)\n\n[all speaker notes numbered to match]",
  "ads": "You are an expert Meta ads creative strategist and direct response copywriter. Read the VSL script and produce 10 static Meta ad concepts that drive cold traffic to watch the VSL and book a call.\n\nEach ad is a complete creative unit:\n1. Creative concept - what the image looks like, why it stops the scroll, brief a designer can execute\n2. Primary text - copy above the image\n3. Headline - bold text below the image (8 words max)\n\nMeta's algorithm rewards creative as the primary driver. The image is the hook. Everything supports it.\n\nAD STRUCTURE - 10 ADS TOTAL:\n4 proof-led ads (one per major client result in the VSL)\n2 pain/empathy ads (enter conversation in avatar's head, pure identification, no selling)\n2 credibility/authority ads (establish why this person is the only logical choice)\n1 mechanism/curiosity ad (make the system sound surprising and inevitable)\n1 direct offer ad (straight CTA, works for warm retargeting too)\n\nCREATIVE FORMATS (assign each ad one, never repeat):\n- Results screenshot style: mock revenue dashboard or result visual, number is the visual\n- Bold text overlay: high-contrast background, one powerful line as the image itself\n- Split/contrast visual: before vs after, wrong way vs right way\n- Lifestyle/outcome image: photo representing emotional outcome, the life not the product\n- Authority visual: clean professional image of offer owner, direct eye contact\n- Proof composite: multiple results in clean layout, breadth over depth\n- Empathy/mirror visual: image reflecting avatar's current painful reality\n\nCOPY LENGTH:\n7 normal-length ads: 3-6 lines primary text, stop the scroll, create curiosity to earn the click\n3 long-form ads: 15-30 lines, pre-sell the VSL, warm the person up before they hit play\n\nCOPY RULES:\n- Write in voice of offer owner, first person, conversational\n- Contractions throughout\n- Never hype words\n- Never vague proof - name, number, timeframe or it doesn't appear\n- CTA always drives to VSL: \"Watch the video below\", \"Full breakdown in the video\"\n- Never \"click here\" or \"learn more\"\n\nHEADLINE RULES:\n- Maximum 8 words\n- Closes the hook the creative opened\n- Examples: result (\"$5k to $215k/month in 9 weeks\"), reframe (\"Your ads aren't broken. Your offer is.\"), challenge (\"Watch this before you run another ad\")\n\nOUTPUT FORMAT for each ad:\n---\nAD [NUMBER] - [ANGLE NAME]\nFormat: [creative format]\nLength: [Normal / Long-form]\n\nCREATIVE CONCEPT:\n[One paragraph - exact image description, layout, why it stops scroll for this avatar]\n\nPRIMARY TEXT:\n[The copy]\n\nHEADLINE:\n[8 words or fewer]\n---\n\nHARD RULES:\n- Never repeat a creative format across two ads\n- Never use stock-photo generic imagery\n- Never use vague proof\n- CTA always drives to VSL not directly to a call\n- Never manufacture urgency",
  "emails": "You are an expert direct response email copywriter. Write a 5-email pre-call sequence triggered the moment someone books a call. One email per day.\n\nThe sequence must:\n- Confirm the booking and establish credibility immediately\n- Systematically remove every objection between the lead and showing up ready to buy\n- Attack industry design flaws that caused every previous solution to fail them\n- Sell the mechanism through education not pitching\n- Make showing up to the call feel like the identity-consistent decision\n\nEMAIL JOBS:\nEmail 1 (immediate): Confirm call, establish credibility, set expectations, prime them with one meaningful question\nEmail 2 (day 2): Industry villain - validate past failures, name the design flaw, remove self-blame, redirect at industry\nEmail 3 (day 3): Mechanism education - teach the mechanism, not pitch it. Every component IS / NOT / why. End with contrarian simplicity argument.\nEmail 4 (day 4): Proof - one deep client story full emotional arc OR stack of 2-3. Before state in emotional detail, moment things changed, after state\nEmail 5 (day 5): Pre-call primer - name the pre-CTA objection in their exact internal language, reframe it, what happens on call, low-risk fallback, identity close\n\nOBJECTION SEQUENCE ACROSS 5 EMAILS:\nEmail 1: Fear of the unknown (what is this call)\nEmail 2: Self-blame for past failures\nEmail 3: \"Is this actually different\"\nEmail 4: \"Will it work for me\"\nEmail 5: Final resistance before showing up\n\nEMAIL RULES:\n- Conversational not corporate. Read aloud - if it sounds like a press release, rewrite it\n- Contractions throughout\n- Short paragraphs - 1-3 sentences max\n- Never hype words\n- Never vague proof\n- Never hard sell - CTA always points to the call\n- Each email ends with anticipation for next\n\nSUBJECT LINE RULES:\n- Never generic\n- Create curiosity, identification, or urgency - ideally two of three\n- Under 8 words where possible\n\nOUTPUT FORMAT:\n---\nEMAIL [NUMBER] - [NAME]\nSubject line: [subject]\nPreview text: [one sentence extending the hook]\n\nBody:\n[Full email]\n---",
  "youtube": "You are an expert YouTube content strategist. Read both source documents and produce 10 YouTube video outlines that build trust, demonstrate authority, and sell without selling.\n\nThese videos must:\n- Teach something genuinely valuable and complete in every video\n- Stand alone - each watchable without the others and delivers full value\n- Build cumulatively - together they progressively dismantle every objection\n- Sell through education - mechanism is taught not pitched. CTA always soft, always end only, never mid-video\n- Sound like a real practitioner talking - direct, specific, conversational\n- Use exact language from the VSL - the lines that landed anchor the videos\n\nTHE 10-VIDEO MIX:\n2 Framework/System videos - teach complete mechanism or major component as standalone framework\n2 Mistake/Correction videos - name specific mistake, explain why wrong, teach right approach (category attack in teaching format)\n2 Current State videos - address something happening now in avatar's world that makes mechanism more relevant\n1 Step-by-Step Tutorial - complete actionable walkthrough of one specific process\n1 Concept Education video - teaches a distinction market doesn't have language for, names what avatar's been experiencing\n1 Client Interview/Proof Story - coach interviews client or tells story in depth, full emotional arc\n1 Origin Story/Belief video - coach's full story, where they were, discovered, built\n\nVIDEO STRUCTURE (apply to all 10):\nHook (0-15s): Bold opening claim, no preamble, straight to point, pull from VSL language\nCredibility anchor (15-30s): Specific, attached to THIS video's topic\nCategory attack/problem frame (30-90s): Name what's wrong before teaching right way\nCore teaching (bulk): Specific, structured, named. Client proof woven in as examples - NEVER separate testimonial section\nSoft CTA (final 30s only): One mention at end, never mid-video, invitation not pitch\n\nCUMULATIVE BELIEF LADDER:\nBefore any video, output a paragraph mapping the belief ladder across all 10 - which video handles which belief shift, how someone who watches all 10 is set up to book a call.\n\nTITLE RULES:\n- Signal clearly what it teaches AND create curiosity/identification\n- So specific it couldn't be a title for a different coach in a different niche\n\nHARD RULES:\n- Never start with \"Hey guys\" or \"Welcome back\"\n- Never pitch mid-video\n- Never create testimonial section\n- Never teach generic content\n- Never use vague proof\n- Never make avatar feel blamed for past failures\n\nOUTPUT FORMAT for each video:\n---\nVIDEO [NUMBER] - [TYPE]\nTitle: [Full YouTube title]\nPrimary belief this video installs: [one sentence]\nHook (0-15s): [exact language, pull from VSL]\nCredibility anchor: [specific to this video's topic]\nCategory attack/problem frame: [industry flaw this video addresses]\nCore teaching outline: [structured with proof woven in]\nProof integration: [which client story, which teaching point it validates]\nSoft CTA: [end-only, invitation not pitch]\n---",
  "chat": "You are a direct response copywriting expert and VSL production specialist working inside a client's VSL pipeline tool. You have full context of the work in progress and your job is to help the user refine, adjust, or improve specific outputs without changing the core system or prompts.\n\nYou know:\n- The current active stage: <<STAGE_NAME>>\n- The current stage output is provided in context below\n- The merged VSL input document is provided if available\n- The VSL script is provided if available\n\nYOUR ROLE:\n- Help the user tweak specific sections of any output\n- Answer questions about why something was written a certain way\n- Suggest improvements when asked\n- Rewrite specific sections when instructed\n- Be specific and direct - give them usable copy they can paste in, not vague advice\n\nIMPORTANT:\n- When you rewrite something, make it clear exactly what to replace and with what\n- Keep all rewrites in the same voice and style as the original\n- Never rewrite entire documents unprompted - work on specific sections\n- If they ask you to make something more aggressive/casual/specific - do it, don't explain it\n- Keep responses focused and actionable\n\nCURRENT CONTEXT:\n<<CONTEXT_BLOCK>>",
};

const STAGE_ID_TO_STAGE_NAME = {
  2: "merge",
  3: "headlines",
  4: "vsl",
  5: "slides",
  6: "ads",
  7: "emails",
  8: "youtube",
};

const MODEL = "claude-sonnet-4-6";

function isPipelineRequest(body) {
  return (
    body &&
    (body.stageId === "chat" ||
      (typeof body.stageId === "number" &&
        body.stageId >= 2 &&
        body.stageId <= 8))
  );
}

function buildUserContentForStage(stageName, body) {
  const intakeDoc = String(body.intakeDoc ?? "");
  const onboardNotes = String(body.onboardNotes ?? "");
  const transcript = String(body.transcript ?? "");
  const mergedInput = String(body.mergedInput ?? "");
  const vslScript = String(body.vslScript ?? "");
  switch (stageName) {
    case "merge":
      return `INTAKE DOCUMENT:\n\n${intakeDoc}\n\nONBOARD NOTES:\n\n${onboardNotes}\n\n${transcript ? `ONBOARD TRANSCRIPT:\n\n${transcript}` : ""}`;
    case "headlines":
      return `MERGED VSL INPUT DOCUMENT:\n\n${mergedInput}\n\nVSL SCRIPT:\n\n${vslScript || "(VSL not yet generated - generate headlines based on merged input only)"}`;
    case "vsl":
      return `VSL INPUT DOCUMENT:\n\n${mergedInput}`;
    case "slides":
    case "ads":
      return `VSL SCRIPT:\n\n${vslScript}`;
    case "emails":
    case "youtube":
      return `MERGED VSL INPUT DOCUMENT:\n\n${mergedInput}\n\nVSL SCRIPT:\n\n${vslScript}`;
    default:
      return "";
  }
}

function buildChatSystem(body) {
  const stageName =
    typeof body.activeStageName === "string" ? body.activeStageName : "this stage";
  const currentRaw = String(body.currentStageOutput ?? "");
  const mergedRaw = String(body.mergedInputDoc ?? "");
  const vslRaw = String(body.vslScript ?? "");
  let contextBlock = "";
  if (currentRaw) {
    const slice = currentRaw.substring(0, 2000);
    contextBlock += `CURRENT STAGE OUTPUT (${stageName}):\n${slice}${currentRaw.length > 2000 ? "...[truncated]" : ""}`;
  } else {
    contextBlock += "No output generated yet for this stage.";
  }
  if (mergedRaw) {
    contextBlock += `\n\nMERGED INPUT DOC:\n${mergedRaw.substring(0, 1000)}...`;
  }
  if (vslRaw) {
    contextBlock += `\n\nVSL SCRIPT (first 800 chars):\n${vslRaw.substring(0, 800)}...`;
  }
  return PROMPTS.chat
    .replace("<<STAGE_NAME>>", stageName)
    .replace("<<CONTEXT_BLOCK>>", contextBlock);
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter((m) => m && (m.role === "user" || m.role === "assistant"))
    .map((m) => ({
      role: m.role,
      content: typeof m.content === "string" ? m.content : String(m.content ?? ""),
    }));
}

function buildPipelineAnthropicBody(body) {
  let stageName;
  if (body.stageId === "chat") {
    stageName = "chat";
  } else {
    stageName = STAGE_ID_TO_STAGE_NAME[body.stageId];
  }
  if (!stageName || !PROMPTS[stageName]) {
    return { error: `Invalid stageId for pipeline: ${JSON.stringify(body.stageId)}` };
  }

  const max_tokens =
    stageName === "chat"
      ? typeof body.maxTokens === "number" && body.maxTokens > 0
        ? body.maxTokens
        : 1500
      : stageName === "youtube"
        ? 8000
        : typeof body.maxTokens === "number" && body.maxTokens > 0
          ? body.maxTokens
          : 4000;

  if (stageName === "chat") {
    const system = buildChatSystem(body);
    const messages = sanitizeMessages(body.messages);
    if (!messages.length) {
      return { error: "messages array is required for chat" };
    }
    return {
      ok: true,
      payload: { model: MODEL, max_tokens, system, messages },
    };
  }

  const system = PROMPTS[stageName];
  const userContent = buildUserContentForStage(stageName, body);
  if (!userContent.trim()) {
    return { error: "Missing content for this stage" };
  }
  return {
    ok: true,
    payload: {
      model: MODEL,
      max_tokens,
      system,
      messages: [{ role: "user", content: userContent }],
    },
  };
}

async function forwardAnthropic(anthropicBody, key) {
  const payload = JSON.stringify(anthropicBody);
  const systemLen =
    typeof anthropicBody.system === "string"
      ? anthropicBody.system.length
      : anthropicBody.system != null
        ? JSON.stringify(anthropicBody.system).length
        : 0;
  const messagesSummary = Array.isArray(anthropicBody.messages)
    ? anthropicBody.messages.map((m, i) => ({
        index: i,
        role: m?.role,
        contentChars:
          typeof m?.content === "string"
            ? m.content.length
            : m?.content != null
              ? JSON.stringify(m.content).length
              : 0,
      }))
    : { error: "body.messages is not an array", value: anthropicBody.messages };

  console.log("[/api/claude] Outbound request summary:", {
    model: anthropicBody?.model,
    max_tokens: anthropicBody?.max_tokens,
    systemPromptChars: systemLen,
    messages: messagesSummary,
    payloadTotalChars: payload.length,
  });

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[/api/claude] Anthropic attempt ${attempt}/${maxAttempts}`);
    console.log(
      "[/api/claude] Outbound raw JSON body (complete string sent to Anthropic, pipeline path):",
      payload,
    );
    console.log(
      "[/api/claude] Outbound raw JSON body UTF-8 byte length (pipeline path):",
      Buffer.byteLength(payload, "utf8"),
    );

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: payload,
    });

    const responseHeaders = Object.fromEntries(upstream.headers.entries());
    console.log(
      "[/api/claude] Anthropic response HTTP:",
      upstream.status,
      upstream.statusText,
    );
    console.log(
      "[/api/claude] Anthropic response headers (complete):",
      JSON.stringify(responseHeaders, null, 2),
    );

    const rawText = await upstream.text();
    const status = upstream.status;

    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseErr) {
      console.error(
        "[/api/claude] Anthropic returned non-JSON. HTTP status:",
        status,
      );
      console.error("[/api/claude] Anthropic raw body (full):", rawText);
      return parseFailureResponse(status, rawText, parseErr);
    }

    if (upstream.ok) {
      console.log("[/api/claude] Anthropic OK, HTTP status:", status);
      return Response.json(data, { status });
    }

    console.error(
      "[/api/claude] Anthropic error — HTTP status:",
      status,
      "| full JSON body:",
      JSON.stringify(data, null, 2),
    );

    const overloaded =
      status === 529 ||
      status === 503 ||
      data?.error?.type === "overloaded_error";

    if (!overloaded || attempt === maxAttempts) {
      return anthropicErrorResponse(status, data);
    }

    const retryAfterSec = parseInt(
      upstream.headers.get("retry-after") || "",
      10,
    );
    const backoffMs = Math.min(8000, 1000 * 2 ** (attempt - 1));
    const delayMs = Number.isFinite(retryAfterSec)
      ? Math.min(15000, Math.max(500, retryAfterSec * 1000))
      : backoffMs;

    console.warn(
      `[/api/claude] Anthropic overloaded (${status}), retry ${attempt + 1}/${maxAttempts} after ${delayMs}ms`,
    );
    await sleep(delayMs);
  }
}

export async function POST(request) {
  console.log("[/api/claude] POST received");

  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    console.log("[/api/claude] ANTHROPIC_API_KEY is missing or empty");
    return Response.json(
      {
        type: "error",
        error: {
          type: "configuration_error",
          message: "ANTHROPIC_API_KEY is not set on the server.",
          details: { env: "ANTHROPIC_API_KEY missing or empty" },
          httpStatus: 500,
        },
      },
      { status: 500 },
    );
  }

  console.log(
    "[/api/claude] ANTHROPIC_API_KEY prefix (first 8 chars only):",
    `${key.slice(0, 8)}...`,
  );

  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error("[/api/claude] Invalid JSON body:", err);
    return Response.json(
      {
        type: "error",
        error: {
          type: "invalid_request_error",
          message: "Invalid JSON body.",
          details: { parseError: String(err) },
          httpStatus: 400,
        },
      },
      { status: 400 },
    );
  }

  if (isPipelineRequest(body)) {
    console.log("[/api/claude] pipeline mode, stageId:", body.stageId);
    const built = buildPipelineAnthropicBody(body);
    if (built.error) {
      return Response.json(
        {
          type: "error",
          error: {
            type: "invalid_request_error",
            message: built.error,
            details: { stageId: body.stageId, validation: built.error },
            httpStatus: 400,
          },
        },
        { status: 400 },
      );
    }
    return forwardAnthropic(built.payload, key);
  }

  console.log("[/api/claude] forwarding to Anthropic, model:", body?.model);

  const payload = JSON.stringify(body);

  const systemLen =
    typeof body.system === "string"
      ? body.system.length
      : body.system != null
        ? JSON.stringify(body.system).length
        : 0;

  const messagesSummary = Array.isArray(body.messages)
    ? body.messages.map((m, i) => ({
        index: i,
        role: m?.role,
        contentChars:
          typeof m?.content === "string"
            ? m.content.length
            : m?.content != null
              ? JSON.stringify(m.content).length
              : 0,
      }))
    : { error: "body.messages is not an array", value: body.messages };

  console.log("[/api/claude] Outbound request summary:", {
    model: body?.model,
    max_tokens: body?.max_tokens,
    systemPromptChars: systemLen,
    messages: messagesSummary,
    payloadTotalChars: payload.length,
  });

  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`[/api/claude] Anthropic attempt ${attempt}/${maxAttempts}`);
    console.log(
      "[/api/claude] Outbound raw JSON body (complete string sent to Anthropic, legacy/intake path):",
      payload,
    );
    console.log(
      "[/api/claude] Outbound raw JSON body UTF-8 byte length (legacy/intake path):",
      Buffer.byteLength(payload, "utf8"),
    );

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: payload,
    });

    const responseHeaders = Object.fromEntries(upstream.headers.entries());
    console.log(
      "[/api/claude] Anthropic response HTTP:",
      upstream.status,
      upstream.statusText,
    );
    console.log(
      "[/api/claude] Anthropic response headers (complete):",
      JSON.stringify(responseHeaders, null, 2),
    );

    const rawText = await upstream.text();
    const status = upstream.status;

    let data;
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch (parseErr) {
      console.error(
        "[/api/claude] Anthropic returned non-JSON. HTTP status:",
        status,
      );
      console.error("[/api/claude] Anthropic raw body (full):", rawText);
      return parseFailureResponse(status, rawText, parseErr);
    }

    if (upstream.ok) {
      console.log("[/api/claude] Anthropic OK, HTTP status:", status);
      return Response.json(data, { status });
    }

    console.error(
      "[/api/claude] Anthropic error — HTTP status:",
      status,
      "| full JSON body:",
      JSON.stringify(data, null, 2),
    );

    const overloaded =
      status === 529 ||
      status === 503 ||
      data?.error?.type === "overloaded_error";

    if (!overloaded || attempt === maxAttempts) {
      return anthropicErrorResponse(status, data);
    }

    const retryAfterSec = parseInt(
      upstream.headers.get("retry-after") || "",
      10,
    );
    const backoffMs = Math.min(8000, 1000 * 2 ** (attempt - 1));
    const delayMs = Number.isFinite(retryAfterSec)
      ? Math.min(15000, Math.max(500, retryAfterSec * 1000))
      : backoffMs;

    console.warn(
      `[/api/claude] Anthropic overloaded (${status}), retry ${attempt + 1}/${maxAttempts} after ${delayMs}ms`,
    );
    await sleep(delayMs);
  }
}
