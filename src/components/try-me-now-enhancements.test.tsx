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
  CtaDestinationControl,
  DevicePreviewToolbar,
  EditBriefDrawer,
  EntryPathMicroDemo,
  ExperienceBlockControl,
  ExperienceVariantCards,
  ExpirySaveValuePanel,
  InstantBrandLockStrip,
  MessageDirectionControl,
  PersonalizationQualityReceipt,
  ProgressiveArtifactStream,
  SavedExperienceCockpit,
  ToneChips
} from "./try-me-now-enhancements";

afterEach(() => cleanup());

describe("Try Me Now prospect enhancement components", () => {
  it("supports a primary entry path and a separate example-mode action", () => {
    const onSelect = vi.fn();
    const onExample = vi.fn();
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
          demoSteps: ["Seller", "Account signal", "1:1 experience"]
        }}
        onSelect={onSelect}
        onExample={onExample}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Build a 1:1 experience/i }));
    fireEvent.click(screen.getByRole("button", { name: /See a Cisco example/i }));
    expect(onSelect).toHaveBeenCalledWith("abm");
    expect(onExample).toHaveBeenCalledWith("abm");
  });

  it("shows an instant brand lock and confirms source facts", () => {
    const inspect = vi.fn();
    const confirm = vi.fn();
    const replace = vi.fn();
    render(
      <>
        <InstantBrandLockStrip
          status="locked"
          brand={{ companyName: "Jitterbit", domain: "jitterbit.com", colors: ["#0c2f3d", "#f15b35"], positioning: "Enterprise automation, governed." }}
          onInspect={inspect}
        />
        <ContentSourceConfirmation
          source={{ title: "Jitterbit MCP for Enterprise AI", sourceLabel: "Public product page", host: "jitterbit.com", facts: ["Governed agent access", "Reusable enterprise capabilities"] }}
          onConfirm={confirm}
          onReplace={replace}
        />
      </>
    );

    expect(screen.getByText("Brand system locked")).toBeInTheDocument();
    expect(screen.getByText("Governed agent access")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Inspect signals" }));
    fireEvent.click(screen.getByRole("button", { name: "Use this source" }));
    fireEvent.click(screen.getByRole("button", { name: "Use another source" }));
    expect(inspect).toHaveBeenCalledOnce();
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

  it("keeps optional message direction and the real CTA destination controlled", () => {
    const onMessage = vi.fn();
    const onCta = vi.fn();
    render(
      <>
        <MessageDirectionControl value={{ enabled: true, belief: "Fragmentation creates risk.", action: "Map the first boundary." }} onChange={onMessage} />
        <CtaDestinationControl value={{ type: "meeting", label: "Book the workshop", destination: "https://example.com/book" }} onChange={onCta} />
      </>
    );

    fireEvent.change(screen.getByLabelText("What should the buyer believe?"), { target: { value: "Governed connections create leverage." } });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));
    fireEvent.change(screen.getByLabelText("Destination URL"), { target: { value: "https://example.com/register" } });
    expect(onMessage).toHaveBeenCalledWith(expect.objectContaining({ belief: "Governed connections create leverage." }));
    expect(onCta).toHaveBeenCalledWith(expect.objectContaining({ type: "registration" }));
    expect(onCta).toHaveBeenCalledWith(expect.objectContaining({ destination: "https://example.com/register" }));
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
    expect(screen.getByText("Building now")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Audience"), { target: { value: "Platform owners" } });
    fireEvent.click(screen.getByRole("button", { name: /Update experience/i }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onFieldChange).toHaveBeenCalledWith("audience", "Platform owners");
    expect(onSave).toHaveBeenCalledOnce();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("exposes block, tone, variant, asset, and device editing callbacks", () => {
    const edit = vi.fn();
    const generate = vi.fn();
    const lock = vi.fn();
    const tone = vi.fn();
    const variant = vi.fn();
    const asset = vi.fn();
    const device = vi.fn();
    render(
      <>
        <ExperienceBlockControl blockId="hero" label="Hero promise" onEdit={edit} onGenerateOptions={generate} onLockChange={lock} />
        <ToneChips options={[{ id: "direct", label: "Direct" }, { id: "provocative", label: "Provocative" }]} selectedId="direct" onChange={tone} />
        <ExperienceVariantCards variants={[{ id: "editorial", name: "Editorial proof", eyebrow: "Layout 01", description: "A measured account narrative.", kind: "layout" }]} onSelect={variant} />
        <AssetPicker assets={[{ id: "hero-image", name: "Hero image", type: "image" }]} selectedIds={[]} onToggle={asset} />
        <DevicePreviewToolbar device="desktop" onDeviceChange={device} />
      </>
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Generate options" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock" }));
    fireEvent.click(screen.getByRole("button", { name: "Provocative" }));
    fireEvent.click(screen.getByRole("button", { name: /Editorial proof/i }));
    fireEvent.click(screen.getByRole("checkbox", { name: /Hero image/i }));
    fireEvent.click(screen.getByRole("button", { name: "Mobile" }));
    expect(edit).toHaveBeenCalledWith("hero");
    expect(generate).toHaveBeenCalledWith("hero");
    expect(lock).toHaveBeenCalledWith("hero", true);
    expect(tone).toHaveBeenCalledWith("provocative");
    expect(variant).toHaveBeenCalledWith("editorial");
    expect(asset).toHaveBeenCalledWith("hero-image", true);
    expect(device).toHaveBeenCalledWith("mobile");
  });

  it("turns analytics from a claim into an accessible live proof surface", () => {
    const dismiss = vi.fn();
    const openPanel = vi.fn();
    const closePanel = vi.fn();
    const signal = { id: "s1", label: "Integration boundary explored", detail: "Cisco architect selected the first decision lens.", atLabel: "Just now" };
    render(
      <>
        <AnalyticsSignalToast signal={signal} open onDismiss={dismiss} onOpenPanel={openPanel} />
        <AnalyticsSignalPanel open signals={[signal]} engagedSeconds={18} onClose={closePanel} />
      </>
    );

    expect(screen.getByText("Signal captured")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "This is what Folloze sees." })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /See what Folloze knows/i }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss signal" }));
    fireEvent.click(screen.getByRole("button", { name: "Close analytics signals" }));
    expect(openPanel).toHaveBeenCalledOnce();
    expect(dismiss).toHaveBeenCalledOnce();
    expect(closePanel).toHaveBeenCalledOnce();
  });

  it("makes personalization quality, expiry value, and saved-experience actions explicit", () => {
    const onEmail = vi.fn();
    const onSave = vi.fn();
    const onOpen = vi.fn();
    const onCopy = vi.fn();
    render(
      <>
        <PersonalizationQualityReceipt score={88} companyName="Cisco" layers={[{ id: "account", label: "Account context", detail: "Cisco signals mapped", status: "strong" }]} />
        <ExpirySaveValuePanel expiresLabel="in 24 minutes" email="" onEmailChange={onEmail} onSave={onSave} />
        <SavedExperienceCockpit title="Jitterbit for Cisco" url="https://experience.example/cisco" updatedLabel="Updated now" metrics={[{ label: "Visitors", value: 1 }]} onOpen={onOpen} onCopy={onCopy} />
      </>
    );

    expect(screen.getByRole("meter")).toHaveAttribute("aria-valuenow", "88");
    fireEvent.change(screen.getByLabelText("Business email"), { target: { value: "buyer@company.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Save and email my link" }).closest("form")!);
    fireEvent.click(screen.getByRole("button", { name: "Open experience" }));
    fireEvent.click(screen.getByRole("button", { name: "Copy URL" }));
    expect(onEmail).toHaveBeenCalledWith("buyer@company.com");
    expect(onSave).toHaveBeenCalledOnce();
    expect(onOpen).toHaveBeenCalledOnce();
    expect(onCopy).toHaveBeenCalledOnce();
  });
});
