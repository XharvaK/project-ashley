import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchArticleText } from "./read.js";

function mockResponse(
  body: string,
  {
    status = 200,
    url = "https://example.com/a",
    type = "text/html; charset=utf-8",
  }: { status?: number; url?: string; type?: string } = {},
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    url,
    headers: { get: (k: string) => (k === "content-type" ? type : null) },
    text: async () => body,
  } as unknown as Response;
}

function articlePage(url: string, words = 80): string {
  return `<html><article>${"word ".repeat(words)}</article></html>`;
}

const SUBSTACK_SHELL = `<html><head><title>Share</title>
<script>window.x = {"canonical_url\\":\\"https://pub.example.com/p/the-real-article\\"};</script>
<meta property="og:url" content="https://substack.example/@user/p-193177777">
</head><body>SpiralSeekr @spiralseekr 5 subscribers</body></html>`;

describe("fetchArticleText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns the article and its URL when the page renders one", async () => {
    const fetchMock = vi.fn(async () => mockResponse(articlePage("https://x")));
    vi.stubGlobal("fetch", fetchMock);
    const got = await fetchArticleText("https://example.com/a", 1000);
    expect(got?.text).toContain("word");
    expect(got?.url).toBe("https://example.com/a");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches the canonical article from a shell share page", async () => {
    const calls: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        calls.push(String(url));
        if (String(url).includes("substack.example/@user/p-193177777")) {
          return mockResponse(SUBSTACK_SHELL, {
            url: "https://substack.example/@user/p-193177777",
          });
        }
        if (String(url).includes("pub.example.com/p/the-real-article")) {
          return mockResponse(articlePage("https://pub.example.com/p/the-real-article"), {
            url: "https://pub.example.com/p/the-real-article",
          });
        }
        return mockResponse("nope", { status: 404 });
      }),
    );
    const got = await fetchArticleText(
      "https://substack.example/@user/p-193177777",
      1000,
      { enforceSafeHost: true },
    );
    expect(got?.url).toBe("https://pub.example.com/p/the-real-article");
    expect(got?.text).toContain("word");
    expect(calls).toHaveLength(2);
  });

  it("does not loop when the canonical points back at the requested URL", async () => {
    const fetchMock = vi.fn(async () =>
      mockResponse(
        `<html><link rel="canonical" href="https://example.com/a">chrome only</html>`,
        { url: "https://example.com/a" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const got = await fetchArticleText("https://example.com/a", 1000);
    expect(got).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null for a shell page with no canonical target", async () => {
    const fetchMock = vi.fn(async () =>
      mockResponse("<html><body>5 subscribers, no article</body></html>"),
    );
    vi.stubGlobal("fetch", fetchMock);
    const got = await fetchArticleText("https://example.com/shell", 1000);
    expect(got).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns null on non-ok responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => mockResponse("nope", { status: 404 })));
    expect(await fetchArticleText("https://example.com/missing", 1000)).toBeNull();
  });

  it("returns null on non-html content types", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        mockResponse("pdf bytes", { type: "application/pdf" }),
      ),
    );
    expect(await fetchArticleText("https://example.com/a.pdf", 1000)).toBeNull();
  });
});
