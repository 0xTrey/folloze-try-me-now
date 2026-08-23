// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BrandHelpRecovery,
  type BrandHelpFileKind
} from "./brand-help-recovery";

afterEach(() => {
  cleanup();
});

const approvedPrompt =
  "We found the company, but we need a clearer brand source. Add a logo, brand guide, screenshot, or a more specific page URL, and we will continue from the research already completed.";

describe("BrandHelpRecovery", () => {
  it("accepts a more specific official URL and preserves the research-resume message", () => {
    const onUrlSubmit = vi.fn();
    render(
      <BrandHelpRecovery
        onUrlSubmit={onUrlSubmit}
        onFileSubmit={vi.fn()}
      />
    );

    expect(screen.getByText(approvedPrompt)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Your earlier research is preserved. Add one source to resume."
    );

    fireEvent.change(screen.getByLabelText("More specific official page URL"), {
      target: { value: "https://company.example/products/official-offer" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue with this source" }));

    expect(onUrlSubmit).toHaveBeenCalledWith("https://company.example/products/official-offer");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Brand source received. Resuming from the research already completed."
    );
  });

  const acceptedFiles: readonly {
    kind: BrandHelpFileKind;
    option: string;
    inputLabel: string;
    file: File;
  }[] = [
    {
      kind: "logo",
      option: "Logo image",
      inputLabel: "Choose a logo image",
      file: new File(["logo"], "company-logo.svg", { type: "image/svg+xml" })
    },
    {
      kind: "brand_guide",
      option: "Brand guide PDF",
      inputLabel: "Choose a brand guide PDF",
      file: new File(["guide"], "brand-guide.pdf", { type: "application/pdf" })
    },
    {
      kind: "screenshot",
      option: "Homepage screenshot",
      inputLabel: "Choose a homepage screenshot",
      file: new File(["screenshot"], "homepage.webp", { type: "image/webp" })
    }
  ];

  it.each(acceptedFiles)("accepts a $kind file with its typed callback", ({ kind, option, inputLabel, file }) => {
    const onFileSubmit = vi.fn();
    render(
      <BrandHelpRecovery
        onUrlSubmit={vi.fn()}
        onFileSubmit={onFileSubmit}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: option }));
    fireEvent.change(screen.getByLabelText(inputLabel), {
      target: { files: [file] }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue with this source" }));

    expect(onFileSubmit).toHaveBeenCalledWith({ kind, file });
  });

  it("fails soft for an invalid URL without invoking a callback", () => {
    const onUrlSubmit = vi.fn();
    render(
      <BrandHelpRecovery
        onUrlSubmit={onUrlSubmit}
        onFileSubmit={vi.fn()}
      />
    );

    fireEvent.change(screen.getByLabelText("More specific official page URL"), {
      target: { value: "company.example/products" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Continue with this source" }));

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Enter a full official page URL beginning with http:// or https://."
    );
    expect(onUrlSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Your earlier research is preserved");
  });

  it("fails soft for an invalid file without invoking a callback", () => {
    const onFileSubmit = vi.fn();
    render(
      <BrandHelpRecovery
        onUrlSubmit={vi.fn()}
        onFileSubmit={onFileSubmit}
      />
    );

    fireEvent.click(screen.getByRole("radio", { name: "Logo image" }));
    fireEvent.change(screen.getByLabelText("Choose a logo image"), {
      target: { files: [new File(["not an image"], "notes.txt", { type: "text/plain" })] }
    });

    expect(screen.getByRole("alert")).toHaveTextContent("Choose a PNG, JPG, WebP, or SVG file.");
    expect(screen.getByRole("button", { name: "Continue with this source" })).toBeDisabled();
    expect(onFileSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Your earlier research is preserved");
  });
});
