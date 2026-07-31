import type { SessionAnswers, UseCase } from "@/lib/types";

export function primaryActionFor(input: {
  useCase: UseCase;
  objective: string;
  campaignType?: SessionAnswers["campaignType"];
}): string {
  const normalized = input.objective.toLowerCase();
  if (/meeting|working session|book|accelerate|decision/.test(normalized)) return "Plan the working session";
  if (/registr|attend|rsvp/.test(normalized)) return "Save your place";
  if (input.campaignType === "event") return "Continue the event conversation";
  if (input.campaignType === "product" || /launch|announce|introduce/.test(normalized)) return "Explore the first use case";
  if (/demand/.test(normalized)) return "Explore the offer";
  if (input.useCase === "content" && /qualified|capture/.test(normalized)) return "Apply the framework";
  if (input.useCase === "content" && /engagement/.test(normalized)) return "Choose your path";
  if (input.useCase === "content" || /educate/.test(normalized)) return "Explore the key ideas";
  return "Explore the operating path";
}
