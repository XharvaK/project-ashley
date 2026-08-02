import { describe, expect, it } from "vitest";
import {
  applyNetworkHardFloor,
  claimsBrowseTheater,
  claimsUnlicensedNetworkAction,
  computeNetworkActionLicense,
  isClaimLinkAsk,
  isMoltbookStatusAsk,
  isMoltbookVerifySignal,
  parseSubmoltFromMessage,
  NETWORK_HARD_FLOOR,
} from "./network-license.js";

describe("computeNetworkActionLicense", () => {
  it("starts empty — browse/post theater unlicensed", () => {
    const lic = computeNetworkActionLicense({});
    expect(lic.joinOk).toBe(false);
    expect(lic.postOk).toBe(false);
    expect(lic.browseOk).toBe(false);
    expect(lic.allowedUrls).toEqual([]);
    expect(claimsBrowseTheater("already on it.")).toBe(true);
    expect(claimsUnlicensedNetworkAction("already on it.", lic)).toBe(true);
  });

  it("allowlists claim URL only when joinOk or claim ask", () => {
    const claim = "https://www.moltbook.com/claim/abc";
    const bare = computeNetworkActionLicense({
      storedClaimUrl: claim,
    });
    expect(bare.allowedUrls).toEqual([]);

    const asked = computeNetworkActionLicense({
      storedClaimUrl: claim,
      claimLinkAsk: true,
    });
    expect(asked.allowedUrls).toContain(claim);

    const joined = computeNetworkActionLicense({
      storedClaimUrl: claim,
      joinOk: true,
    });
    expect(joined.allowedUrls).toContain(claim);
  });

  it("floors invented /p/ post URLs even if joinOk", () => {
    const claim = "https://www.moltbook.com/claim/abc";
    const lic = computeNetworkActionLicense({
      joinOk: true,
      storedClaimUrl: claim,
      allowedUrls: [claim],
    });
    const fake = "https://www.moltbook.com/p/ashley-graham/hello";
    expect(claimsUnlicensedNetworkAction(fake, lic)).toBe(true);
    expect(applyNetworkHardFloor(fake, lic)).toBe(NETWORK_HARD_FLOOR);
    expect(
      claimsUnlicensedNetworkAction(claim, lic),
    ).toBe(false);
  });

  it("post failure leaves no post URL and floors post theater", () => {
    const lic = computeNetworkActionLicense({
      postOk: false,
      allowedUrls: [],
    });
    expect(lic.allowedUrls).toEqual([]);
    expect(
      claimsUnlicensedNetworkAction(
        "i just posted my intro — https://www.moltbook.com/p/ashley-graham/hello",
        lic,
      ),
    ).toBe(true);
  });

  it("proven post URL is allowed when postOk", () => {
    const url = "https://www.moltbook.com/post/real-id-123";
    const lic = computeNetworkActionLicense({
      postOk: true,
      allowedUrls: [url],
    });
    expect(claimsUnlicensedNetworkAction(`here: ${url}`, lic)).toBe(false);
  });

  it("floors invented non-moltbook URLs without provenance", () => {
    const lic = computeNetworkActionLicense({});
    expect(
      claimsUnlicensedNetworkAction(
        "the study is at https://pubmed.ncbi.nlm.nih.gov/12345678/",
        lic,
      ),
    ).toBe(true);
  });

  it("allows URLs Doc sent this turn and safe media hosts", () => {
    const docUrl = "https://pubmed.ncbi.nlm.nih.gov/12345678/";
    const lic = computeNetworkActionLicense({ docUrls: [docUrl] });
    expect(claimsUnlicensedNetworkAction(`the study: ${docUrl}`, lic)).toBe(false);
    expect(
      claimsUnlicensedNetworkAction(
        "look at this https://media.tenor.com/floppy.gif",
        lic,
      ),
    ).toBe(false);
  });

  it("floors retry countdowns and precise retry timers", () => {
    const lic = computeNetworkActionLicense({});
    expect(claimsUnlicensedNetworkAction("retrying in 30 seconds", lic)).toBe(
      true,
    );
    expect(claimsUnlicensedNetworkAction("i'll retry in 2 minutes", lic)).toBe(
      true,
    );
    expect(
      claimsUnlicensedNetworkAction(
        "give it a couple minutes and ask again",
        lic,
      ),
    ).toBe(false);
  });
});

describe("parseSubmoltFromMessage / signals", () => {
  it("parses /m/introductions", () => {
    expect(
      parseSubmoltFromMessage(
        "introduce yourself https://www.moltbook.com/m/introductions",
      ),
    ).toBe("introductions");
  });

  it("detects claim-link ask, verify signal, and status ask", () => {
    expect(isClaimLinkAsk("send me the claim link")).toBe(true);
    expect(isMoltbookVerifySignal("ok, you are verified now.")).toBe(true);
    expect(isMoltbookStatusAsk("what's your moltbook status?")).toBe(true);
  });
});
