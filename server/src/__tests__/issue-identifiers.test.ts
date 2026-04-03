import { describe, expect, it } from "vitest";
import {
  nextCompanyIssueCounterForIdentity,
  resolveExplicitIssueIdentity,
} from "../services/issues.ts";

describe("issue identifier overrides", () => {
  it("derives issue number from an explicit identifier that matches the company prefix", () => {
    expect(resolveExplicitIssueIdentity("ACME", { identifier: "acme-23" })).toEqual({
      identifier: "ACME-23",
      issueNumber: 23,
    });
  });

  it("builds an identifier from an explicit issue number", () => {
    expect(resolveExplicitIssueIdentity("ACME", { issueNumber: 41 })).toEqual({
      identifier: "ACME-41",
      issueNumber: 41,
    });
  });

  it("rejects identifiers that do not match the company prefix", () => {
    expect(() => resolveExplicitIssueIdentity("ACME", { identifier: "OPS-7" })).toThrow(
      "Issue identifier must match the company prefix ACME",
    );
  });

  it("only advances the company counter when the imported issue number is ahead", () => {
    expect(nextCompanyIssueCounterForIdentity(12, { issueNumber: 23 })).toBe(23);
    expect(nextCompanyIssueCounterForIdentity(12, { issueNumber: 7 })).toBe(12);
  });
});
