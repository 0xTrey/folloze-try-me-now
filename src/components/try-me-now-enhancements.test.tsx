// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AnalyticsSignalPanel,
  AnalyticsSignalToast,
  AssetPicker,
  AudienceEvidenceTray,
  ContentSourceConfirmation,
  CtaStyleControl,
  EditBriefDrawer,
  EntryPathMicroDemo,
  ExperienceBlockControl,
  ExperienceVariantCards,
  ExpirySaveValuePanel,
  FollozeValueReceipt,
  InstantBrandLockStrip,
  MessageDirectionControl,
  PersonalizationQualityReceipt,
  ProgressiveArtifactStream,
  SavedExperienceCockpit,
  ToneChips
} from "./try-me-now-enhancements";

afterEach(() => cleanup());

describe("Try Me Now prospect enhancement components", () => {
  it("supports a primary entry path and a direct public example link", () => {
    const onSelect = vi.fn();
    const onExampleOpen = vi.fn();
    render(
      <EntryPathMicroDemo
        option={{
          id: "abm",
          index: "01",
          eyebrow: "1:1 ABM",
          title: "Break into one account",
          description: "Build around one company and buying group.",
          actionLabel: "Build a 1:1 experience",
          exampleLabel: "See a Cisco example",
          exampleUrl: "https://engage.folloze.com/cisco-hmf-example",
          demoSteps: ["Seller", "Account signal", "1:1 experience"]
        }}
        onSelect={onSelect}
        onExampleOpen={onExampleOpen}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Build a 1:1 experience/i }));
    expect(onSelect).toHaveBeenCalledWith("abm");
    const exampleLink = screen.getByRole("link", { name: /See a Cisco example/i });
    expect(exampleLink).toHaveAttribute(
      "href",
      "https://engage.folloze.com/cisco-hmf-example"
    );
    expect(exampleLink).toHaveAttribute("target", "_blank");
    expect(exampleLink).toHaveAttribute("rel", "noopener noreferrer");
    expect(exampleLink).toHaveAccessibleName("See a Cisco example (opens in a new tab)");
    fireEvent.click(exampleLink);
    expect(onExampleOpen).toHaveBeenCalledWith("abm");
  });

  it("shows the harvested logo, semantic palette, and source proof", () => {
    const inspect = vi.fn();
    const brand = {
      companyName: "ServiceNow",
      domain: "servicenow.com",
      logoUrl: "/api/sessions/servicenow-live-brief/image/seller-logo",
      colors: ["#032D42", "#63DF4E", "#FFFFFF", "#00718F", "#D7E0E6", "#E0F7DC"],
      primaryColor: "#032D42",
      accentColor: "#63DF4E",
      surfaceColor: "#FFFFFF",
      source: "brand-harvester" as const
    };
    const { rerender } = render(
      <InstantBrandLockStrip status="locked" brand={brand} onInspect={inspect} />
    );

    expect(screen.getByText("Identity and brand matched")).toBeInTheDocument();
    expect(screen.getByText("Domain matched to the public company site")).toBeInTheDocument();
    expect(screen.getByText("Logo + 6 colors from servicenow.com.")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "ServiceNow logo" }).getAttribute("src")).toContain(brand.logoUrl);
    expect(screen.getByLabelText("Harvested ServiceNow brand palette")).toBeInTheDocument();
    expect(screen.getByText("#032D42")).toBeInTheDocument();
    expect(screen.getByText("#63DF4E")).toBeInTheDocument();
    expect(screen.getByText("#FFFFFF")).toBeInTheDocument();
    expect(screen.getByText("#00718F")).toBeInTheDocument();
    expect(screen.getByText("6 colors captured")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect ServiceNow brand signals" }));
    expect(inspect).toHaveBeenCalledOnce();

    fireEvent.error(screen.getByRole("img", { name: "ServiceNow logo" }));
    expect(screen.queryByRole("img", { name: "ServiceNow logo" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("ServiceNow logo unavailable")).toHaveTextContent("Logo unavailable");
    expect(screen.getByText("#63DF4E")).toBeInTheDocument();

    rerender(
      <InstantBrandLockStrip
        status="locked"
        brand={{ ...brand, logoUrl: "/api/sessions/refreshed/image/seller-logo" }}
        onInspect={inspect}
      />
    );
    expect(screen.getByRole("img", { name: "ServiceNow logo" }).getAttribute("src")).toContain(
      "/api/sessions/refreshed/image/seller-logo"
    );
  });

  it("keeps scanning and fallback brand states visually honest", () => {
    const { rerender } = render(
      <InstantBrandLockStrip
        status="scanning"
        brand={{ companyName: "ServiceNow", domain: "servicenow.com" }}
      />
    );

    const scanning = screen.getByText("Scanning public brand").closest("section");
    expect(scanning).toHaveAttribute("aria-busy", "true");
    expect(screen.getByText("Checking logo, palette, typography, and source.")).toBeInTheDocument();
    expect(screen.getByLabelText("Brand palette is being detected")).toBeInTheDocument();
    expect(screen.queryByText("Harvested palette")).not.toBeInTheDocument();

    rerender(
      <InstantBrandLockStrip
        status="fallback"
        brand={{
          companyName: "ServiceNow",
          domain: "servicenow.com",
          colors: ["#1C293F", "#5B5BFF", "#FFFFFF"],
          primaryColor: "#1C293F",
          accentColor: "#5B5BFF",
          surfaceColor: "#FFFFFF",
          source: "fallback",
          readiness: {
            status: "incomplete",
            logoReady: false,
            paletteReady: false,
            sourceEvidenceReady: true,
            reasons: ["No verified logo was captured.", "The palette is still provisional."]
          }
        }}
      />
    );

    expect(screen.getByText("Brand evidence needs review")).toBeInTheDocument();
    expect(screen.getByText("No verified logo was captured. The palette is still provisional.")).toBeInTheDocument();
    expect(screen.getByText("Needs review")).toBeInTheDocument();
    expect(screen.getByLabelText("ServiceNow brand palette evidence needs review")).toBeInTheDocument();
    expect(screen.queryByText("Identity and brand matched")).not.toBeInTheDocument();
  });

  it("does not call a completed fast-extractor brand preliminary or still scanning", () => {
    render(
      <InstantBrandLockStrip
        status="locked"
        brand={{
          companyName: "Jitterbit",
          domain: "jitterbit.com",
          logoUrl: "/api/sessions/jitterbit/image/seller-logo",
          colors: ["#1B3E51", "#F44414", "#FEFEFE"],
          primaryColor: "#1B3E51",
          accentColor: "#F44414",
          surfaceColor: "#FEFEFE",
          source: "fast-extractor",
          readiness: {
            status: "ready",
            logoReady: true,
            paletteReady: true,
            sourceEvidenceReady: true,
            reasons: []
          }
        }}
      />
    );

    expect(screen.getByText("Identity and brand matched")).toBeInTheDocument();
    expect(screen.getByText("Captured")).toBeInTheDocument();
    expect(screen.getByText("Identity and brand matched").closest("section")).toHaveAttribute(
      "data-brand-evidence",
      "reviewed"
    );
    expect(screen.queryByText(/brand scan continuing/i)).not.toBeInTheDocument();
    expect(screen.queryByText("Preliminary")).not.toBeInTheDocument();
  });

  it("confirms source facts", () => {
    const confirm = vi.fn();
    const replace = vi.fn();
    render(
      <ContentSourceConfirmation
        source={{ title: "Jitterbit MCP for Enterprise AI", sourceLabel: "Public product page", host: "jitterbit.com", facts: ["Governed agent access", "Reusable enterprise capabilities"] }}
        onConfirm={confirm}
        onReplace={replace}
      />
    );

    expect(screen.getByText("Governed agent access")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Use this source" }));
    fireEvent.click(screen.getByRole("button", { name: "Use another source" }));
    expect(confirm).toHaveBeenCalledOnce();
    expect(replace).toHaveBeenCalledOnce();
  });

  it("explains audience evidence and exposes pin and exclusion controls", () => {
    const onSelect = vi.fn();
    const onPin = vi.fn();
    const onExclude = vi.fn();
    render(
      <AudienceEvidenceTray
        companyName="Cisco"
        selectedId="architecture"
        options={[{
          id: "architecture",
          label: "Enterprise integration architecture leaders",
          rationale: "Own the boundary between systems and automation.",
          evidence: [{ id: "e1", label: "Platform signal", detail: "Cisco publicly emphasizes platform-level connectivity.", sourceLabel: "Cisco.com" }]
        }]}
        onSelect={onSelect}
        onPin={onPin}
        onExclude={onExclude}
      />
    );

    const audience = screen.getByRole("button", { name: /Enterprise integration architecture leaders/i });
    expect(audience).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(audience);
    fireEvent.click(screen.getByRole("button", { name: "Pin" }));
    fireEvent.click(screen.getByRole("button", { name: "Exclude" }));
    expect(onSelect).toHaveBeenCalledWith("architecture");
    expect(onPin).toHaveBeenCalledWith("architecture", true);
    expect(onExclude).toHaveBeenCalledWith("architecture", true);
  });

  it("keeps evidence available while hiding analyst controls in the prospect flow", () => {
    render(
      <AudienceEvidenceTray
        simplified
        companyName="ServiceNow"
        selectedId="platform"
        options={[{
          id: "platform",
          label: "Automation architects and platform owners",
          rationale: "Recommended for ServiceNow because they shape enterprise workflow decisions.",
          evidence: [{ id: "e1", label: "Platform signal", detail: "ServiceNow emphasizes enterprise workflow orchestration." }]
        }]}
        onSelect={vi.fn()}
        onPin={vi.fn()}
        onExclude={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Automation architects and platform owners/i })).toBeInTheDocument();
    expect(screen.getByText("1 supporting signals")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pin" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Exclude" })).not.toBeInTheDocument();
  });

  it("keeps CTA tuning to label and style without asking for a type or URL", () => {
    const onMessage = vi.fn();
    const onCta = vi.fn();
    render(
      <>
        <MessageDirectionControl value={{ enabled: true, belief: "Fragmentation creates risk.", action: "Map the first boundary." }} onChange={onMessage} />
        <CtaStyleControl value={{ type: "meeting", label: "Book the workshop", style: "solid" }} onChange={onCta} />
      </>
    );

    fireEvent.change(screen.getByLabelText("What should the buyer believe?"), { target: { value: "Governed connections create leverage." } });
    fireEvent.change(screen.getByLabelText("Button label"), { target: { value: "Reserve my seat" } });
    fireEvent.click(screen.getByRole("button", { name: "Outline: Measured invitation" }));
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ belief: "Governed connections create leverage." }));
    expect(onCta).toHaveBeenCalledWith(expect.objectContaining({ type: "meeting", label: "Reserve my seat" }));
    expect(onCta).toHaveBeenCalledWith(expect.objectContaining({ type: "meeting", style: "outline" }));
    expect(screen.queryByRole("button", { name: "Register" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Destination URL/i)).not.toBeInTheDocument();
    expect(onCta.mock.calls.some(([next]) => "destination" in next)).toBe(false);
  });

  it("announces progressive artifacts and lets the brief drawer close with Escape", () => {
    const onClose = vi.fn();
    const onSave = vi.fn();
    const onFieldChange = vi.fn();
    render(
      <>
        <ProgressiveArtifactStream artifacts={[
          { id: "brand", phase: "Brand", title: "Jitterbit identity", detail: "Reading public signals", status: "ready" },
          { id: "story", phase: "Story", title: "Account narrative", detail: "Writing the first decision lens", status: "running" }
        ]} />
        <EditBriefDrawer
          open
          fields={[{ id: "audience", label: "Audience", value: "Architecture leaders" }]}
          onFieldChange={onFieldChange}
          onSave={onSave}
          onClose={onClose}
        />
      </>
    );

    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "50");
    expect(screen.getByRole("status")).toHaveAttribute("aria-atomic", "true");
    expect(screen.getByRole("status")).toHaveAttribute("aria-relevant", "text");
    expect(screen.getByRole("status")).toHaveTextContent("Working now");
    expect(screen.getByRole("status")).toHaveTextContent("Stage 2 of 2");
    expect(screen.getByRole("status")).toHaveTextContent("Turning live signals into the next build decision.");
    expect(screen.getAllByText("Working now").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("Your experience is assembling live")).toHaveAttribute("aria-busy", "true");
    fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "Platform owners" } });
    fireEvent.click(screen.getByRole("button", { name: /Update experience/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onFieldChange).toHaveBeenCalledWith("audience", "Platform owners");
    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("moves the informative build focus as stages finish", () => {
    const queued = [
      { id: "brand", phase: "Brand", title: "Public identity captured", detail: "Reading the public brand system", status: "ready" as const },
      { id: "buyer", phase: "Buyer", title: "Mapping account roles", detail: "Connecting account evidence to likely buyers", status: "running" as const },
      { id: "story", phase: "Story", title: "Composing the buyer journey", detail: "Building the narrative and proof path", status: "queued" as const }
    ];
    const { rerender } = render(<ProgressiveArtifactStream artifacts={queued} />);

    expect(screen.getAllByText("Mapping account roles").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("1 completed")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "33");
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuetext", expect.stringContaining("Working now"));

    rerender(
      <ProgressiveArtifactStream artifacts={queued.map((artifact) => ({ ...artifact, status: "ready" as const }))} />
    );
    expect(screen.getByText("Build complete")).toBeInTheDocument();
    expect(screen.getByText("All 3 build stages are complete. Your preview is ready to explore.")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "100");
    expect(screen.getByLabelText("Your experience is assembling live")).toHaveAttribute("aria-busy", "false");
  });

  it("keeps queued and failed build states clear without treating them as active work", () => {
    const { rerender, container } = render(<ProgressiveArtifactStream artifacts={[
      { id: "story", phase: "Story", title: "Composing the buyer journey", detail: "Waiting for brand signals", status: "queued" }
    ]} />);

    expect(container.querySelector('[data-build-state="queued"]')).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Up next");
    expect(screen.getByRole("status")).toHaveTextContent("Stage 1 of 1");
    expect(screen.getByRole("status")).toHaveTextContent("Standing by for the next build stage.");
    expect(screen.getByLabelText("Your experience is assembling live")).toHaveAttribute("aria-busy", "false");

    rerender(<ProgressiveArtifactStream artifacts={[
      { id: "story", phase: "Story", title: "Composing the buyer journey", detail: "The generation request could not finish", status: "failed" }
    ]} />);
    expect(container.querySelector('[data-build-state="failed"]')).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Needs attention");
    expect(screen.getByRole("status")).toHaveTextContent("Build paused — the rest of your work is safe.");
  });

  it("makes the final Experience stage unmistakable without claiming a determinate percentage", () => {
    render(<ProgressiveArtifactStream artifacts={[
      { id: "brand", phase: "Brand system", title: "Brand language reconstructed", detail: "Brand cues locked", status: "ready" },
      { id: "buyer", phase: "Buyer fit", title: "Buyer context locked", detail: "Audience locked", status: "ready" },
      { id: "strategy", phase: "Message strategy", title: "One outcome locked", detail: "Objective locked", status: "ready" },
      { id: "experience", phase: "Experience", title: "Composing the buyer journey", detail: "Composing the guided experience", status: "running" }
    ]} />);

    expect(screen.getByRole("status")).toHaveTextContent("Stage 4 of 4");
    expect(screen.getByRole("status")).toHaveTextContent("Final assembly · live");
    expect(screen.getByRole("status")).toHaveTextContent("Shaping the story · arranging proof · polishing the page");
    expect(screen.getByRole("status")).toHaveTextContent("Usually takes 30–60 seconds. Keep this page open.");
    expect(screen.getByText("Final assembly")).toBeInTheDocument();
    expect(screen.queryByText("75% assembled")).not.toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "75");
    expect(screen.getByLabelText("Your experience is assembling live")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector('[data-final-assembly="true"]')).toBeInTheDocument();
  });

  it("exposes block, tone, variant, and asset editing callbacks", () => {
    const edit = vi.fn();
    const generate = vi.fn();
    const lock = vi.fn();
    const tone = vi.fn();
    const variant = vi.fn();
    const asset = vi.fn();
    render(
      <>
        <ExperienceBlockControl blockId="hero" label="Hero promise" onEdit={edit} onGenerateOptions={generate} onLockChange={lock} />
        <ToneChips options={[{ id: "direct", label: "Direct" }, { id: "provocative", label: "Provocative" }]} selectedId="direct" onChange={tone} />
        <ExperienceVariantCards variants={[{ id: "editorial", name: "Editorial proof", eyebrow: "Layout 01", description: "A measured account narrative.", kind: "layout" }]} onSelect={variant} />
        <AssetPicker assets={[{ id: "hero-image", name: "Hero image", type: "image" }]} selectedIds={[]} onToggle={asset} />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate 3 options" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    fireEvent.click(screen.getByRole("button", { name: "Provocative" }));
    fireEvent.click(screen.getByRole("button", { name: /Editorial proof/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Hero image/i }));
    expect(edit).toHaveBeenCalledWith("hero");
    expect(generate).toHaveBeenCalledWith("hero");
    expect(lock).toHaveBeenCalledWith("hero", true);
    expect(tone).toHaveBeenCalledWith("provocative");
    expect(variant).toHaveBeenCalledWith("editorial");
    expect(asset).toHaveBeenCalledWith("hero-image", true);
  });

  it("does not promise generated alternatives when no three-option action exists", () => {
    render(
      <ExperienceBlockControl
        blockId="hero"
        label="Hero promise"
        onEdit={vi.fn()}
        onLockChange={vi.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /Generate/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Lock" })).toBeInTheDocument();
  });

  it("turns analytics from a claim into an accessible live proof surface", () => {
    const dismiss = vi.fn();
    const openPanel = vi.fn();
    const closePanel = vi.fn();
    const signal = { id: "s1", label: "Integration boundary explored", detail: "Cisco architect selected the first decision lens.", atLabel: "Just now" };
    render(
      <>
        <AnalyticsSignalToast signal={signal} open onDismiss={dismiss} onOpenPanel={openPanel} />
        <AnalyticsSignalPanel
          open
          signals={[signal]}
          engagedSeconds={18}
          sessionId="analytics-session"
          audienceLabel="Enterprise architects and platform owners"
          onClose={closePanel}
        />
      </>
    );

    expect(screen.getByText("Signal captured")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "This is what Folloze sees." })).toBeInTheDocument();
    expect(screen.getByText("Your activity in this preview")).toBeInTheDocument();
    expect(screen.getByText("Placeholder people")).toBeInTheDocument();
    expect(screen.getByText("Illustrative activity only. These names and actions are not captured leads.")).toBeInTheDocument();
    expect(screen.getByText(/John Smith spent/)).toBeInTheDocument();
    expect(screen.getAllByText(/VP Enterprise Architecture/)).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: /See what Folloze knows/i }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss signal" }));
    fireEvent.click(screen.getByRole("button", { name: "Close analytics signals" }));
    expect(openPanel).toHaveBeenCalledOnce();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(closePanel).toHaveBeenCalledOnce();
  });

  it("explains enrichment, personalization, and engagement as one Folloze value receipt", () => {
    const openSignals = vi.fn();
    render(
      <FollozeValueReceipt
        companyName="NVIDIA"
        audienceLabel="AI infrastructure leaders"
        objectiveLabel="Accelerate an opportunity"
        interactionCount={2}
        onOpenSignals={openSignals}
      />
    );

    expect(screen.getByRole("heading", { name: "From three signals to a measurable buyer journey." })).toBeInTheDocument();
    expect(screen.getByText("01 · Enriched")).toBeInTheDocument();
    expect(screen.getByText("02 · Personalized")).toBeInTheDocument();
    expect(screen.getByText("03 · Measured")).toBeInTheDocument();
    expect(screen.getByText("2 live signals captured")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Review captured engagement" }));
    expect(openSignals).toHaveBeenCalledOnce();
  });

  it("makes personalization quality, expiry value, and saved-experience actions explicit", () => {
    const onEmail = vi.fn();
    const onSave = vi.fn();
    const onOpen = vi.fn();
    const onCopy = vi.fn();
    render(
      <>
        <PersonalizationQualityReceipt score={88} companyName="Cisco" layers={[
          { id: "account", label: "Account context", detail: "Cisco signals mapped", status: "strong" },
          { id: "source", label: "Source grounding", detail: "Not required for this path", status: "not-applicable" }
        ]} />
        <ExpirySaveValuePanel expiresLabel="in 24 minutes" email="" onEmailChange={onEmail} onSave={onSave} />
        <SavedExperienceCockpit title="Jitterbit for Cisco" url="https://experience.example/cisco" updatedLabel="Updated now" metrics={[{ label: "Visitors", value: 1 }]} onOpen={onOpen} onCopy={onCopy} />
      </>
    );

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "88");
    expect(screen.getByText("Not required for this path")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Business email"), { target: { value: "buyer@company.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save and email my link" }).closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Open experience" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy experience URL" }));
    expect(onEmail).toHaveBeenCalledWith("buyer@company.com");
    expect(onSave).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledOnce();
  });
});
