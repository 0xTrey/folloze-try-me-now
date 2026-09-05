const wireframes = [
  {
    id: "account-executive",
    code: "A1",
    family: "account",
    title: "Executive account narrative",
    grammarId: "editorial-split",
    grammar: "G1 · Editorial split",
    condition:
      "The account opportunity is strategic or cross-functional and no stronger specialist signal exists.",
    sections: [
      "Opportunity for the target account",
      "The strongest reason to believe",
      "Why this matters now",
      "Three priorities worth exploring",
      "How the outcome is created",
      "What each team needs",
      "Map the first useful move",
    ],
    cta: "A working session with a named deliverable.",
  },
  {
    id: "account-technical",
    code: "A2",
    family: "account",
    title: "Technical evaluation",
    grammarId: "workflow-spine",
    grammar: "G4 · Workflow spine",
    condition:
      "The audience includes architecture, security, data, infrastructure, IT, or platform leadership.",
    sections: [
      "Technical outcome for the target account",
      "Verified platform or architecture anchor",
      "Constraints the team must resolve",
      "Three validation tracks",
      "Architecture or workflow sequence",
      "Requirements, risks, and evidence by owner",
      "Scope a technical validation session",
    ],
    cta: "Architecture review, technical workshop, or bounded pilot definition.",
  },
  {
    id: "account-proof",
    code: "A3",
    family: "account",
    title: "Proof-led business case",
    grammarId: "evidence-lead",
    grammar: "G2 · Evidence lead",
    condition: "Approved customer evidence, quantified outcomes, or strong first-party proof exists.",
    sections: [
      "Supported result and relevance to the account",
      "What changed for the reference customer",
      "Why the status quo remains expensive or risky",
      "Three implications for the target account",
      "Mechanism behind the result",
      "Evidence the target team should validate",
      "Build the account-specific business case",
    ],
    cta: "A business-case workshop or proof review with a concrete output.",
  },
  {
    id: "account-team",
    code: "A4",
    family: "account",
    title: "Buying-team alignment",
    grammarId: "interactive-paths",
    grammar: "G3 · Interactive paths",
    condition:
      "Three or more distinct roles influence the decision, or the objective is to educate the buying group.",
    sections: [
      "One shared outcome for the target account",
      "Common reason to believe",
      "Why alignment matters now",
      "Choose a role or priority",
      "Shared operating mechanism",
      "Decision, risk, benefit, and evidence by role",
      "Align on the first decision",
    ],
    cta: "A multi-role working session with an alignment map.",
  },
  {
    id: "account-workshop",
    code: "A5",
    family: "account",
    title: "Innovation workshop",
    grammarId: "editorial-split",
    grammar: "G1 + G3 · Editorial split with paths",
    condition:
      "The initiative is emerging, discovery-led, or framed around a new capability rather than a fixed purchase.",
    sections: [
      "Opportunity worth exploring",
      "Evidence that the opportunity is real",
      "Why the window matters",
      "Three hypotheses to test",
      "What the teams would map together",
      "Workshop inputs and outputs",
      "Run the innovation workshop",
    ],
    cta: "A workshop whose deliverable and decision are explicit.",
  },
  {
    id: "campaign-product",
    code: "C1",
    family: "campaign",
    title: "Product introduction",
    grammarId: "editorial-split",
    grammar: "G1 · Editorial split",
    condition: "The visitor supplies a product page, product document, or explicit product description.",
    sections: [
      "Product promise for the selected audience",
      "Strongest supported reason to believe",
      "The operating change behind the launch",
      "Three use cases or starting points",
      "How the product creates the outcome",
      "Value and evidence by role",
      "Choose the first use case",
    ],
    cta: "Explore a use case, request a demonstration, or plan an evaluation.",
  },
  {
    id: "campaign-demand",
    code: "C2",
    family: "campaign",
    title: "Demand and category education",
    grammarId: "interactive-paths",
    grammar: "G3 · Interactive paths",
    condition:
      "The objective is awareness, education, or demand creation, and the offer is broader than one product.",
    sections: [
      "The problem worth understanding",
      "What credible evidence says",
      "Why the old approach persists",
      "Choose the problem closest to you",
      "A better operating model",
      "What changes for each team",
      "Continue with one useful action",
    ],
    cta: "Explore, assess, or discuss the selected problem.",
  },
  {
    id: "campaign-use-case",
    code: "C3",
    family: "campaign",
    title: "Use-case solution campaign",
    grammarId: "workflow-spine",
    grammar: "G4 · Workflow spine",
    condition: "The input names a specific buyer job, workflow, or operational outcome.",
    sections: [
      "One buyer job and one promised outcome",
      "Capability that makes the outcome credible",
      "Where the current workflow breaks",
      "Three ways into the use case",
      "Action, capability, and output sequence",
      "Ownership and evidence by role",
      "Scope the first workflow",
    ],
    cta: "Map, validate, or pilot the workflow.",
  },
  {
    id: "campaign-event",
    code: "C4",
    family: "campaign",
    title: "Event or webinar",
    grammarId: "chapter-journey",
    grammar: "G6 · Chapter journey",
    condition: "The input includes event details, a registration objective, or a webinar source.",
    sections: [
      "Why this session is worth the time",
      "Speaker, source, or topic credibility",
      "Why the topic matters now",
      "Three reasons to attend or keep exploring",
      "Agenda, chapters, or takeaways",
      "Who should join and what they will leave with",
      "Register or continue the conversation",
    ],
    cta: "Register, watch, or continue with one topic.",
  },
  {
    id: "campaign-proof",
    code: "C5",
    family: "campaign",
    title: "Customer proof campaign",
    grammarId: "evidence-lead",
    grammar: "G2 · Evidence lead",
    condition: "An approved customer story or quantified outcome is the primary source.",
    sections: [
      "Approved outcome",
      "Customer or source credibility",
      "Before and after",
      "Three lessons for the audience",
      "Mechanism behind the result",
      "What another team should validate",
      "Explore a similar path",
    ],
    cta: "Review the evidence, explore the use case, or plan a proof session.",
  },
  {
    id: "campaign-nurture",
    code: "C6",
    family: "campaign",
    title: "Launch follow-up and nurture",
    grammarId: "chapter-journey",
    grammar: "G6 + G3 · Chapter journey with paths",
    condition:
      "The objective is follow-up, continued engagement, or resource discovery after a launch or event.",
    sections: [
      "What changed or what to remember",
      "Strongest supporting fact",
      "Why it matters after the announcement",
      "Choose an interest path",
      "Resources arranged as a guided sequence",
      "Questions to bring to the next conversation",
      "Take the next useful action",
    ],
    cta: "Open a resource, compare paths, or schedule follow-up.",
  },
  {
    id: "content-report",
    code: "M1",
    family: "content",
    title: "Executive report",
    grammarId: "editorial-split",
    grammar: "G1 · Editorial split",
    condition:
      "The source is a report, white paper, executive brief, or long-form PDF without benchmark data as its main value.",
    sections: [
      "Source identity and the central takeaway",
      "Executive summary in three points",
      "The argument behind the takeaway",
      "Choose a finding to explore",
      "Evidence and cited excerpts",
      "What the findings may mean for your team",
      "Read the source or continue the conversation",
    ],
    cta: "Open the original source or continue with one finding.",
  },
  {
    id: "content-guide",
    code: "M2",
    family: "content",
    title: "Playbook and guide",
    grammarId: "interactive-paths",
    grammar: "G3 · Interactive paths",
    condition: "The source teaches a process, framework, checklist, or set of practices.",
    sections: [
      "What the guide helps the reader do",
      "The core principle",
      "Choose a chapter or job",
      "Guided steps from the source",
      "Examples, checklists, or supporting excerpts",
      "Apply the guide to one situation",
      "Keep the original guide or use the framework",
    ],
    cta: "Keep the original guide or apply the framework.",
  },
  {
    id: "content-research",
    code: "M3",
    family: "content",
    title: "Research and benchmark explorer",
    grammarId: "data-story",
    grammar: "G5 · Data story",
    condition: "The source contains primary research, survey data, benchmarks, or several cited findings.",
    sections: [
      "The most important cited finding",
      "Research scope and credibility",
      "Three findings worth exploring",
      "Interactive benchmark or finding explorer",
      "What the evidence supports and does not support",
      "Locate your situation without inventing a score",
      "Read the methodology or discuss the implication",
    ],
    cta: "Read the methodology or discuss one implication.",
  },
  {
    id: "content-technical",
    code: "M4",
    family: "content",
    title: "Technical document walkthrough",
    grammarId: "workflow-spine",
    grammar: "G4 · Workflow spine",
    condition:
      "The source is a product brief, architecture guide, technical paper, implementation guide, or reference document.",
    sections: [
      "System outcome described by the source",
      "Architecture or component overview",
      "Constraints and prerequisites",
      "Choose a technical path",
      "Workflow, architecture, or implementation sequence",
      "Validation checklist with cited references",
      "Open the source or scope a technical review",
    ],
    cta: "Open the source or scope a technical review.",
  },
  {
    id: "content-webinar",
    code: "M5",
    family: "content",
    title: "Webinar and video companion",
    grammarId: "chapter-journey",
    grammar: "G6 · Chapter journey",
    condition: "The source is a webinar, presentation recording, transcript, or chaptered video.",
    sections: [
      "Topic, speaker, and central idea",
      "Why the speaker or source is credible",
      "Key takeaways",
      "Chapter or clip navigator",
      "Supporting resources and cited moments",
      "Questions worth carrying forward",
      "Watch the full source or continue with one topic",
    ],
    cta: "Watch the full source or continue with one topic.",
  },
  {
    id: "content-assessment",
    code: "M6",
    family: "content",
    title: "Assessment workbench",
    grammarId: "data-story",
    grammar: "G5 + G3 · Data story with paths",
    condition: "The objective is evaluation, qualification, self-assessment, or applying a source framework.",
    sections: [
      "Framework or decision the source helps evaluate",
      "Source-backed dimensions",
      "Guided diagnostic questions",
      "Transparent result or maturity pattern",
      "Gaps, implications, and cited recommendations",
      "Suggested next actions with no invented certainty",
      "Save the result or apply it in a working session",
    ],
    cta: "Save the result or apply it in a working session.",
  },
];

