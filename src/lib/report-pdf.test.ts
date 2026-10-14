// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toSvg } from "html-to-image";
import { renderReportPdfPreview } from "./report-pdf";

vi.mock("html-to-image", () => ({ toSvg: vi.fn() }));
const { draw } = vi.hoisted(() => ({ draw: vi.fn() }));
vi.mock("jspdf", async (importOriginal) => {
  const original = await importOriginal<typeof import("jspdf")>();
  return {
    jsPDF: class extends original.jsPDF {
      constructor(options: ConstructorParameters<typeof original.jsPDF>[0]) {
        super(options);
      }
    },
  };
});

const png =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4XmP4DwQACfsD/YcUtbcAAAAASUVORK5CYII=";

describe("report PDF preview", () => {
  beforeEach(() => {
    draw.mockReset();
    vi.mocked(toSvg).mockResolvedValue("data:image/svg+xml,fixture");
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        set src(_value: string) {
          queueMicrotask(() => this.onload?.());
        }
      },
    );
    Object.defineProperty(document, "fonts", {
      configurable: true,
      value: { ready: Promise.resolve() },
    });
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage: draw,
      fillRect: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(png);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function reportElement(width = 500, height = 1500) {
    const element = document.createElement("article");
    Object.defineProperties(element, {
      scrollWidth: { value: width },
      scrollHeight: { value: height },
    });
    return element;
  }

  it("renders every captured row into a genuine multipage PDF preview", async () => {
    const result = await renderReportPdfPreview(reportElement());
    expect(result).toBeInstanceOf(Blob);
    expect(result.type).toBe("application/pdf");
    expect(result.size).toBeGreaterThan(0);
    expect(draw).toHaveBeenNthCalledWith(
      2,
      expect.any(HTMLCanvasElement),
      0,
      0,
      1000,
      1457,
      0,
      0,
      1000,
      1457,
    );
    expect(draw).toHaveBeenNthCalledWith(
      3,
      expect.any(HTMLCanvasElement),
      0,
      1457,
      1000,
      1457,
      0,
      0,
      1000,
      1457,
    );
    expect(draw).toHaveBeenNthCalledWith(
      4,
      expect.any(HTMLCanvasElement),
      0,
      2914,
      1000,
      86,
      0,
      0,
      1000,
      86,
    );
  });

  it("rejects empty captures rather than rendering an empty report", async () => {
    await expect(renderReportPdfPreview(reportElement(0))).rejects.toThrow("empty");
  });

  it("propagates capture failures without a success-shaped preview fallback", async () => {
    vi.mocked(toSvg).mockRejectedValue(new Error("Capture unavailable"));
    await expect(renderReportPdfPreview(reportElement())).rejects.toThrow("Capture unavailable");
  });
});
