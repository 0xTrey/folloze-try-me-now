export interface SimulatedEngagementSignal {
  id: string;
  actorLabel: string;
  roleLabel: string;
  label: string;
  detail: string;
  atLabel: string;
  type: "view" | "choice" | "cta";
  isExample: true;
}

const PLACEHOLDER_NAMES = ["John Smith", "Sarah Chen", "Michael Torres"] as const;

const ROLE_SETS: Array<{ match: RegExp; roles: readonly [string, string, string] }> = [
  {
    match: /security|risk|identity|compliance|resilience/i,
    roles: ["Chief Information Security Officer", "Director of Security Architecture", "Security Operations Lead"]
  },
  {
    match: /marketing|demand|campaign|brand|abm|revenue/i,
    roles: ["VP Marketing", "Director of Demand Generation", "Revenue Operations Lead"]
  },
  {
    match: /integration|architect|platform|technical|automation|developer/i,
    roles: ["VP Enterprise Architecture", "Director of Integration", "Platform Operations Lead"]
  },
  {
    match: /data|analytics|ai|machine learning|intelligence/i,
    roles: ["Chief Data Officer", "Director of Data Platforms", "AI Governance Lead"]
  },
  {
    match: /finance|procurement|spend|accounting/i,
    roles: ["VP Finance Transformation", "Director of Procurement", "Finance Systems Lead"]
  },
  {
    match: /sales|enablement|commercial|go.to.market/i,
    roles: ["VP Sales", "Director of Sales Enablement", "Revenue Operations Lead"]
  }
];

const DEFAULT_ROLES = ["Executive Sponsor", "Program Director", "Operations Lead"] as const;

function seededNumber(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function clock(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function rolesForAudience(audienceLabel: string | undefined): readonly [string, string, string] {
  return ROLE_SETS.find(({ match }) => match.test(audienceLabel ?? ""))?.roles ?? DEFAULT_ROLES;
}

export function buildSimulatedEngagement(input: {
  sessionId: string;
  audienceLabel?: string;
}): SimulatedEngagementSignal[] {
  const seed = seededNumber(input.sessionId || "example-session");
  const roles = rolesForAudience(input.audienceLabel);
  const dwellSeconds = 111 + (seed % 93);
  const selectedLenses = 2 + ((seed >>> 4) % 2);

  return [
    {
      id: `example-${input.sessionId}-dwell`,
      actorLabel: PLACEHOLDER_NAMES[0],
      roleLabel: roles[0],
      label: `${PLACEHOLDER_NAMES[0]} spent ${clock(dwellSeconds)} with the experience`,
      detail: `${roles[0]} returned to the account thesis before opening the decision path.`,
      atLabel: "2m ago",
      type: "view",
      isExample: true
    },
    {
      id: `example-${input.sessionId}-lenses`,
      actorLabel: PLACEHOLDER_NAMES[1],
      roleLabel: roles[1],
      label: `${PLACEHOLDER_NAMES[1]} explored ${selectedLenses} decision lenses`,
      detail: `${roles[1]} showed depth beyond a single page view.`,
      atLabel: "1m ago",
      type: "choice",
      isExample: true
    },
    {
      id: `example-${input.sessionId}-cta`,
      actorLabel: PLACEHOLDER_NAMES[2],
      roleLabel: roles[2],
      label: `${PLACEHOLDER_NAMES[2]} clicked the next-step CTA`,
      detail: `${roles[2]} created a conversion-ready signal for the account team.`,
      atLabel: "Just now",
      type: "cta",
      isExample: true
    }
  ];
}