const familyNames = {
  account: "Account",
  campaign: "Campaign",
  content: "Content",
};

const accentColors = {
  account: "#df5c2f",
  campaign: "#1466d9",
  content: "#087c70",
};

const storageKey = "folloze-wireframe-review-v1";
const grid = document.querySelector("#wireframe-grid");
const template = document.querySelector("#wireframe-card-template");
const searchInput = document.querySelector("#wireframe-search");
const resultsCount = document.querySelector("#results-count");
const emptyState = document.querySelector("#empty-state");
const clearReviewsButton = document.querySelector("#clear-reviews");
const dialog = document.querySelector("#wireframe-dialog");

let familyFilter = "all";
let statusFilter = "all";
let searchTerm = "";
let dialogId = null;
let returnFocus = null;
let reviewStates = loadReviews();

function loadReviews() {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveReviews() {
  try {
    localStorage.setItem(storageKey, JSON.stringify(reviewStates));
  } catch {
    // The gallery remains fully usable when local persistence is unavailable.
  }
}

function getStatus(id) {
  return reviewStates[id] === "approved" || reviewStates[id] === "revise"
    ? reviewStates[id]
    : "unreviewed";
}

function statusLabel(status) {
  if (status === "approved") return "Keep";
  if (status === "revise") return "Needs edits";
  return "Open review";
}

function visualMarkup(wireframe) {
  return `
    <span class="mini-canvas grammar-${wireframe.grammarId}" aria-hidden="true">
      <span class="mini-nav"><span></span><span></span></span>
      <span class="mini-hero">
        <span class="mini-copy">
          <span class="mini-title"></span>
          <span class="mini-body"></span>
          <span class="mini-button"></span>
        </span>
        <span class="mini-media"></span>
      </span>
      <span class="mini-modules">
        <span class="mini-module"></span>
        <span class="mini-module"></span>
        <span class="mini-module"></span>
      </span>
    </span>`;
}

function matchesFilters(wireframe) {
  if (familyFilter !== "all" && wireframe.family !== familyFilter) return false;
  if (statusFilter !== "all" && getStatus(wireframe.id) !== statusFilter) return false;

  if (!searchTerm) return true;
  const searchable = [
    wireframe.code,
    wireframe.title,
    wireframe.family,
    wireframe.grammar,
    wireframe.condition,
    wireframe.cta,
    ...wireframe.sections,
  ]
    .join(" ")
    .toLowerCase();

  return searchable.includes(searchTerm);
}

function visibleWireframes() {
  return wireframes.filter(matchesFilters);
}

function render() {
  const visible = visibleWireframes();
  grid.replaceChildren();

  visible.forEach((wireframe) => {
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector(".wireframe-card");
    const status = getStatus(wireframe.id);

    card.dataset.id = wireframe.id;
    card.dataset.family = wireframe.family;
    card.dataset.status = status;
    card.style.setProperty("--accent", accentColors[wireframe.family]);
    card.querySelector(".family-label").textContent = `${wireframe.code} · ${familyNames[wireframe.family]}`;
    card.querySelector(".status-label").textContent = statusLabel(status);
    card.querySelector(".card-visual").innerHTML = visualMarkup(wireframe);
    card.querySelector(".grammar-label").textContent = wireframe.grammar;
    card.querySelector("h3").textContent = wireframe.title;
    card.querySelector(".condition-copy").textContent = wireframe.condition;
    card.querySelector(".card-cta p").textContent = wireframe.cta;

    const openButtons = card.querySelectorAll(".visual-trigger, .details-button");
    openButtons.forEach((button) => {
      button.addEventListener("click", () => openDialog(wireframe.id, button));
    });

    card.querySelectorAll("[data-mark]").forEach((button) => {
      const buttonStatus = button.dataset.mark;
      button.setAttribute("aria-pressed", String(status === buttonStatus));
      button.addEventListener("click", () => toggleReview(wireframe.id, buttonStatus));
    });

    grid.appendChild(fragment);
  });

  const familyPhrase = familyFilter === "all" ? "wireframes" : `${familyNames[familyFilter].toLowerCase()} wireframes`;
  resultsCount.textContent = `Showing ${visible.length} ${familyPhrase}`;
  emptyState.hidden = visible.length > 0;
  grid.hidden = visible.length === 0;
  updateReviewMeter();
}

function updateReviewMeter() {
  const reviewed = wireframes.filter((wireframe) => getStatus(wireframe.id) !== "unreviewed").length;
  document.querySelector("#review-count").textContent = `${reviewed} of ${wireframes.length} reviewed`;
  document.querySelector("#review-progress").style.width = `${(reviewed / wireframes.length) * 100}%`;
  clearReviewsButton.disabled = reviewed === 0;
}

function toggleReview(id, nextStatus) {
  reviewStates[id] = getStatus(id) === nextStatus ? "unreviewed" : nextStatus;
  saveReviews();
  render();

  if (dialog.open && dialogId === id) updateDialogReview(id);
}

function setFilterButtons(containerSelector, attribute, value) {
  document.querySelectorAll(`${containerSelector} [data-${attribute}]`).forEach((button) => {
    const active = button.dataset[attribute] === value;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-pressed", String(active));
  });
}

function bindFilters() {
  document.querySelectorAll("#family-filters [data-family]").forEach((button) => {
    button.addEventListener("click", () => {
      familyFilter = button.dataset.family;
      setFilterButtons("#family-filters", "family", familyFilter);
      render();
    });
  });

  document.querySelectorAll("#status-filters [data-status]").forEach((button) => {
    button.addEventListener("click", () => {
      statusFilter = button.dataset.status;
      setFilterButtons("#status-filters", "status", statusFilter);
      render();
    });
  });

  searchInput.addEventListener("input", () => {
    searchTerm = searchInput.value.trim().toLowerCase();
    render();
  });

  document.querySelector("#reset-filters").addEventListener("click", resetFilters);

  clearReviewsButton.addEventListener("click", () => {
    reviewStates = {};
    saveReviews();
    render();
  });
}

function resetFilters() {
  familyFilter = "all";
  statusFilter = "all";
  searchTerm = "";
  searchInput.value = "";
  setFilterButtons("#family-filters", "family", familyFilter);
  setFilterButtons("#status-filters", "status", statusFilter);
  render();
}

function openDialog(id, trigger) {
  dialogId = id;
  returnFocus = trigger;
  populateDialog(id);
  if (!dialog.open) dialog.showModal();
  document.querySelector("#dialog-close").focus();
}

function populateDialog(id) {
  const wireframe = wireframes.find((item) => item.id === id);
  if (!wireframe) return;

  dialog.style.setProperty("--accent", accentColors[wireframe.family]);
  document.querySelector("#dialog-family").textContent = `${familyNames[wireframe.family]} · ${wireframe.code}`;
  document.querySelector("#dialog-title").textContent = wireframe.title;
  document.querySelector("#dialog-visual").innerHTML = visualMarkup(wireframe);
  document.querySelector("#dialog-grammar").textContent = wireframe.grammar;
  document.querySelector("#dialog-condition").textContent = wireframe.condition;
  document.querySelector("#dialog-cta").textContent = wireframe.cta;

  const sectionList = document.querySelector("#dialog-sections");
  sectionList.replaceChildren();
  wireframe.sections.forEach((section) => {
    const item = document.createElement("li");
    item.textContent = section;
    sectionList.appendChild(item);
  });

  const currentIndex = wireframes.findIndex((item) => item.id === id);
  document.querySelector("#dialog-position").textContent = `${currentIndex + 1} / ${wireframes.length}`;
  updateDialogReview(id);
}

function updateDialogReview(id) {
  const currentStatus = getStatus(id);
  document.querySelectorAll("[data-dialog-status]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.dialogStatus === currentStatus));
  });
}

function navigateDialog(direction) {
  const currentIndex = wireframes.findIndex((item) => item.id === dialogId);
  const nextIndex = (currentIndex + direction + wireframes.length) % wireframes.length;
  dialogId = wireframes[nextIndex].id;
  populateDialog(dialogId);
}

function bindDialog() {
  document.querySelector("#dialog-close").addEventListener("click", () => dialog.close());
  document.querySelector("#dialog-prev").addEventListener("click", () => navigateDialog(-1));
  document.querySelector("#dialog-next").addEventListener("click", () => navigateDialog(1));

  document.querySelectorAll("[data-dialog-status]").forEach((button) => {
    button.addEventListener("click", () => toggleReview(dialogId, button.dataset.dialogStatus));
  });

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });

  dialog.addEventListener("close", () => {
    if (returnFocus?.isConnected) returnFocus.focus();
  });
}

bindFilters();
bindDialog();
render();
